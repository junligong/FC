#!/usr/bin/env node
/**
 * browser-triage.mjs — FC 项目浏览器通道确定性分诊与有界自愈
 *
 * 背景（2026-09-18 实测）：07/08/09 三轮小时任务连续失败，历史证据把失败归因为
 * 「:9222 监听 socket 未接入 DevTools 消息泵」，依据是 `/json/version` 等路径返回裸 404。
 * 该归因**已被证伪**——通道恢复健康后，这些路径**依然**返回 `404 Content-Length: 0`。
 * 即：**裸 404 是开关模式的正常表现，不能作为故障判据**；唯一的可用性判据仍是 check-deps 退出码。
 *
 * 本脚本把「check-deps 超时 2m17s → pkill 代理 → 反复复跑」的无效试错（实测单轮约 7 分钟）
 * 收敛为一次有界（通常 ≤45s，最坏 ≤100s）的确定性判定，并按**证据支持的顺序**做最多一次自愈。
 *
 * 允许的副作用（仅此两种，且每次运行各自最多一次）：
 *   1) `open -a "Google Chrome"`（无 URL）—— 把 Chrome 推到前台/确保存在浏览器窗口。
 *      2026-09-18 10:20 实测：执行后 check-deps 由 exit 1 转为 exit 0，通道恢复。
 *      **注意禁止使用带 URL 的形式**：`open -a "Google Chrome" chrome://inspect/#remote-debugging`
 *      在受限环境下返回 -10820 而**不产生任何效果**（07/08/09 三轮的自动补救因此全部空转）。
 *   2) 仅当显式传入 `--allow-proxy-restart` 时，才允许 `pkill -f cdp-proxy.mjs` 一次。
 *      默认关闭：对本次故障形态，重启代理被实测证明无效（4 个独立实例同样 non-101）。
 *
 * 不做：不 kill / 重启 Chrome，不写 run-state，不写任何产物，不改 config.env。
 *
 * 用法：
 *   node automation/browser-triage.mjs                  # 分诊 + 有界自愈（采集任务默认用法）
 *   node automation/browser-triage.mjs --no-remedy      # 纯观测，不做任何自愈动作
 *   node automation/browser-triage.mjs --allow-proxy-restart
 *   node automation/browser-triage.mjs --json           # 仅输出 JSON（供写失败证据文件）
 *
 * 退出码：0 = 通道可用；1 = 通道不可用（需人工或已 failed）；2 = 配置问题
 */

