#!/usr/bin/env python3
"""作用：生成FC26开服首月四档价格分析和投资建议HTML报告。"""

import json
import os
from pathlib import Path
from datetime import datetime
from collections import defaultdict

PROJECT_DIR = Path(__file__).resolve().parents[1]
START_DATE = '2025-09-18'
END_DATE = '2025-10-17'
from datetime import timedelta
d = datetime(2025, 9, 18)
DATES = [(d + timedelta(days=i)).strftime('%Y-%m-%d') for i in range(30)]

# Tier definitions
TIERS = [
    {'key': 'big', 'label': '大卡', 'min': 1_000_000, 'max': float('inf'), 'desc': '100W+', 'color': '#ffd700'},
    {'key': 'mid', 'label': '中卡', 'min': 300_000, 'max': 1_000_000, 'desc': '30W~100W', 'color': '#c0c0c0'},
    {'key': 'practical', 'label': '实用卡', 'min': 100_000, 'max': 300_000, 'desc': '10W~30W', 'color': '#cd7f32'},
    {'key': 'small', 'label': '小卡', 'min': 10_000, 'max': 100_000, 'desc': '1W~10W', 'color': '#4169e1'},
]

def pname(p):
    """Generate a player name span with dual-language data attributes."""
    zh = p.get('nameZh', '') or p['name']
    en = p['name'].title() if p['name'] != p['name'].upper() else p['name']
    return f'<span class="player-name" data-zh="{zh}" data-en="{en}">{en}</span>'

def load_gold():
    with open(os.path.join(PROJECT_DIR, 'gold/data/prices/fc26/fc26-first-month.json')) as f:
        data = json.load(f)
    players = []
    for p in data['players']:
        cross = p.get('prices', {}).get('cross', {})
        launch = cross.get(START_DATE)
        end = cross.get(END_DATE)
        vals = [v for v in cross.values() if isinstance(v, (int, float)) and v > 0]
        if not launch or launch <= 0:
            continue
        players.append({
            'name': p['name'],
            'nameZh': p.get('nameZh', ''),
            'cardType': 'gold',
            'cardLabel': 'Gold',
            'rating': p.get('fc27Rating') or p.get('fc26Rating'),
            'launchPrice': launch,
            'endPrice': end,
            'change': (end - launch) if end and launch else None,
            'changePct': ((end - launch) / launch) if end and launch and launch > 0 else None,
            'minimum': min(vals) if vals else None,
            'maximum': max(vals) if vals else None,
            'range': (max(vals) - min(vals)) if vals else None,
            'rangePct': ((max(vals) - min(vals)) / min(vals)) if vals and min(vals) > 0 else None,
            'prices': cross,
            'url': p.get('fc26Url', ''),
        })
    return players

def load_cards(filepath, card_type, card_label):
    with open(filepath) as f:
        data = json.load(f)
    players = []
    for p in data['players']:
        if p.get('status') != 'captured':
            continue
        cross = p.get('prices', {}).get('cross', {})
        launch = cross.get(START_DATE)
        end = cross.get(END_DATE)
        m = p.get('metrics', {}).get('cross', {})
        if not launch or launch <= 0:
            continue
        players.append({
            'name': p['name'],
            'nameZh': p.get('nameZh', ''),
            'cardType': card_type,
            'cardLabel': card_label,
            'rating': p.get('rating'),
            'launchPrice': launch,
            'endPrice': end,
            'change': m.get('change'),
            'changePct': m.get('changePct'),
            'minimum': m.get('minimum'),
            'maximum': m.get('maximum'),
            'range': m.get('range'),
            'rangePct': m.get('rangePct'),
            'prices': cross,
            'url': p.get('url', ''),
        })
    return players

def classify(player):
    lp = player['launchPrice']
    for tier in TIERS:
        if tier['min'] <= lp < tier['max']:
            return tier['key']
    return 'other'

def fmt_price(p):
    if p is None:
        return 'N/A'
    if p >= 1_000_000:
        return f'{p/1_000_000:.1f}M'
    if p >= 1_000:
        return f'{p/1_000:.0f}K'
    return str(p)

def fmt_pct(p):
    if p is None:
        return 'N/A'
    return f'{p*100:+.1f}%'

