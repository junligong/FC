#!/usr/bin/env python3
# 补全翻译并重新生成 FC27 资讯日报 HTML
# 输入: apps/news/data/tweets-2026-09-15.json
# 输出: 更新 JSON + 重新生成 reports/daily/2026-09-15/news.html
import json, html, os
from datetime import datetime, timezone, timedelta

DATA_FILE = '/Users/wuyanzu/Desktop/FC/apps/news/data/tweets-2026-09-15.json'
REPORT_FILE = '/Users/wuyanzu/Desktop/FC/reports/daily/2026-09-15/news.html'
TODAY = '2026-09-15'

# AI 补全的 15 条翻译（翻译 API 502 失败后的手动翻译）
TRANSLATIONS = {
    "2099589043562414437": "这是#FC27首个赛季计划内容的抢先概览：",
    "2099594542324314394": "Web App 16日\n伴侣App 17日\n\n现在只差Rivals定级了",
    "2099592657387303216": "FC 27 Web App新日期：9月16日（UTC 17:00）\n\n大利好\n#FC27",
    "2099586524442472898": "ASY提示：FC 27中先开预购传奇包\n\n然后开FUT名人堂挑选包，根据你抽到的传奇来选择\n#FC27",
    "2099593430955426105": "FC 27 Web App新发布时间\n\n9月16日\n英国时间下午6点\n\n改了太多次日期了",
    "2099595699289555144": "终于来了",
    "2099635036987273602": "",
    "2099609826951102941": "接受FC26转FC27点数转移订单\n\n你获得的优势是巨大的\n\n可以比别人先开卡包\n在Web App期间低价买入热门球员\n当所有人进入游戏时让你的金币翻倍/三倍\n\n价格：60欧元\n\n批量购买（5+",
    "2099593233672159685": "突发：Web App周三上线\n\n巨大的利好\n\n有什么想法？",
    "2099589383401701874": "FC27各预算档位最强主流中后卫\n\n根据你首日开包运气来选择最佳球员",
    "2099661843371270487": "EA发布Web App正式上线时间和日期\n\nWeb App：EA SPORTS FC 27 Web App于9月16日UTC 17:00上线。\n\n伴侣App：EA SPORTS FC 27伴侣App于9月17日UTC 17:00更新上线。\n\n加入 https://discord.gg/razzer",
    "2099592884634656885": "Web App周三上线冲冲冲冲冲冲冲冲冲冲冲冲",
    "2099640999760871586": "EA FC 27文件大小：\n\nPS5 - 65.8 GB\nXbox - 62 GB",
    "2099631256266793249": "来了来了!!!!!",
    "2099593917100413397": "EA FC 27 Web App本周三上线!!!",
}

# 1. 读取 JSON 并更新翻译
with open(DATA_FILE, 'r', encoding='utf-8') as f:
    data = json.load(f)

updated = 0
for t in data['tweets']:
    tid = t['id']
    if tid in TRANSLATIONS and (not t.get('translation') or t['translation'] == ''):
        t['translation'] = TRANSLATIONS[tid]
        updated += 1

print(f"Updated {updated} translations")

# 原子写入 JSON
tmp_json = DATA_FILE + '.tmp'
with open(tmp_json, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
os.replace(tmp_json, DATA_FILE)
print(f"Saved JSON: {DATA_FILE}")

# 2. 重新生成 HTML 报告
tweets = data['tweets']
cutoff = datetime.fromisoformat(TODAY).replace(tzinfo=timezone(timedelta(hours=8)))
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
    orig_text = html.escape(t['text']).replace('\n', '<br>') if t['text'] else '<em class="no-text">(图文推文)</em>'
    zh_text = html.escape(t.get('translation', '')).replace('\n', '<br>') if t.get('translation') else '<em class="no-text">待翻译，请查看原文</em>'
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
            imgs_html += f'<a href="{url}" target="_blank" rel="noopener noreferrer"><img src="{img_url}" loading="lazy" alt="FC27 tweet image" onerror="this.style.display=\'none\'" /></a>'
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

html_output = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FC27 资讯日报 - {TODAY}</title>
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

# 原子写入 HTML
tmp_html = REPORT_FILE + '.tmp'
with open(tmp_html, 'w', encoding='utf-8') as f:
    f.write(html_output)
os.replace(tmp_html, REPORT_FILE)
print(f"Saved HTML: {REPORT_FILE}")

# 3. 校验
untranslated = sum(1 for t in data['tweets'] if not t.get('translation') and t.get('text', '').strip())
print(f"Total tweets: {len(data['tweets'])}")
print(f"Untranslated remaining: {untranslated}")
