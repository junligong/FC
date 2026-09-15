#!/usr/bin/env node
// FC27 资讯报告生成器
// 功能：解析原始推文数据 → 过滤FC27相关 → 排除预测类 → 内容聚类去重 → 翻译为中文 → 生成图文HTML
import { readFileSync, writeFileSync, readdirSync, existsSync, copyFileSync, mkdirSync, renameSync, statSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { root, reportDate, atomicWrite, readJSON } from '../../shared/lib/runtime.mjs';

const DATA_DIR = path.join(root, 'apps/news/data');
const today = reportDate(process.env.FC_REPORT_DATE);
const DAILY_FILE = path.join(DATA_DIR, `tweets-${today}.json`);
const WORK_DIR = path.join(root, 'automation/runs', today, 'news', 'work', `generate-${process.pid}`);
mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(WORK_DIR, { recursive: true });
const SEEN_FILE = path.join(DATA_DIR, 'seen_tweets.json');
const FILTERED_FILE = path.join(DATA_DIR, 'filtered_tweets.json');
const REPORTS_DIR = path.join(root, 'reports/daily', today);
mkdirSync(REPORTS_DIR, { recursive: true });

// ========== 1. 解析原始推文数据 ==========
// 从 dumate-browser-cli eval 输出中提取 JSON
function extractTweetsFromOutput(output) {
  const tweets = [];
  // Match "### Result\n<json_string>" pattern across the full output
  let validResults = 0;
  const resultRegex = /### Result\s*\n(.+)/g;
  let m;
  while ((m = resultRegex.exec(output)) !== null) {
    try {
      let s = m[1].trim();
      // The result is a JSON-encoded string (double-encoded by browser CLI)
      if (s.startsWith('"') && s.endsWith('"')) {
        s = JSON.parse(s);
      }
      const data = JSON.parse(s);
      if (Array.isArray(data.tweets)) { validResults++; tweets.push(...data.tweets); }
    } catch {}
  }
  if (!validResults) throw new Error('未解析到有效的采集结果，保留旧报告');
  return tweets;
}

// Read raw output file
const rawFile = path.join(DATA_DIR, 'raw_tweets_latest.json');
const rawOutput = readFileSync(rawFile, 'utf8');
if (!/### Result\s*\n/.test(rawOutput)) throw new Error('采集输出无有效结果，保留旧报告和去重数据');
const allTweets = extractTweetsFromOutput(rawOutput);
const cutoff = Date.now() - 24 * 3600 * 1000;

// Deduplicate by ID
const unique = [];
const uniqueIds = new Set();
for (const t of allTweets) {
  if (!t.id || !Number.isFinite(Date.parse(t.timestamp)) || Date.parse(t.timestamp) < cutoff || Date.parse(t.timestamp) > Date.now()) continue;
  t.images = Array.isArray(t.images) ? t.images : [];
  t.text = t.text || '';
  if (uniqueIds.has(t.id)) continue;
  uniqueIds.add(t.id);
  unique.push(t);
}

// ========== 2. 过滤FC27相关 ==========
const fc27Keywords = [
  /fc\s*27/i, /ea\s*fc/i, /#fc27/i, /fut\b/i, /ultimate\s*team/i,
  /icon\b/i, /hero\b/i, /sbc\b/i, /evolution/i, /futties/i,
  /pre[\s-]*season/i, /varane/i, /ferdinand/i, /fifa\b/i,
  /futbin/i, /futwiz/i, /fut\s*police/i, /fut\s*sheriff/i,
  /fut\s*scoreboard/i, /fut\s*coin/i, /fut\s*trading/i,
  /base\s*icon/i, /card/i, /rated/i, /ovr/i, /playstyle/i,
  /anticipate/i, /bruiser/i, /intercept/i, /reward/i,
  /token/i, /pick/i, /whistle\s*event/i
];

const excludeKeywords = [
  /gta\s*(6|vi)/i, /grand\s*theft\s*auto/i, /rockstar/i,
  /interactive\s*brokers/i, /ibkr/i, /stock\s*screener/i,
  /manga/i, /comic/i
];

function isFC27Related(tweet) {
  const text = tweet.text || '';
  const author = (tweet.author || '') + ' ' + (tweet.handle || '');
  const combined = text + ' ' + author;
  for (const re of excludeKeywords) {
    if (re.test(combined)) return false;
  }
  for (const re of fc27Keywords) {
    if (re.test(combined)) return true;
  }
  const futAccounts = [
    'fifa_romania', 'FUTWIZ', 'FutPoliceLeaks', 'Fut_scoreboard',
    'AsyFutTrader', 'FGZNews', 'FUTCoinShop', 'FutSheriff',
    'Jake_FutTrading', 'OOCFutbin_'
  ];
  if (futAccounts.includes(tweet.handle)) return true;
  return false;
}

const fc27Tweets = unique.filter(isFC27Related);

// ========== 3. 排除预测类 ==========
const predictionKeywords = [
  /predict/i, /prediction/i, /how\s*much\s*(will|do|can)\s+(this|these|they)\s+cost/i,
  /how\s*much\s*do\s*we\s*think/i, /how\s*much\s*will\s*(this|these|they)\s*cost/i,
  /guess\s+(what|how|which)/i, /speculate/i,
  /who's\s*next/i, /what's\s*next/i,
  /leak.*predict/i, /predict.*leak/i
];

function isPrediction(tweet) {
  const text = tweet.text || '';
  for (const re of predictionKeywords) {
    if (re.test(text)) return true;
  }
  return false;
}

const nonPrediction = fc27Tweets.filter(t => !isPrediction(t));

// 过滤视频推文（无图片且无文本的推文可能是纯视频，无法在报告中展示）
const nonVideo = nonPrediction.filter(t => {
  if (t.hasVideo) return false;
  if (!t.images || t.images.length === 0) {
    if (!t.text || t.text.trim().length === 0) return false;
  }
  return true;
});

// ========== 4. 跨次去重 ==========
const seenData = readJSON(SEEN_FILE, { tweets: [], last_updated: null, version: '1.0' });
if (!Array.isArray(seenData.tweets)) throw new Error('去重记录结构错误，禁止清空历史');
const seenIds = new Set(seenData.tweets.map(t => t.id));
const newTweetsRaw = nonVideo.filter(t => !seenIds.has(t.id));

// ========== 5. 内容聚类去重 ==========
function extractTopicKey(text) {
  const lower = (text || '').toLowerCase();
  const keys = [];
  const players = ['varane', 'ferdinand', 'bruno fernandes', 'ronaldo', 'messi', 'mbappe', 'haaland'];
  for (const p of players) {
    if (lower.includes(p)) keys.push(p);
  }
  const cardTypes = ['base icon', 'icon', 'hero', 'futties', 'pre-season', 'pre season', 'whistle event', 'evolution', 'sbc'];
  for (const c of cardTypes) {
    if (lower.includes(c)) keys.push(c);
  }
  if (lower.includes('reward') || lower.includes('token') || lower.includes('pick')) keys.push('reward');
  if (lower.includes('pre-order') || lower.includes('preorder')) keys.push('preorder');
  return keys.sort().join('+');
}

function contentSimilarity(t1, t2) {
  const k1 = extractTopicKey(t1.text);
  const k2 = extractTopicKey(t2.text);
  if (!k1 || !k2) return false;
  if (k1 === k2 && (t1.text || '').trim() === (t2.text || '').trim()) return true;
  const s1 = new Set(k1.split('+'));
  const s2 = new Set(k2.split('+'));
  const intersection = [...s1].filter(x => s2.has(x));
  // 主题相同不代表同一事件；只合并完全相同的正文。
  return false;
}

function infoScore(t) {
  return (t.text || '').length + t.images.length * 200;
}

const clusters = [];
for (const t of newTweetsRaw) {
  let matched = false;
  for (const cluster of clusters) {
    if (contentSimilarity(t, cluster[0])) {
      cluster.push(t);
      matched = true;
      break;
    }
  }
  if (!matched) clusters.push([t]);
}

const newTweets = [];
const allClusterIds = [];
for (const cluster of clusters) {
  cluster.sort((a, b) => infoScore(b) - infoScore(a));
  newTweets.push(cluster[0]);
  for (const t of cluster) allClusterIds.push(t.id);
}

// ========== 6. 翻译为中文 ==========
// 使用 AI 模型翻译每条推文
function translateTweet(text, handle) {
  if (!text || text.trim().length === 0) return '';
  
  // 使用千帆 API 翻译（优先 DuMate 代理，无需 API key）
  try {
    const prompt = `将以下英文推文翻译为中文，保留原文的语气和表情符号，只输出翻译结果不要解释：\n\n${text}`;
    const proxyBase = process.env.DUMATE_QIANFAN_PROXY || '';
    const apiUrl = proxyBase
      ? proxyBase.replace(/\/?$/, '/') + 'v2/chat/completions'
      : 'https://qianfan.cloud.baidu.com/v2/chat/completions';
    let authKey = '';
    if (!proxyBase) {
      try { authKey = readFileSync(path.join(root, 'apps/news/.api_key'), 'utf8').trim(); } catch {}
    }
    const requestBody = JSON.stringify({
      model: "ernie-4.0-turbo-8k",
      messages: [{role: "user", content: prompt}],
      temperature: 0.1,
      max_output_tokens: 500
    });
    if (!proxyBase && !authKey) throw new Error('未配置翻译服务');
    const headers = ['-H', 'Content-Type: application/json'];
    if (authKey) headers.push('-H', `Authorization: Bearer ${authKey}`);
    const result = execFileSync('curl', ['--fail', '--silent', '--show-error', '--max-time', '25',
      '-X', 'POST', apiUrl, ...headers, '--data-binary', '@-'],
      { input: requestBody, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
    const resp = JSON.parse(result);
    if (resp.choices && resp.choices[0] && resp.choices[0].message) {
      return resp.choices[0].message.content.trim();
    }
  } catch (e) {
    console.error(`Translation API failed for tweet, falling back to manual: ${e.message}`);
  }
  
  return ''; // 翻译失败保留原文，明确标记待翻译，不能伪装为中文翻译。
}

console.log(`Translating ${newTweets.length} tweets...`);
for (const t of newTweets) {
  if (t.text && t.text.trim().length > 0) {
    // Skip translation if already has a valid Chinese translation (e.g., from patch)
    if (t.translation && t.translation !== t.text && /[\u4e00-\u9fff]/.test(t.translation)) {
      console.log(`  @${t.handle}: [cached] ${(t.translation || '').substring(0, 50)}...`);
      continue;
    }
    t.translation = translateTweet(t.text, t.handle);
    console.log(`  @${t.handle}: ${(t.translation || '').substring(0, 50)}...`);
  } else {
    t.translation = '';
  }
}

// ========== 7. 更新去重数据 ==========
seenData.tweets = [...seenData.tweets, ...newTweetsRaw.map(t => ({
  id: t.id,
  textPreview: t.text.substring(0, 100),
  handle: t.handle,
  collectedAt: new Date().toISOString()
}))];
seenData.last_updated = new Date().toISOString();
// 报告成功发布后才提交去重记录。

// ========== 8. 生成HTML报告 ==========
let previous = readJSON(DAILY_FILE, null);
if (!previous && existsSync(path.join(REPORTS_DIR, 'news.html')) && existsSync(FILTERED_FILE)) {
  const legacy = readJSON(FILTERED_FILE, {tweets: []});
  // 迁移当前日报已有的卡片，防止首次升级时被重跑覆盖。
  const legacyDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(statSync(FILTERED_FILE).mtime);
  if (legacyDate !== today || !Array.isArray(legacy.tweets)) throw new Error('当日报告缺少对应快照，无法安全重跑；请先恢复当日数据');
  previous = legacy;
}
const merged = new Map((previous?.tweets || []).map(t => [t.id, t]));
for (const tweet of newTweets) merged.set(tweet.id, tweet);
const reportTweets = [...merged.values()];
const snapshot = JSON.stringify({date: today, count: reportTweets.length, tweets: reportTweets}, null, 2);
const pendingData = path.join(WORK_DIR, 'pending-tweets.json');
writeFileSync(pendingData, snapshot);
const reportFile = path.join(REPORTS_DIR, 'news.html');
const pendingReport = `${reportFile}.${process.pid}.tmp`;

// Generate HTML (inline Python for template rendering)
const htmlTemplate = `#!/usr/bin/env python3
import json, html, sys, os
from datetime import datetime, timezone, timedelta

with open('${pendingData}', 'r') as f:
    data = json.load(f)

tweets = data['tweets']
cutoff = datetime.fromisoformat('${today}').replace(tzinfo=timezone(timedelta(hours=8)))
today = '${today}'
today_tweets = []
yesterday_tweets = []
for t in tweets:
    if not t.get('timestamp'):
        today_tweets.append(t)
        continue
    try:
        ts = datetime.fromisoformat(t['timestamp'].replace('Z', '+00:00'))
        if ts >= cutoff:
            today_tweets.append(t)
        else:
            yesterday_tweets.append(t)
    except (ValueError, AttributeError):
        today_tweets.append(t)

today_tweets.sort(key=lambda x: x.get('timestamp') or '', reverse=True)
yesterday_tweets.sort(key=lambda x: x.get('timestamp') or '', reverse=True)

def render_tweet(t, idx):
    orig_text = html.escape(t['text']).replace('\\n', '<br>') if t['text'] else '<em class="no-text">(图文推文)</em>'
    zh_text = html.escape(t.get('translation', '')).replace('\\n', '<br>') if t.get('translation') else '<em class="no-text">待翻译，请查看原文</em>'
    author = html.escape(t['author'])
    handle = html.escape(t['handle'])
    url = html.escape(t['url'])
    try:
        ts = datetime.fromisoformat(t['timestamp'].replace('Z', '+00:00'))
        ts_str = ts.strftime('%Y-%m-%d %H:%M UTC')
    except (ValueError, AttributeError):
        ts_str = '时间未知'
    imgs_html = ''
    if t['images']:
        imgs_html = '<div class="tweet-images">'
        for img in t['images']:
            img_url = html.escape(img.replace('name=small', 'name=medium').replace('name=360x360', 'name=medium').replace('name=240x240', 'name=medium')).replace('&amp;', '&')
            imgs_html += f'<a href="{url}" target="_blank" rel="noopener noreferrer"><img src="{img_url}" loading="lazy" alt="FC27 tweet image" onerror="this.style.display=\\'none\\'" /></a>'
        imgs_html += '</div>'
    else:
        imgs_html = f'<div class="tweet-no-image"><a href="{url}" target="_blank" rel="noopener noreferrer">原推为纯文本，无配图；查看原推</a></div>'
    return f'''
    <article class="tweet-card" id="tweet-{idx}">
      <div class="tweet-header">
        <div class="avatar">@</div>
        <div class="author-info">
          <span class="author-name">{author}</span>
          <span class="author-handle">@{handle}</span>
        </div>
        <span class="tweet-time">{ts_str}</span>
      </div>
      <div class="tweet-body-zh">{zh_text}</div>
      <details class="tweet-original"><summary>查看原文</summary><div class="orig-text">{orig_text}</div></details>
      {imgs_html}
      <div class="tweet-footer">
        <a href="{url}" target="_blank" rel="noopener noreferrer" class="source-link">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          来源：X / @{handle}
        </a>
      </div>
    </article>'''

today_html = ''.join(render_tweet(t, i) for i, t in enumerate(today_tweets))
yesterday_html = ''.join(render_tweet(t, i+len(today_tweets)) for i, t in enumerate(yesterday_tweets))
now_str = datetime.now(timezone(timedelta(hours=8))).strftime('%Y-%m-%d %H:%M')

if not tweets:
    today_html = '<div class="empty-notice">本次执行未采集到新推文，24小时内可能无FC27相关新内容。下次执行将自动检查。</div>'
    yesterday_html = ''

html_output = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FC27 资讯日报 - {today}</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Helvetica Neue', sans-serif; background: #0a0a0a; color: #e7e9ea; line-height: 1.6; }}
  .container {{ max-width: 1400px; margin: 0 auto; padding: 20px 16px 60px; }}
  .header {{ text-align: center; padding: 32px 0 24px; border-bottom: 1px solid #2f3336; margin-bottom: 28px; }}
  .header h1 {{ font-size: 28px; font-weight: 700; background: linear-gradient(135deg, #1d9bf0, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 8px; }}
  .header .subtitle {{ color: #71767b; font-size: 14px; }}
  .header .meta {{ margin-top: 12px; display: flex; justify-content: center; gap: 16px; flex-wrap: wrap; }}
  .header .meta span {{ background: #16181c; border: 1px solid #2f3336; border-radius: 20px; padding: 4px 14px; font-size: 12px; color: #71767b; }}
  .section-title {{ font-size: 18px; font-weight: 600; margin: 28px 0 16px; padding-left: 12px; border-left: 3px solid #1d9bf0; color: #e7e9ea; grid-column: 1 / -1; }}
  .tweets-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }}
  .tweet-card {{ background: #16181c; border: 1px solid #2f3336; border-radius: 16px; padding: 16px; margin-bottom: 16px; transition: border-color 0.2s; }}
  .tweet-card:hover {{ border-color: #3d4144; }}
  .tweet-header {{ display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }}
  .avatar {{ width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #1d9bf0, #8b5cf6); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; color: white; flex-shrink: 0; }}
  .author-info {{ flex: 1; display: flex; flex-direction: column; }}
  .author-name {{ font-weight: 600; font-size: 15px; }}
  .author-handle {{ color: #71767b; font-size: 13px; }}
  .tweet-time {{ color: #71767b; font-size: 13px; white-space: nowrap; }}
  .tweet-body-zh {{ font-size: 15px; line-height: 1.75; margin-bottom: 8px; white-space: pre-wrap; word-wrap: break-word; color: #e7e9ea; }}
  .tweet-body-zh .no-text {{ color: #71767b; font-style: italic; }}
  .tweet-original {{ margin-bottom: 12px; }}
  .tweet-original summary {{ color: #71767b; font-size: 13px; cursor: pointer; user-select: none; padding: 4px 0; }}
  .tweet-original summary:hover {{ color: #1d9bf0; }}
  .tweet-original .orig-text {{ color: #71767b; font-size: 14px; margin-top: 8px; padding: 10px 12px; background: #0a0a0a; border-radius: 8px; white-space: pre-wrap; word-wrap: break-word; line-height: 1.6; }}
  .tweet-images {{ display: grid; grid-template-columns: 1fr; gap: 8px; margin-bottom: 12px; }}
  .tweet-images img {{ width: 100%; border-radius: 12px; border: 1px solid #2f3336; display: block; }}
  .tweet-no-image {{ margin-bottom: 12px; padding: 10px 14px; background: #0a0a0a; border: 1px dashed #2f3336; border-radius: 8px; text-align: center; }}
  .tweet-no-image span {{ color: #71767b; font-size: 13px; }}
  .tweet-footer {{ display: flex; justify-content: flex-start; padding-top: 8px; border-top: 1px solid #2f3336; }}
  .source-link {{ display: inline-flex; align-items: center; gap: 6px; color: #1d9bf0; text-decoration: none; font-size: 13px; transition: opacity 0.2s; }}
  .source-link:hover {{ opacity: 0.8; text-decoration: underline; }}
  .empty-notice {{ text-align: center; padding: 48px 20px; color: #71767b; font-size: 15px; background: #16181c; border: 1px solid #2f3336; border-radius: 16px; }}
  .footer {{ text-align: center; padding: 32px 0; color: #71767b; font-size: 13px; border-top: 1px solid #2f3336; margin-top: 32px; }}
  .footer a {{ color: #1d9bf0; text-decoration: none; }}
  @media (max-width: 480px) {{ .header h1 {{ font-size: 22px; }} .tweet-body-zh {{ font-size: 14px; }} .tweet-images img {{ border-radius: 8px; }} }}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>FC27 资讯日报</h1>
    <p class="subtitle">数据来源：X (Twitter) 多博主采集 | 自动采集 · 内容去重 · 中文翻译</p>
    <div class="meta">
      <span>生成时间：{now_str} CST</span>
      <span>本期资讯：{len(tweets)} 条</span>
      <span>来源：X.com</span>
    </div>
  </div>
  {'<div class="tweets-grid"><div class="section-title">今日资讯</div>' + today_html + '</div>' if today_tweets else (today_html if not tweets else '')}
  {'<div class="tweets-grid"><div class="section-title">近期资讯</div>' + yesterday_html + '</div>' if yesterday_tweets else ''}
  <div class="footer">
    <p>本报告由自动化系统采集生成，所有内容均标注来源。</p>
    <p>数据源：16个FC27资讯博主 · X.com</p>
    <p style="margin-top:8px;">已过滤预测类内容 · 已按内容去重 · 跨次执行积累数据 · 中文翻译保留原文对照</p>
  </div>
</div>
</body>
</html>'''

with open('${pendingReport}', 'w', encoding='utf-8') as f:
    f.write(html_output)
print(f"Report saved: ${reportFile}")
`;

// Write and execute Python template
const pyScript = path.join(WORK_DIR, 'render-report.py');
writeFileSync(pyScript, htmlTemplate);
execFileSync('python3', [pyScript], { encoding: 'utf8', timeout: 15000 });
const rendered = readFileSync(pendingReport, 'utf8');
if (!rendered.includes('</html>') || !rendered.includes(today)) throw new Error('报告校验失败');
if (existsSync(SEEN_FILE)) copyFileSync(SEEN_FILE, path.join(WORK_DIR, 'seen_tweets.json.bak'));
atomicWrite(DAILY_FILE, snapshot);
renameSync(pendingReport, reportFile);
atomicWrite(FILTERED_FILE, snapshot);
atomicWrite(SEEN_FILE, JSON.stringify(seenData, null, 2));
rmSync(WORK_DIR, { recursive: true, force: true });

console.log(`\n=== Summary ===`);
console.log(`Total raw: ${allTweets.length}`);
console.log(`Unique: ${unique.length}`);
console.log(`FC27 related: ${fc27Tweets.length}`);
console.log(`Non-prediction: ${nonPrediction.length}`);
console.log(`New tweets (after cross-exec dedup): ${newTweetsRaw.length}`);
console.log(`Content-deduped clusters: ${clusters.length}`);
console.log(`Final tweets in report: ${newTweets.length}`);
console.log(`Seen tweets total: ${seenData.tweets.length}`);
console.log(`Report: ${reportFile}`);