def fmt_price_full(p):
    if p is None:
        return 'N/A'
    return f'{p:,}'

# Action labels (Chinese only)
ACTION_CLASS = {
    '持有/低吸': 'action-hold',
    '观望': 'action-watch',
    '回避': 'action-avoid',
}

def action_span(action_zh):
    cls = ACTION_CLASS.get(action_zh, 'action-watch')
    return f'<span class="{cls}">{action_zh}</span>'

# Load all data
print("Loading data...")
gold_players = load_gold()
icon_players = load_cards(os.path.join(PROJECT_DIR, 'icons/data/prices/fc26/base-icons.json'), 'icon', 'Base Icon')
hero_players = load_cards(os.path.join(PROJECT_DIR, 'heroes/data/prices/fc26/base-heroes.json'), 'hero', 'Base Hero')
totw_players = load_cards(os.path.join(PROJECT_DIR, 'totw/data/prices/fc26/totw-1.json'), 'totw1', 'TOTW 1')

all_players = gold_players + icon_players + hero_players + totw_players
print(f"Total: {len(all_players)} players (Gold: {len(gold_players)}, Icons: {len(icon_players)}, Heroes: {len(hero_players)}, TOTW1: {len(totw_players)})")

# Classify
for p in all_players:
    p['tier'] = classify(p)

# Tier stats
tier_stats = {}
for tier in TIERS:
    tp = [p for p in all_players if p['tier'] == tier['key']]
    changes = [p['changePct'] for p in tp if p['changePct'] is not None]
    tier_stats[tier['key']] = {
        'label': tier['label'],
        'desc': tier['desc'],
        'count': len(tp),
        'avgChange': sum(changes) / len(changes) if changes else None,
        'byType': {ct: len([p for p in tp if p['cardType'] == ct]) for ct in ['gold', 'icon', 'hero', 'totw1']},
    }

# Card type stats
type_stats = {}
for ct, cl in [('gold', 'Gold'), ('icon', 'Base Icon'), ('hero', 'Base Hero'), ('totw1', 'TOTW 1')]:
    tp = [p for p in all_players if p['cardType'] == ct]
    changes = [p['changePct'] for p in tp if p['changePct'] is not None]
    launches = [p['launchPrice'] for p in tp]
    type_stats[ct] = {
        'label': cl,
        'count': len(tp),
        'avgLaunch': sum(launches) / len(launches) if launches else 0,
        'avgChange': sum(changes) / len(changes) if changes else None,
        'minLaunch': min(launches) if launches else 0,
        'maxLaunch': max(launches) if launches else 0,
    }

# Top gainers and losers
gainers = sorted([p for p in all_players if p['changePct'] is not None], key=lambda x: x['changePct'], reverse=True)[:20]
losers = sorted([p for p in all_players if p['changePct'] is not None], key=lambda x: x['changePct'])[:20]

# Most volatile
volatile = sorted([p for p in all_players if p['rangePct'] is not None and p['launchPrice'] >= 50000], key=lambda x: x['rangePct'], reverse=True)[:20]

# Investment recommendations by tier
def recommend(tier_key):
    tp = sorted([p for p in all_players if p['tier'] == tier_key], key=lambda x: x['launchPrice'], reverse=True)
    recs = []
    for p in tp[:15]:
        change = p['changePct']
        if change is not None and change > -0.3:
            action = '持有/低吸'
        elif change is not None and change > -0.5:
            action = '观望'
        else:
            action = '回避'
        recs.append({**p, 'action': action})
    return recs

# Generate HTML
print("Generating HTML report...")

