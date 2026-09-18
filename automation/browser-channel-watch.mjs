#!/usr/bin/env node
/**
 * browser-channel-watch.mjs — 量测「Chrome 调试授权弹框」的真实频率
 *
 * ## 为什么需要它
 * Chrome 144+ 在 `chrome://inspect/#remote-debugging` 开关模式下，会弹出
 * 「要允许远程调试吗？〔取消〕〔允许〕」并要求手动确认；**授权无法持久化**（Chrome 官方把
 * "记住选择" 的功能请求关闭为 wont-fix）。若不确认，连接阻塞并在约 30 秒后失败——
 * 这就是本项目"要手动确认，否则会失败"的机制。
 *
 * 目前尚需区分两种触发口径（决定修法完全不同）：
 *   (a) **按连接**：每新建一条 DevTools 连接弹一次 → 修法是让代理常驻、不重连；
 *   (b) **按标签页**：每 `Target.createTarget`（即 `/new` 开新页）弹一次 → 修法是复用单标签页
 *       导航（`/navigate`）而不是每页都开新标签。
 *
 * ## 数据来源
 * `cdp-proxy.mjs`（2026-09-18 起）会把连接生命周期写成带时间戳的 JSONL 事件，
 * 路径：`$CDP_PROXY_JOURNAL` 或 `~/.workbuddy/logs/cdp-proxy-journal.jsonl`。
 * 事件：`proxy-start` / `connect-ok` / `connect-fail` / `ws-closed` / `target-create`。
 *
 * 这套仪器**不依赖任何定时器**：代理本身就是长期运行的观察者。代价是——仪器只记录
 * **未来**发生的事件；若代理长期不重连，`connect-ok` 就会长期为 0（这本身就是结论）。
 *
 * ## 用法
 *   node automation/browser-channel-watch.mjs --report          # 聚合报告（主要用途）
 *   node automation/browser-channel-watch.mjs --report --json   # 机器可读
 *   node automation/browser-channel-watch.mjs --sample          # 采样一次通道状态（PID/连通性）
 *
 * 本脚本从不做修复动作：不改配置、不重启代理/浏览器、不写 run-state。
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { request } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SAMPLE_DIR = path.join(ROOT, 'automation/runs/browser-channel-log');
const JOURNAL_FILE = process.env.CDP_PROXY_JOURNAL
  || path.join(homedir(), '.workbuddy', 'logs', 'cdp-proxy-journal.jsonl');
const PROXY_PORT = Number(process.env.CDP_PROXY_PORT || 3456);
const CHROME_PORT = 9222;
const LSOF = '/usr/sbin/lsof';
const TZ_OFFSET_MS = 8 * 3600_000; // 报告按北京时间展示

const argv = process.argv.slice(2);
const AS_JSON = argv.includes('--json');

function localHourKey(iso) {
  return new Date(Date.parse(iso) + TZ_OFFSET_MS).toISOString().slice(0, 13).replace('T', ' ');
}
function localStamp(iso) {
  return new Date(Date.parse(iso) + TZ_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ');
}

function readJsonl(file) {
  if (!existsSync(file)) return [];
  const out = [];
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line));
      } catch {
        /* 跳过损坏行 */
      }
    }
  } catch {
    /* 读不到就当作空 */
  }
  return out;
}

// ---------------------------------------------------------------- 采样（可选）

