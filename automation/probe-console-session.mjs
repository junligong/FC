#!/usr/bin/env node
// 作用：探测 DuMate 浏览器扩展会话中的百度智能云控制台登录态（只读判据，不携带、不保存任何凭据）。
// 输出：stdout 打印 JSON {"loggedIn":boolean,"reason":string}。
// 判据：在 console.bce.baidu.com 域内用 fetch 调 publish 管理 API（空 body，无副作用），
//       返回「登录凭证已过期」或未授权即视为未登录；接口仅用于探测，不发送任何业务内容。
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const home = os.homedir();
const xdgBase = path.join(home, 'Library/Application Support/qianfan-desktop-app/qianfan_desk_xdg');
const contexts = [];
if (fs.existsSync(xdgBase)) {
  for (const entry of fs.readdirSync(xdgBase)) {
    const data = path.join(xdgBase, entry, 'data');
    if (fs.existsSync(path.join(data, 'dumate-browser', '.browser-extension-relay-token'))) contexts.push(data);
  }
}
function aliveRelay(data) {
  const dir = path.join(data, 'pids', 'browser-extension-relay');
  if (!fs.existsSync(dir)) return false;
  for (const file of fs.readdirSync(dir)) {
    if (!/^relay-(\d+)\.pid$/.test(file)) continue;
    let pid = Number(file.match(/^relay-(\d+)\.pid$/)[1]);
    try {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Number.isInteger(parsed.pid)) pid = parsed.pid;
    } catch { /* 二进制或空内容则用文件名数字 */ }
    try { process.kill(pid, 0); return true; } catch { /* 进程不存在 */ }
  }
  return false;
}
const alive = contexts.filter(aliveRelay);
const chosen = alive.length === 1 ? alive[0] : (contexts.length === 1 ? contexts[0] : null);
if (!chosen) {
  console.log(JSON.stringify({ loggedIn: false, reason: '无法唯一确定 DuMate 认证上下文(' + contexts.length + ', alive=' + alive.length + ')' }));
  process.exit(0);
}
const env = {
  ...process.env,
  PATH: '/opt/homebrew/bin:' + (process.env.PATH || ''),
  XDG_DATA_HOME: chosen,
};
// 在 login 标签页内执行只读会话探测。tab-resume 会把当前流切到该标签，影响并行流；
// 为避免副作用，优先只读当前已有标签，找不到 login 标签则直接判未登录并附原因。
const probeCode = 'async page => { try { const res = await page.evaluate(async () => { const r = await fetch("/api/dumate/artifacts/manage/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); return { status: r.status, text: (await r.text()).slice(0, 600) }; }); return JSON.stringify(res); } catch (e) { return JSON.stringify({ error: String(e).slice(0, 300) }); } }';
let raw;
try {
  raw = execFileSync('dumate-browser-cli', ['run-code', probeCode, '--json'], { env, encoding: 'utf8', timeout: 30000 });
} catch (error) {
  console.log(JSON.stringify({ loggedIn: false, reason: 'run-code 失败: ' + error.message }));
  process.exit(0);
}
// 结果位于 "### Result\n<value>" 段；JSON 对象仅在最后一行携带 ok/elapsed，不是结果本体。
const resultMatch = raw.match(/### Result\s*\n(.*?)(?:\n### |$)/s);
const resultBody = resultMatch ? resultMatch[1].trim() : '';
let verdict = { loggedIn: false, reason: '无法解析探测结果' };
try {
  // CLI 的 Result 是双重 JSON：先 parse 得到字符串，再 parse 才是 {status,text}。兼容两种形态。
  let parsed = JSON.parse(resultBody);
  if (typeof parsed === 'string') parsed = JSON.parse(parsed);
  const text = typeof parsed.text === 'string' ? parsed.text : JSON.stringify(parsed);
  if (parsed.status === 200 && text.includes('登录凭证已过期')) {
    verdict = { loggedIn: false, reason: '控制台会话凭证已过期，需重新登录' };
  } else if (parsed.status === 200 && (text.includes('"success":true') || text.includes('"success": true'))) {
    verdict = { loggedIn: true, reason: '控制台会话可用' };
  } else {
    verdict = { loggedIn: false, reason: '控制台会话未就绪: HTTP ' + parsed.status + ' ' + text.slice(0, 120) };
  }
} catch { verdict = { loggedIn: false, reason: '探测结果非 JSON 或为空: ' + resultBody.slice(0, 120) }; }
console.log(JSON.stringify(verdict));