import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { request } from 'node:http';
import { execFileSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const CHROME_DIR = path.join(homedir(), 'Library/Application Support/Google/Chrome');
const LOCAL_STATE = path.join(CHROME_DIR, 'Local State');
const ACTIVE_PORT = path.join(CHROME_DIR, 'DevToolsActivePort');
const SKILL_ROOT = path.join(homedir(), '.workbuddy/skills/web-access');
const CONFIG_ENV = path.join(SKILL_ROOT, 'config.env');
const CHECK_DEPS = path.join(SKILL_ROOT, 'scripts/check-deps.mjs');
const PROXY_PORT = Number(process.env.CDP_PROXY_PORT || 3456);

/** check-deps 健康时 2–5 秒返回；其自身最坏耗时约 2m17s。40 秒足以区分，并把单轮成本压到约 1/3。 */
const CHECK_BUDGET_MS = 40_000;

const argv = process.argv.slice(2);
const AS_JSON = argv.includes('--json');
const NO_REMEDY = argv.includes('--no-remedy');
const ALLOW_PROXY_RESTART = argv.includes('--allow-proxy-restart');

/** 仅供自检注入：`--port <n>` 覆盖 :9222 探测端口，`--check-deps <path>` 覆盖自检脚本。 */
function argValue(flag) {
  const i = argv.indexOf(flag);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  const pref = argv.find((a) => a.startsWith(`${flag}=`));
  return pref ? pref.slice(flag.length + 1) : null;
}
const PORT_OVERRIDE = Number(argValue('--port')) || null;
const CHECK_DEPS_OVERRIDE = argValue('--check-deps');

// 独立调试 profile 模式（2026-09-18 新增，无人值守零弹框）：
// 当 config.env 设了 CDP_DEBUG_PORT 时，采集走独立调试 profile（端口 9333），不再依赖
// chrome://inspect 开关模式（后者每连接一次弹一次授权框）。此时本脚本的探测/自愈都切换到该端口。
const DEBUG_PROFILE_PORT = (() => {
  if (PORT_OVERRIDE) return null; // 显式 --port 覆盖优先
  if (!existsSync(CONFIG_ENV)) return null;
  const m = readFileSync(CONFIG_ENV, 'utf8').match(/^\s*CDP_DEBUG_PORT\s*=\s*(\d+)\s*$/m);
  return m ? Number(m[1]) : null;
})();
const DEBUG_PROFILE_START = path.join(process.cwd(), 'automation/start-debug-profile.mjs');

const actions = [];

// ---------------------------------------------------------------- 基础工具

/** 单次 HTTP 探测；{ code, contentLength, body }，code 0 = 连接层失败。
 *  外层硬超时竞速：Upgrade 类请求在畸形响应下可能既不 emit end 也不触发 socket timeout。 */
function probe(port, urlPath, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 3500;
  return Promise.race([
    probeInner(port, urlPath, opts),
    new Promise((resolve) =>
      setTimeout(() => resolve({ code: 0, contentLength: -1, body: '', note: 'hard-timeout' }), timeoutMs + 1200),
    ),
  ]);
}

function probeInner(port, urlPath, { upgrade = false, timeoutMs = 3500 } = {}) {
  return new Promise((resolve) => {
    const headers = upgrade
      ? {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
        }
      : {};
    const settle = (note) => resolve({ code: 0, contentLength: -1, body: '', ...(note ? { note } : {}) });
    const req = request(
      { host: '127.0.0.1', port, path: urlPath, method: 'GET', headers, timeout: timeoutMs },
      (res) => {
        let body = '';
        res.on('data', (c) => {
          if (body.length < 400) body += c.toString('utf8');
        });
        const done = (note) => {
          const r = {
            code: res.statusCode,
            contentLength: Number(res.headers['content-length'] ?? -1),
            body: body.slice(0, 200),
          };
          resolve(note ? { ...r, note } : r);
        };
        res.on('end', () => done());
        res.on('close', () => done('closed-without-end'));
      },
    );
    req.on('timeout', () => {
      req.destroy();
      settle('timeout');
    });
    req.on('error', (e) => settle(e.code || e.message));
    req.end();
  });
}

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function readActivePort() {
  try {
    const lines = readFileSync(ACTIVE_PORT, 'utf8').split('\n');
    const port = Number(lines[0]?.trim());
    const wsPath = lines[1]?.trim() || '';
    return Number.isFinite(port) && port > 0 ? { port, wsPath } : null;
  } catch {
    return null;
  }
}

function readPreferredBrowser() {
  if (!existsSync(CONFIG_ENV)) return { value: null, state: 'missing' };
  const m = readFileSync(CONFIG_ENV, 'utf8').match(/^\s*WEB_ACCESS_BROWSER\s*=\s*(.*)$/m);
  const value = (m?.[1] ?? '').trim();
  return { value, state: value ? 'set' : 'empty' };
}

function runCheckDeps(timeoutMs = CHECK_BUDGET_MS) {
  const script = CHECK_DEPS_OVERRIDE || CHECK_DEPS;
  if (!existsSync(script)) return { ran: false, exitCode: null, tail: `${script} 不存在` };
  try {
    const out = execFileSync(process.execPath, [script], {
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ran: true, exitCode: 0, tail: out.trim().split('\n').slice(-3).join(' | ') };
  } catch (e) {
    if (e.killed || e.signal === 'SIGTERM') {
      return { ran: true, exitCode: -1, tail: `check-deps 超过 ${Math.round(timeoutMs / 1000)}s 未返回（健康时应 2–5s）` };
    }
    const merged = `${e.stdout || ''}${e.stderr || ''}`.trim();
    return {
      ran: true,
      exitCode: typeof e.status === 'number' ? e.status : -1,
      tail: merged.split('\n').slice(-3).join(' | '),
    };
  }
}

/** 把 Chrome 推到前台/确保存在窗口。**必须不带 URL**（带 URL 的 -10820 空转已被实测证伪）。 */function activateChrome() {
  try {
    execFileSync('open', ['-a', 'Google Chrome'], { encoding: 'utf8', timeout: 15_000 });
    actions.push({ action: 'open -a "Google Chrome"', at: new Date().toISOString(), result: 'rc=0' });
    return true;
  } catch (e) {
    actions.push({
      action: 'open -a "Google Chrome"',
      at: new Date().toISOString(),
      result: `失败：${(e.stderr || e.message || '').toString().trim().slice(0, 120)}`,
    });
    return false;
  }
}

/** 独立 profile 模式的自愈：拉起独立调试 profile Chrome（detached，零弹框）。 */
function activateDebugProfile() {
  if (!existsSync(DEBUG_PROFILE_START)) {
    actions.push({ action: `start-debug-profile.mjs`, at: new Date().toISOString(), result: `失败：${DEBUG_PROFILE_START} 不存在` });
    return false;
  }
  try {
    execFileSync(process.execPath, [DEBUG_PROFILE_START], { encoding: 'utf8', timeout: 30_000 });
    actions.push({ action: 'start-debug-profile.mjs', at: new Date().toISOString(), result: 'rc=0' });
    return true;
  } catch (e) {
    actions.push({
      action: 'start-debug-profile.mjs',
      at: new Date().toISOString(),
      result: `失败：${(e.stderr || e.message || '').toString().trim().slice(0, 120)}`,
    });
    return false;
  }
}

/**
 * 顺带记录一次通道状态样本（2026-09-18 新增，用于量测「调试授权弹框」频率）。
 * 依据：cdp-proxy 在 WS 断开时会 `managedTabs.clear()`，因此**相邻两次样本间 managedTabs
 * 从非 0 掉到 0** 即说明期间发生过一次重连（= 一次授权弹框）。这是**不需要重启代理**就能
 * 开始测量重连的路径；重启代理才能生效的 JSONL 连接日志（见 browser-channel-watch.mjs）是补充。
 * 失败绝不影响分诊结果。
 */
function appendChannelSample(report) {
  const dir = path.join(process.cwd(), 'automation/runs/browser-channel-log');
  mkdirSync(dir, { recursive: true });
  const day = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  const rec = {
    ts: new Date().toISOString(),
    source: 'triage',
    verdict: report.verdict,
    connected: report.proxy?.health?.connected ?? null,
    sessions: report.proxy?.health?.sessions ?? null,
    managedTabs: report.proxy?.health?.managedTabs ?? null,
    proxyPid: listenPidOf(PROXY_PORT),
    chromePid: listenPidOf(DEBUG_PROFILE_PORT || 9222),
    chromeListener: report.chrome?.listener ?? null,
    checkDepsExit: report.checkDeps?.exitCode ?? null,
  };
  appendFileSync(path.join(dir, `${day}.jsonl`), JSON.stringify(rec) + '\n');
}

/** 持有该 LISTEN 端口的进程 PID（不用 ps —— 本机沙箱可能禁用 ps）。 */
function listenPidOf(port) {
  try {
    const out = execFileSync('/usr/sbin/lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], {
      encoding: 'utf8',
      timeout: 8000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const line = out.split('\n').slice(1).find((l) => l.trim());
    return line ? Number(line.trim().split(/\s+/)[1]) || null : null;
  } catch {
    return null;
  }
}

async function probeChromeSide() {
  // 独立 profile 模式：探测 DEBUG_PROFILE_PORT（9333），忽略日常 Chrome 的 DevToolsActivePort。
  if (DEBUG_PROFILE_PORT) {
    const port = DEBUG_PROFILE_PORT;
    const [jsonVersion, jsonList, root] = await Promise.all([
      probe(port, '/json/version'),
      probe(port, '/json/list'),
      probe(port, '/'),
    ]);
    const listener = [jsonVersion, jsonList, root].some((r) => r.code !== 0);
    return { activePort: null, port, jsonVersion, jsonList, root, wsUpgrade: { code: 0, contentLength: -1, body: '', note: 'debug-profile' }, listener };
  }
  const ap = readActivePort();
  const port = PORT_OVERRIDE ?? ap?.port ?? 9222;
  const [jsonVersion, jsonList, root, wsUpgrade] = await Promise.all([
    probe(port, '/json/version'),
    probe(port, '/json/list'),
    probe(port, '/'),
    ap?.wsPath
      ? probe(port, ap.wsPath, { upgrade: true })
      : Promise.resolve({ code: 0, contentLength: -1, body: '', note: 'no-ws-path' }),
  ]);
  const listener = [jsonVersion, jsonList, root].some((r) => r.code !== 0);
  return { activePort: ap, port, jsonVersion, jsonList, root, wsUpgrade, listener };
}

/** 代理侧附加信息（只读；失败不影响判定） */
async function probeProxy() {
  const health = await new Promise((resolve) => {
    const req = request(
      { host: '127.0.0.1', port: PROXY_PORT, path: '/health', method: 'GET', timeout: 4000 },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(b));
          } catch {
            resolve({ raw: b.slice(0, 120) });
          }
        });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
    req.end();
  });
  const targets = await new Promise((resolve) => {
    const req = request(
      { host: '127.0.0.1', port: PROXY_PORT, path: '/targets', method: 'GET', timeout: 5000 },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(b);
            resolve(Array.isArray(j) ? j.length : null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
    req.end();
  });
  return { health, targetCount: targets };
}

// ---------------------------------------------------------------- 判定 + 有界自愈

const preferred = readPreferredBrowser();
const localState = readJson(LOCAL_STATE);
const userEnabled = Boolean(localState?.devtools?.remote_debugging?.['user-enabled']);

let verdict;
let exitCode;
let remedy;
let forbidden;
let chromeSide = await probeChromeSide();
let checkDeps = { ran: false, exitCode: null, tail: '未运行' };

const HUMAN_THREE_STEPS = [
  '人工三步：① 完全退出 Chrome（⌘Q，必要时强制退出）② 重新打开 Chrome（正常启动）'
    + ' ③ 在 chrome://inspect/#remote-debugging 重新勾选 “Allow remote debugging for this browser instance”。',
];
/** Chrome 144+ 的调试授权气泡按**连接**次数弹出且无法持久化（官方 wont-fix），未点即连接失败。 */
const CONSENT_HINT =
  '若 Chrome 弹出「要允许远程调试吗？〔取消〕〔允许〕」气泡，请点击「允许」（最多等约 30 秒）：'
  + '该气泡按**连接**次数出现、无法持久化（Chrome 144+ 设计行为），未点即连接失败——这是"要手动确认否则会失败"的机制。'
  + '降低它出现频率的唯一办法是让 cdp-proxy 常驻不重启、并且不无谓重启 Chrome（每次重连=一次弹框）。';
const NEVER_DO = [
  '不要用 `open -a "Google Chrome" chrome://inspect/...`（带 URL 形式返回 -10820，空转无效）',
  '不要在未证明 Chrome 侧异常时反复 pkill cdp-proxy.mjs',
  '不要反复复跑 check-deps（失败时每轮固定约 2m17s，结论不变）',
  '不要 kill / 重启用户日常 Chrome，不要改用其他浏览器',
  '不要用旧日期、FC26 或其他来源的旧快照填充当日结果',
  ...(DEBUG_PROFILE_PORT
    ? ['独立调试 profile（端口 ' + DEBUG_PROFILE_PORT + '）是唯一采集通道，不要回退到 chrome://inspect 开关模式（会弹框）']
    : ['不要新建独立 profile']),
];

if (preferred.state === 'empty') {
  verdict = 'CONFIG_MISSING';
  exitCode = 2;
  remedy = [`把 ${CONFIG_ENV} 的 WEB_ACCESS_BROWSER 设为 chrome（留空会让无人值守任务卡在「询问偏好」而失败）。`];
  forbidden = ['改用其他浏览器', '新建 profile'];
} else {
  checkDeps = runCheckDeps();

  if (checkDeps.exitCode === 0) {
    verdict = 'OK';
    exitCode = 0;
    remedy = ['通道可用，按契约继续采集。'];
    forbidden = [];
  } else if (checkDeps.exitCode === 2) {
    verdict = 'CONFIG_MISSING';
    exitCode = 2;
    remedy = [`check-deps 报 exit 2：${checkDeps.tail}；把 WEB_ACCESS_BROWSER 固化为 chrome。`];
    forbidden = ['改用其他浏览器', '新建 profile'];
  } else {
    // 通道不可用：按证据顺序做最多一次自愈。
    // 独立 profile 模式 → 拉起独立 profile Chrome；开关模式 → 激活日常 Chrome。
    let recovered = null;
    if (!NO_REMEDY) {
      if (DEBUG_PROFILE_PORT) {
        activateDebugProfile();
      } else {
        activateChrome();
      }
      await new Promise((r) => setTimeout(r, 3000));
      const retry = runCheckDeps();
      if (retry.exitCode === 0) recovered = { by: DEBUG_PROFILE_PORT ? 'start-debug-profile.mjs（拉起独立 profile）' : 'open -a "Google Chrome"（激活/确保窗口）', checkDeps: retry };
      else if (ALLOW_PROXY_RESTART) {
        try {
          execFileSync('pkill', ['-f', 'cdp-proxy.mjs'], { encoding: 'utf8', timeout: 10_000 });
          actions.push({ action: 'pkill -f cdp-proxy.mjs', at: new Date().toISOString(), result: 'rc=0' });
        } catch (e) {
          actions.push({
            action: 'pkill -f cdp-proxy.mjs',
            at: new Date().toISOString(),
            result: `失败：${(e.message || '').toString().slice(0, 80)}`,
          });
        }
        const retry2 = runCheckDeps();
        if (retry2.exitCode === 0) recovered = { by: 'pkill cdp-proxy + 复跑 check-deps', checkDeps: retry2 };
        else checkDeps = retry2;
      } else {
        checkDeps = retry;
      }
    }

    if (recovered) {
      verdict = 'OK_RECOVERED';
      exitCode = 0;
      remedy = [`通道经自愈恢复：${recovered.by}。按契约继续采集；请在最终回复中注明本次发生了自愈。`];
      forbidden = NEVER_DO;
    } else if (!chromeSide.listener) {
      verdict = 'TOGGLE_OFF';
      exitCode = 1;
      remedy = DEBUG_PROFILE_PORT
        ? [
            `独立调试 profile（端口 ${DEBUG_PROFILE_PORT}）无监听，可能被回收/退出。`,
            '可先执行 `node automation/start-debug-profile.mjs` 拉起，再复跑本脚本；',
            '独立 profile 零弹框，无需人工勾选开关。',
          ]
        : [
            ':9222 无监听（连接被拒/超时），调试开关未开。',
            '可先执行 `open -a "Google Chrome"` 确保浏览器已启动/有窗口，再复跑本脚本；',
            ...HUMAN_THREE_STEPS,
            CONSENT_HINT,
          ];
      forbidden = NEVER_DO;
    } else {
      verdict = 'CHANNEL_UNSERVING';
      exitCode = 1;
      remedy = DEBUG_PROFILE_PORT
        ? [
            `独立调试 profile（端口 ${DEBUG_PROFILE_PORT}）已监听但通道不可用（check-deps exit ${checkDeps.exitCode}），自动自愈无效。`,
            '尝试 `node automation/start-debug-profile.mjs --restart` 后复跑；',
            '完成后下一整点任务自动恢复；本轮按契约立即 failed 留证，不采集、不填充。',
          ]
        : [
            `:9222 已监听但通道不可用（check-deps exit ${checkDeps.exitCode}），自动自愈（激活 Chrome）无效。`,
            CONSENT_HINT,
            ...HUMAN_THREE_STEPS,
            '完成后下一整点任务自动恢复；本轮按契约立即 failed 留证，不采集、不填充。',
          ];
      forbidden = NEVER_DO;
    }
  }
}

const proxySide = await probeProxy();

const report = {
  generatedAt: new Date().toISOString(),
  verdict,
  exitCode,
  actions,
  checkDeps,
  chrome: {
    port: chromeSide.port,
    listener: chromeSide.listener,
    wsPath: chromeSide.activePort?.wsPath || null,
    activePortFilePresent: Boolean(chromeSide.activePort),
    localStateUserEnabled: userEnabled,
  },
  probes: {
    jsonVersion: chromeSide.jsonVersion,
    jsonList: chromeSide.jsonList,
    root: chromeSide.root,
    wsUpgrade: chromeSide.wsUpgrade,
  },
  proxy: { port: PROXY_PORT, ...proxySide },
  config: preferred,
  logFile: path.join(tmpdir(), 'cdp-proxy.log'),
  remedy,
  forbidden,
  caveats: [
    '裸 404（Content-Length: 0）出现在 /json/version、/json/list、/ 上属**正常**，不得据此判定故障；'
      + 'WS 直探同样可能非 101。唯一可用性判据是 check-deps 退出码。',
    userEnabled
      ? 'Local State 的 user-enabled=true **不足以保证**本实例可用（2026-09-18 实测），不得据此判定通道可用。'
      : null,
  ].filter(Boolean),
};

if (AS_JSON) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`${exitCode === 0 ? '✅' : '❌'} browser-triage: ${verdict}`);
  console.log(`   check-deps exit=${checkDeps.exitCode}${checkDeps.tail ? ` | ${checkDeps.tail}` : ''}`);
  console.log(`   chrome :${chromeSide.port} listener=${chromeSide.listener} ws=${chromeSide.wsUpgrade.code} targets=${proxySide.targetCount ?? 'n/a'}`);
  console.log(`   probes : /json/version=${chromeSide.jsonVersion.code} /json/list=${chromeSide.jsonList.code} /=${chromeSide.root.code}（仅诊断，不判健康）`);
  console.log(`   config : WEB_ACCESS_BROWSER=${preferred.value || '(空)'}`);
  for (const a of actions) console.log(`   action : ${a.action} → ${a.result}`);
  for (const c of report.caveats) console.log(`   ⚠ ${c}`);
  console.log('   处置：');
  for (const line of remedy) console.log(`     - ${line}`);
  if (forbidden.length) {
    console.log('   禁止：');
    for (const line of forbidden) console.log(`     ✗ ${line}`);
  }
}

// 顺带记一条通道状态样本（量测调试授权弹框频率用；失败不影响分诊结论）
try {
  appendChannelSample(report);
} catch { /* 采样失败忽略 */ }

process.exit(exitCode);
