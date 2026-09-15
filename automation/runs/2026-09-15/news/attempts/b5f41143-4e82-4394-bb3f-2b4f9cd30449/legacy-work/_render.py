#!/usr/bin/env python3
import json, html, sys, os
from datetime import datetime, timezone, timedelta

with open('/Users/wuyanzu/Desktop/FC/apps/news/data/_pending-60989.json', 'r') as f:
    data = json.load(f)

tweets = data['tweets']
cutoff = datetime.fromisoformat('2026-09-15').replace(tzinfo=timezone(timedelta(hours=8)))
today = '2026-09-15'
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

with open('/Users/wuyanzu/Desktop/FC/reports/daily/2026-09-15/news.html.60989.tmp', 'w', encoding='utf-8') as f:
    f.write(html_output)
print(f"Report saved: /Users/wuyanzu/Desktop/FC/reports/daily/2026-09-15/news.html")