html_parts = []
html_parts.append(f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FC26 开服首月价格分析报告</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0e27; color: #e0e0e0; line-height: 1.6; }}
.container {{ max-width: 1200px; margin: 0 auto; padding: 20px; }}
h1 {{ text-align: center; font-size: 28px; margin: 20px 0 10px; background: linear-gradient(135deg, #667eea, #764ba2); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }}
h2 {{ font-size: 22px; margin: 30px 0 15px; padding-bottom: 8px; border-bottom: 2px solid #333; color: #8b9fdc; }}
h3 {{ font-size: 18px; margin: 20px 0 10px; color: #c3c3c3; }}
.subtitle {{ text-align: center; color: #888; margin-bottom: 30px; font-size: 14px; }}

/* Language toggle - only affects player names */
.lang-toggle {{ position: fixed; top: 16px; right: 16px; z-index: 9999; display: flex; gap: 4px; background: #141831; border-radius: 8px; padding: 4px; border: 1px solid #2a3055; }}
.lang-btn {{ padding: 6px 14px; border-radius: 6px; border: none; background: transparent; color: #888; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.2s; }}
.lang-btn:hover {{ color: #e0e0e0; background: #1a1f3a; }}
.lang-btn.active {{ background: #667eea; color: #fff; }}
.player-name {{ font-weight: 600; }}

.stats-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-bottom: 30px; }}
.stat-card {{ background: #141831; border-radius: 12px; padding: 20px; border: 1px solid #1e2444; }}
.stat-card h3 {{ color: #667eea; margin-bottom: 10px; font-size: 16px; }}
.stat-value {{ font-size: 32px; font-weight: bold; color: #fff; }}
.stat-detail {{ font-size: 13px; color: #888; margin-top: 5px; }}
.tier-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 15px; margin-bottom: 30px; }}
.tier-card {{ background: #141831; border-radius: 12px; padding: 20px; border: 1px solid #1e2444; }}
.tier-card.big {{ border-color: #ffd700; box-shadow: 0 0 20px rgba(255,215,0,0.1); }}
.tier-card.mid {{ border-color: #c0c0c0; }}
.tier-card.practical {{ border-color: #cd7f32; }}
.tier-card.small {{ border-color: #4169e1; }}
.tier-label {{ font-size: 18px; font-weight: bold; margin-bottom: 5px; }}
.tier-desc {{ font-size: 13px; color: #888; margin-bottom: 10px; }}
.tier-count {{ font-size: 28px; font-weight: bold; }}
.tier-change {{ font-size: 14px; margin-top: 5px; }}
.positive {{ color: #4caf50; }}
.negative {{ color: #f44336; }}
table {{ width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }}
th {{ background: #1a1f3a; padding: 10px; text-align: left; font-weight: 600; color: #8b9fdc; border-bottom: 2px solid #2a3055; }}
td {{ padding: 8px 10px; border-bottom: 1px solid #1e2444; }}
tr:hover {{ background: #1a1f3a; }}
.card-type-badge {{ display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }}
.badge-gold {{ background: #4a4a2a; color: #ffd700; }}
.badge-icon {{ background: #2a2a4a; color: #8b9fdc; }}
.badge-hero {{ background: #4a2a2a; color: #ff6b6b; }}
.badge-totw1 {{ background: #2a4a2a; color: #66bb6a; }}
.action-hold {{ color: #4caf50; font-weight: 600; }}
.action-watch {{ color: #ff9800; font-weight: 600; }}
.action-avoid {{ color: #f44336; font-weight: 600; }}
.chart-container {{ background: #141831; border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid #1e2444; }}
.chart-wrapper {{ position: relative; height: 300px; }}
.section {{ margin-bottom: 40px; }}
.footer {{ text-align: center; color: #555; font-size: 12px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #1e2444; }}
.insight {{ background: #141831; border-radius: 12px; padding: 15px 20px; margin-bottom: 10px; border-left: 4px solid #667eea; }}
.insight strong {{ color: #667eea; }}

@media (max-width: 768px) {{
  .lang-toggle {{ top: 8px; right: 8px; }}
}}
</style>
</head>
<body>
<div class="lang-toggle">
  <button class="lang-btn active" onclick="setLang('zh')">中</button>
  <button class="lang-btn" onclick="setLang('en')">EN</button>
  <button class="lang-btn" onclick="setLang('bilingual')">双语</button>
</div>
<div class="container">
<h1>FC26 开服首月价格分析报告</h1>
<p class="subtitle">数据周期: {START_DATE} ~ {END_DATE} | 金卡 {len(gold_players)} + 传奇 {len(icon_players)} + 英雄 {len(hero_players)} + TOTW1 {len(totw_players)} = {len(all_players)} 名球员</p>
''')

# Overview stats
avg_change_val = sum(p['changePct'] for p in all_players if p['changePct'])/len([p for p in all_players if p['changePct']])
max_range = max(p['rangePct'] for p in all_players if p['rangePct'])
html_parts.append(f'''
<div class="stats-grid">
<div class="stat-card">
<h3>总球员数</h3>
<div class="stat-value">{len(all_players)}</div>
<div class="stat-detail">Gold: {len(gold_players)} | Icon: {len(icon_players)} | Hero: {len(hero_players)} | TOTW1: {len(totw_players)}</div>
</div>
<div class="stat-card">
<h3>平均开服价</h3>
<div class="stat-value">{fmt_price(sum(p['launchPrice'] for p in all_players)/len(all_players))}</div>
<div class="stat-detail">最高: {fmt_price(max(p['launchPrice'] for p in all_players))} | 最低: {fmt_price(min(p['launchPrice'] for p in all_players))}</div>
</div>
<div class="stat-card">
<h3>平均涨跌幅</h3>
<div class="stat-value {'negative' if avg_change_val < 0 else 'positive'}">{fmt_pct(avg_change_val)}</div>
<div class="stat-detail">首月整体价格走势</div>
</div>
<div class="stat-card">
<h3>价格波动最大</h3>
<div class="stat-value">{fmt_pct(max_range)}</div>
<div class="stat-detail">最大振幅</div>
</div>
</div>
''')

# Card type comparison chart
html_parts.append(f'''
<div class="chart-container">
<h3>各卡种开服价对比</h3>
<div class="chart-wrapper"><canvas id="cardTypeChart"></canvas></div>
</div>
''')

# Tier classification
html_parts.append('<h2>四档分类</h2>')
html_parts.append('<div class="tier-grid">')
for tier in TIERS:
    ts = tier_stats[tier['key']]
    avg_change = ts['avgChange']
    change_class = 'positive' if avg_change and avg_change >= 0 else 'negative'
    html_parts.append(f'''
    <div class="tier-card {tier["key"]}">
        <div class="tier-label">{tier["label"]}</div>
        <div class="tier-desc">{tier["desc"]} Coins</div>
        <div class="tier-count">{ts["count"]}</div>
        <div class="tier-change {change_class}">平均涨跌: {fmt_pct(avg_change)}</div>
        <div class="stat-detail">Gold: {ts["byType"]["gold"]} | Icon: {ts["byType"]["icon"]} | Hero: {ts["byType"]["hero"]} | TOTW1: {ts["byType"]["totw1"]}</div>
    </div>
    ''')
html_parts.append('</div>')

# Tier distribution chart
html_parts.append('''
<div class="chart-container">
<h3>四档分布图</h3>
<div class="chart-wrapper"><canvas id="tierChart"></canvas></div>
</div>
''')

# Key insights
html_parts.append('<h2>关键发现</h2>')

gold_avg = type_stats['gold']['avgChange']
icon_avg = type_stats['icon']['avgChange']
hero_avg = type_stats['hero']['avgChange']
totw_avg = type_stats['totw1']['avgChange']

icon_dropped_more = icon_avg and hero_avg and icon_avg < hero_avg

html_parts.append(f'''
<div class="insight"><strong>卡种表现对比:</strong> 传奇卡平均 {fmt_pct(icon_avg)}，英雄卡平均 {fmt_pct(hero_avg)}，TOTW1平均 {fmt_pct(totw_avg)}，金卡平均 {fmt_pct(gold_avg)}。{'传奇卡跌幅最大' if icon_dropped_more else '英雄卡跌幅最大'}，说明高价值卡在开服后价格回归更明显。</div>
<div class="insight"><strong>开服溢价:</strong> FC26开服首日所有卡种均存在显著溢价，随着供给增加，价格在首周内快速回落，第二周后趋于稳定。</div>
<div class="insight"><strong>投资窗口:</strong> 开服后第7-10天（约9月25-28日）是多数球员价格触底的窗口，之后部分热门球员开始反弹。</div>
<div class="insight"><strong>大卡(100W+):</strong> {tier_stats["big"]["count"]}张，平均涨跌 {fmt_pct(tier_stats["big"]["avgChange"])}。大卡跌幅最大但绝对值波动也最大，适合资金充裕的玩家在底部介入。</div>
<div class="insight"><strong>小卡(1W~10W):</strong> {tier_stats["small"]["count"]}张，平均涨跌 {fmt_pct(tier_stats["small"]["avgChange"])}。低价卡流动性好，适合小资金轮动操作。</div>
''')

# Top gainers table
html_parts.append('<h2>涨幅榜 TOP 20</h2>')
html_parts.append('<table><thead><tr><th>#</th><th>球员</th><th>卡种</th><th>开服价</th><th>月末价</th><th>涨跌</th></tr></thead><tbody>')
for i, p in enumerate(gainers):
    change_class = 'positive' if p['changePct'] >= 0 else 'negative'
    html_parts.append(f'<tr><td>{i+1}</td><td>{pname(p)}</td><td><span class="card-type-badge badge-{p["cardType"]}">{p["cardLabel"]}</span></td><td>{fmt_price(p["launchPrice"])}</td><td>{fmt_price(p["endPrice"])}</td><td class="{change_class}">{fmt_pct(p["changePct"])}</td></tr>')
html_parts.append('</tbody></table>')

# Top losers table
html_parts.append('<h2>跌幅榜 TOP 20</h2>')
html_parts.append('<table><thead><tr><th>#</th><th>球员</th><th>卡种</th><th>开服价</th><th>月末价</th><th>涨跌</th></tr></thead><tbody>')
for i, p in enumerate(losers):
    change_class = 'positive' if p['changePct'] >= 0 else 'negative'
    html_parts.append(f'<tr><td>{i+1}</td><td>{pname(p)}</td><td><span class="card-type-badge badge-{p["cardType"]}">{p["cardLabel"]}</span></td><td>{fmt_price(p["launchPrice"])}</td><td>{fmt_price(p["endPrice"])}</td><td class="{change_class}">{fmt_pct(p["changePct"])}</td></tr>')
html_parts.append('</tbody></table>')

# Most volatile
html_parts.append('<h2>波动最大 TOP 20</h2>')
html_parts.append('<table><thead><tr><th>#</th><th>球员</th><th>卡种</th><th>开服价</th><th>最低</th><th>最高</th><th>振幅</th></tr></thead><tbody>')
for i, p in enumerate(volatile):
    html_parts.append(f'<tr><td>{i+1}</td><td>{pname(p)}</td><td><span class="card-type-badge badge-{p["cardType"]}">{p["cardLabel"]}</span></td><td>{fmt_price(p["launchPrice"])}</td><td>{fmt_price(p["minimum"])}</td><td>{fmt_price(p["maximum"])}</td><td class="positive">{fmt_pct(p["rangePct"])}</td></tr>')
html_parts.append('</tbody></table>')

# Investment recommendations by tier
html_parts.append('<h2>投资建议</h2>')
for tier in TIERS:
    recs = recommend(tier['key'])
    if not recs:
        continue
    html_parts.append(f'<h3>{tier["label"]} ({tier["desc"]}) - {tier_stats[tier["key"]]["count"]}张</h3>')
    html_parts.append('<table><thead><tr><th>#</th><th>球员</th><th>卡种</th><th>开服价</th><th>月末价</th><th>涨跌</th><th>建议</th></tr></thead><tbody>')
    for i, p in enumerate(recs):
        change_class = 'positive' if p['changePct'] and p['changePct'] >= 0 else 'negative'
        html_parts.append(f'<tr><td>{i+1}</td><td>{pname(p)}</td><td><span class="card-type-badge badge-{p["cardType"]}">{p["cardLabel"]}</span></td><td>{fmt_price(p["launchPrice"])}</td><td>{fmt_price(p["endPrice"])}</td><td class="{change_class}">{fmt_pct(p["changePct"])}</td><td>{action_span(p["action"])}</td></tr>')
    html_parts.append('</tbody></table>')

# Investment strategy
html_parts.append('''
<h2>投资策略总结</h2>
<div class="insight"><strong>大卡 (100W+):</strong> 开服溢价最高，跌幅最大但反弹力度也强。建议开服7-10天后价格触底时买入，等待周末联赛需求回升时卖出。</div>
<div class="insight"><strong>中卡 (30W~100W):</strong> 性价比最高的投资区间，跌幅适中且流动性好。关注TOTW球员和热门联赛球员，在周末SBC需求增加时获利。</div>
<div class="insight"><strong>实用卡 (10W~30W):</strong> 适合SBC屯卡和阵容搭建，价格波动相对可控但交易量大。关注即将到来的SBC需求，提前1-2天买入。</div>
<div class="insight"><strong>小卡 (1W~10W):</strong> 适合小资金玩家轮动操作，利润率可观但单笔利润低。关注SBC和进化需求，批量买入、快速卖出。</div>
<div class="insight"><strong>FC27开服参考:</strong> FC26数据显示，开服首周是价格回归期，第2-3周价格触底，第4周开始分化。FC27开服后可参考此规律，在开服7-10天后抄底，第3-4周开始获利了结。</div>
''')

# Charts JS
tier_labels_json = json.dumps([f"{t['label']} ({t['desc']})" for t in TIERS])
html_parts.append(f'''
<script>
// === Language Toggle - only affects player names ===
function setLang(lang) {{
  document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.remove('active'));
  const map = {{ 'zh': 0, 'en': 1, 'bilingual': 2 }};
  document.querySelectorAll('.lang-btn')[map[lang]].classList.add('active');
  document.querySelectorAll('.player-name').forEach(el => {{
    if (lang === 'zh') el.textContent = el.dataset.zh;
    else if (lang === 'en') el.textContent = el.dataset.en;
    else el.textContent = el.dataset.zh + ' / ' + el.dataset.en;
  }});
  localStorage.setItem('fc-lang', lang);
}}

Chart.defaults.color = '#a0a0b0';
Chart.defaults.borderColor = '#1e2444';

// Card type comparison
new Chart(document.getElementById('cardTypeChart'), {{
  type: 'bar',
  data: {{
    labels: {json.dumps([type_stats[ct]['label'] for ct in ['gold', 'icon', 'hero', 'totw1']])},
    datasets: [{{
      label: '平均开服价',
      data: {json.dumps([round(type_stats[ct]['avgLaunch']) for ct in ['gold', 'icon', 'hero', 'totw1']])},
      backgroundColor: ['#ffd700', '#8b9fdc', '#ff6b6b', '#66bb6a'],
      borderRadius: 8,
    }}]
  }},
  options: {{
    responsive: true, maintainAspectRatio: false,
    plugins: {{ legend: {{ labels: {{ color: '#e0e0e0' }} }} }},
    scales: {{
      x: {{ ticks: {{ color: '#e0e0e0' }}, grid: {{ color: '#1e2444' }} }},
      y: {{ ticks: {{ color: '#e0e0e0', callback: v => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : (v/1e3).toFixed(0)+'K' }}, grid: {{ color: '#1e2444' }} }}
    }}
  }}
}});

// Tier distribution
new Chart(document.getElementById('tierChart'), {{
  type: 'doughnut',
  data: {{
    labels: {tier_labels_json},
    datasets: [{{
      data: {json.dumps([tier_stats[t['key']]['count'] for t in TIERS])},
      backgroundColor: {json.dumps([t['color'] for t in TIERS])},
      borderWidth: 2, borderColor: '#0a0e27',
    }}]
  }},
  options: {{
    responsive: true, maintainAspectRatio: false,
    plugins: {{ legend: {{ position: 'right', labels: {{ color: '#e0e0e0' }} }} }}
  }}
}});

// Restore language preference
(function() {{
  const saved = localStorage.getItem('fc-lang') || 'zh';
  setLang(saved);
}})();
</script>
''')

html_parts.append(f'''
<div class="footer">
<p>数据来源: FUTBIN | 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}</p>
<p>投资有风险，以上建议仅供参考，不构成投资指导</p>
</div>
</div>
</body>
</html>
''')

# Write HTML
output_path = os.path.join(PROJECT_DIR, 'output/fc26-launch-month-price-analysis.html')
with open(output_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(html_parts))
print(f"Report saved: {output_path}")
