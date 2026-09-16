/* 作用：本轮 news 采集的临时编排脚本（一次性，位于 work 目录）。
 * 输入：apps/news/sources.txt 的账号主页；CDP Proxy http://localhost:3456（web-access 技能通道）。
 * 主要输出：automation/runs/2026-09-16/news/work/dom-timelines.json
 *   { collectedAt, sources:[{handle,url,openedAt,dataCutoff,rendered,tweets:[...]}] }
 * 说明：只做「打开页面 + 执行 apps/news/extract-timeline.js + 落盘」，不做任何媒体解析。
 */
import fs from 'node:fs';
import path from 'node:path';

const PROXY = 'http://localhost:3456';
const ROOT = '/Users/wuyanzu/Desktop/FC';
const OUT = path.join(ROOT, 'automation/runs/2026-09-16/news/work/dom-timelines.json');
const EXTRACTOR = fs.readFileSync(path.join(ROOT, 'apps/news/extract-timeline.js'), 'utf8');

const sources = fs.readFileSync(path.join(ROOT, 'apps/news/sources.txt'), 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const url = (line.match(/https?:\/\/\S+/) || [''])[0];
    const handle = url ? url.split('/').filter(Boolean).pop() : '';
    return { handle, url };
  })
  .filter((s) => s.url);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', body });
  return res.text();
}

async function newTab(url) {
  const raw = await post(`${PROXY}/new`, url);
  return JSON.parse(raw).targetId;
}

async function evalIn(target, code) {
  const raw = await fetch(`${PROXY}/eval?target=${target}`, { method: 'POST', body: code }).then((r) => r.text());
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: `eval 返回不可解析: ${raw.slice(0, 200)}` };
  }
  if (typeof parsed.value === 'string') return JSON.parse(parsed.value);
  return parsed;
}

async function closeTab(target) {
  try {
    await fetch(`${PROXY}/close?target=${target}`);
  } catch { /* 忽略关闭失败 */ }
}

const results = [];
const collectedAt = new Date().toISOString();

for (const src of sources) {
  const record = { handle: src.handle, url: src.url, openedAt: null, dataCutoff: null, rendered: 0, tweets: [], error: null };
  let target = null;
  try {
    target = await newTab(src.url);
    // 轮询等待：最多 25 秒，等到页面出现 article[data-testid="tweet"]
    let articles = 0;
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      await sleep(1200);
      const probe = await fetch(`${PROXY}/eval?target=${target}`, {
        method: 'POST',
        body: 'JSON.stringify({ready:document.readyState,n:document.querySelectorAll(\'article[data-testid="tweet"]\').length,login:!!document.querySelector(\'[data-testid="SideNav_AccountSwitcher_Button"]\')})',
      }).then((r) => r.text());
      try {
        const val = JSON.parse(JSON.parse(probe).value);
        articles = val.n;
        if (val.n > 0 && val.ready !== 'loading') break;
      } catch { /* 继续等 */ }
    }
    // 保证有帧推进，避免后台标签页骨架占位（DOM 文本也需要出帧）
    await fetch(`${PROXY}/screenshot?target=${target}&file=/tmp/fc-news-frame.png`).catch(() => {});
    await sleep(600);
    const extracted = await evalIn(target, EXTRACTOR);
    if (extracted && extracted.error) {
      record.error = extracted.error;
    } else {
      record.tweets = extracted.tweets || [];
      record.rendered = extracted.count || 0;
    }
  } catch (err) {
    record.error = String(err && err.message ? err.message : err);
  } finally {
    record.openedAt = record.openedAt || new Date().toISOString();
    record.dataCutoff = new Date().toISOString();
    if (target) await closeTab(target);
  }
  results.push(record);
  process.stderr.write(`[${results.length}/${sources.length}] ${src.handle} rendered=${record.rendered} kept=${record.tweets.length}${record.error ? ' ERR=' + record.error : ''}\n`);
}

fs.writeFileSync(OUT, JSON.stringify({ collectedAt, sources: results }, null, 1));
process.stderr.write(`written ${OUT}\n`);
