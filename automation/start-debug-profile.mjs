#!/usr/bin/env node
// start-debug-profile.mjs — 用 detached 方式启动独立调试 profile Chrome（零弹框、常驻）
//
// 背景：Chrome 144+ 在 chrome://inspect 开关模式下每建立一条 DevTools 连接就弹一次
// 「要允许远程调试吗？」且无法持久化。无人值守自动化任务无法点弹框 → 阻塞约 30 秒后失败。
// 唯一彻底免弹框的路径是用「非默认 --user-data-dir」启动独立调试 profile（社区实测零弹窗）。
//
// 关键：用 spawn({ detached: true }) + child.unref() 让 Chrome 脱离当前进程/会话，
// 成为由 launchd 收养的常驻进程，不随 agent 会话结束而被回收。
// （`nohup ... &` 或 `run_in_background` 在沙箱/非交互环境会被回收，进程秒退，勿用。）
//
// 用法：
//   node automation/start-debug-profile.mjs            # 启动（已运行则跳过）
//   node automation/start-debug-profile.mjs --restart  # 强制重启
//   node automation/start-debug-profile.mjs --status   # 查看状态

import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE_DIR = path.join(homedir(), 'Library/Application Support/Google/Chrome-FC-Debug');
const DEBUG_PORT = 9333;
const LOG_FILE = path.join(homedir(), '.workbuddy/logs/chrome-fc-debug.log');
const LSOF = '/usr/sbin/lsof';

const ACTION = process.argv[2] || 'start';

function listenPid(port) {
  try {
    const out = execFileSync(LSOF, ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], {
      encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'],
    });
    const line = out.split('\n').slice(1).find((l) => l.trim());
    return line ? Number(line.trim().split(/\s+/)[1]) || null : null;
  } catch {
    return null;
  }
}

function isRunning() {
  return listenPid(DEBUG_PORT) !== null;
}

function status() {
  const pid = listenPid(DEBUG_PORT);
  if (pid) {
    console.log(`✅ 独立调试 profile 运行中（端口 ${DEBUG_PORT}，PID ${pid}）`);
  } else {
    console.log(`❌ 独立调试 profile 未运行（端口 ${DEBUG_PORT}）`);
  }
  return pid;
}

if (ACTION === '--status') {
  status();
  process.exit(isRunning() ? 0 : 1);
}

if (ACTION === '--restart') {
  try { execFileSync('pkill', ['-f', 'Chrome-FC-Debug'], { timeout: 10000 }); } catch {}
  // 清理崩溃残留的锁文件
  for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    const p = path.join(PROFILE_DIR, f);
    if (existsSync(p)) { try { require('node:fs').unlinkSync(p); } catch {} }
  }
  console.log('已停止并清理旧实例');
} else if (isRunning()) {
  console.log('独立调试 profile 已在运行，跳过启动');
  status();
  process.exit(0);
}

// detached 启动，脱离当前进程
const child = spawn(CHROME, [
  `--user-data-dir=${PROFILE_DIR}`,
  `--remote-debugging-port=${DEBUG_PORT}`,
  '--no-sandbox',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-networking',
], {
  detached: true,
  stdio: 'ignore',
});

child.unref();

// 等待端口就绪（最多 15 秒）
for (let i = 0; i < 15; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  if (isRunning()) {
    console.log(`✅ 独立调试 profile 已就绪（端口 ${DEBUG_PORT}）`);
    console.log(`   profile: ${PROFILE_DIR}`);
    console.log(`   日志:    ${LOG_FILE}`);
    process.exit(0);
  }
}

console.error(`❌ 启动超时，请检查日志: ${LOG_FILE}`);
process.exit(1);