function get(pathname, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const req = request({ host: '127.0.0.1', port: PROXY_PORT, path: pathname, method: 'GET', timeout: timeoutMs }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(b));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

/** 持有该 LISTEN 端口的进程 PID；不依赖 ps（本机沙箱可能禁用 ps）。 */
function listenPid(port) {
  try {
    const out = execFileSync(LSOF, ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], {
      encoding: 'utf8',
      timeout: 8000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const line = out.split('\n').slice(1).find((l) => l.trim());
    if (!line) return null;
    const pid = line.trim().split(/\s+/)[1];
    return pid ? Number(pid) : null;
  } catch {
    return null;
  }
}

async function sample() {
  const ts = new Date().toISOString();
  const health = await get('/health');
  const rec = {
    ts,
    source: 'sample',
    proxyReachable: Boolean(health),
    connected: health?.connected ?? null,
    sessions: health?.sessions ?? null,
    managedTabs: health?.managedTabs ?? null,
    proxyPid: listenPid(PROXY_PORT),
    chromePid: listenPid(CHROME_PORT),
  };
  mkdirSync(SAMPLE_DIR, { recursive: true });
  const file = path.join(SAMPLE_DIR, `${new Date(Date.now() + TZ_OFFSET_MS).toISOString().slice(0, 10)}.jsonl`);
  appendFileSync(file, JSON.stringify(rec) + '\n');
  return rec;
}

// ---------------------------------------------------------------- 聚合报告

function report() {
  const events = readJsonl(JOURNAL_FILE);
  const samples = existsSync(SAMPLE_DIR)
    ? readdirSync(SAMPLE_DIR).filter((f) => f.endsWith('.jsonl')).sort().flatMap((f) => readJsonl(path.join(SAMPLE_DIR, f)))
    : [];

  const count = (ev) => events.filter((e) => e.event === ev).length;
  const connectOk = events.filter((e) => e.event === 'connect-ok');
  const targetCreate = events.filter((e) => e.event === 'target-create');

  const byHour = (list) => {
    const m = {};
    for (const e of list) m[localHourKey(e.ts)] = (m[localHourKey(e.ts)] || 0) + 1;
    return m;
  };

  // 状态样本序列的重连反推：cdp-proxy 在 WS 断开时会 managedTabs.clear()，
  // 故相邻样本间 managedTabs 从非 0 → 0（且代理 PID 未变）即说明期间发生过一次重连。
  const ordered = [...samples].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const suspected = [];
  for (let i = 1; i < ordered.length; i++) {
    const p = ordered[i - 1];
    const c = ordered[i];
    if (p.proxyPid && c.proxyPid && p.proxyPid !== c.proxyPid) {
      suspected.push({ ts: c.ts, kind: 'proxy-restart', detail: `${p.proxyPid} → ${c.proxyPid}` });
      continue;
    }
    if (p.chromePid && c.chromePid && p.chromePid !== c.chromePid) {
      suspected.push({ ts: c.ts, kind: 'chrome-restart', detail: `${p.chromePid} → ${c.chromePid}` });
      continue;
    }
    if (p.managedTabs > 0 && c.managedTabs === 0 && c.connected === true) {
      suspected.push({ ts: c.ts, kind: 'ws-reset(疑似重连)', detail: `managedTabs ${p.managedTabs} → 0` });
    }
  }

  const summary = {
    journalFile: JOURNAL_FILE,
    journalExists: existsSync(JOURNAL_FILE),
    journalSpan: events.length ? { from: events[0].ts, to: events[events.length - 1].ts } : null,
    events: { total: events.length, 'proxy-start': count('proxy-start'), 'connect-ok': count('connect-ok'), 'connect-fail': count('connect-fail'), 'ws-closed': count('ws-closed'), 'target-create': count('target-create') },
    dialogsIfPerConnection: connectOk.length,
    dialogsIfPerTab: targetCreate.length,
    perHour: { 'connect-ok': byHour(connectOk), 'target-create': byHour(targetCreate) },
    samples: samples.length,
    suspectedReconnects: suspected,
    note: events.length === 0
      ? '日志为空：仪器只记录未来事件，需等下一次代理启动或新建标签页才会出现数据；期间请改看下方状态样本的重连反推。'
      : undefined,
  };

  if (AS_JSON) {
    console.log(JSON.stringify({ ...summary, raw: events }, null, 2));
    return;
  }

  console.log(`连接事件日志：${JOURNAL_FILE}`);
  if (!events.length) {
    console.log('  ⚠ 连接事件日志暂无数据。该日志只记录**未来**事件，需等下一次代理启动才生效；');
    console.log('    期间改用下方「状态样本重连反推」（分诊每次运行都会记一条，无需重启代理）。');
    console.log('');
  }

  if (events.length) {
    console.log(`  区间：${localStamp(events[0].ts)} → ${localStamp(events[events.length - 1].ts)}（${events.length} 条事件）`);
    console.log('');
    console.log('  预期弹框次数：');
    console.log(`    按「连接」计：${connectOk.length} 次   （connect-ok —— 弹框措辞为「完全控制此 Chrome 会话」，属浏览器级授权，按连接计）`);
    console.log(`    （对照：新建标签页 ${targetCreate.length} 次 —— 已证伪，不触发额外弹框）`);
    console.log('');
    console.log('  其他事件：');
    console.log(`    代理启动 ${count('proxy-start')} ｜ 连接失败 ${count('connect-fail')} ｜ 连接断开 ${count('ws-closed')}`);
    console.log('');
    const hc = summary.perHour['connect-ok'];
    const ht = summary.perHour['target-create'];
    const hours = [...new Set([...Object.keys(hc), ...Object.keys(ht)])].sort();
    console.log('  按小时分布（北京时间）：');
    for (const h of hours) {
      console.log(`    ${h}:00   连接 ${hc[h] || 0} 次 ｜ 新建标签 ${ht[h] || 0} 次`);
    }
    console.log('');
    console.log('  事件明细（最近 40 条）：');
    for (const e of events.slice(-40)) {
      console.log(`    ${localStamp(e.ts)}  ${e.event}${e.reason ? ' | ' + e.reason : ''}${e.targetId ? ' | ' + e.targetId.slice(0, 12) : ''}`);
    }
  }

  // 状态样本（分诊每次运行各记一条）——不依赖代理重启，可立即开始反推重连
  console.log('');
  console.log(`  状态样本：${ordered.length} 条` + (ordered.length ? `（${localStamp(ordered[0].ts)} → ${localStamp(ordered[ordered.length - 1].ts)}）` : ''));
  if (!suspected.length) {
    if (ordered.length) console.log('    未发现代理/Chrome 重启或 WS 重置 ⇒ 采样区间内**没有**发生重连。');
  } else {
    console.log(`    疑似重连 / 重启 ${suspected.length} 次（每次约等于一次弹框）：`);
    for (const s of suspected) console.log(`      ${localStamp(s.ts)}  ${s.kind}  ${s.detail}`);
  }
  if (ordered.length) {
    const s = ordered[ordered.length - 1];
    console.log(`    最近一条：${localStamp(s.ts)} connected=${s.connected} managedTabs=${s.managedTabs} proxyPid=${s.proxyPid} chromePid=${s.chromePid}`);
  }
}

// ---------------------------------------------------------------- main

if (argv.includes('--report')) report();
else if (argv.includes('--sample')) console.log(JSON.stringify(await sample()));
else {
  console.log('用法：--report（聚合报告）｜ --sample（采样一次通道状态）');
  console.log(`日志路径：${JOURNAL_FILE}`);
  console.log(`文件存在：${existsSync(JOURNAL_FILE)}｜ 事件条数：${readJsonl(JOURNAL_FILE).length}`);
}
