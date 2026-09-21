#!/usr/bin/env python3
"""作用：分析FC26传奇与英雄卡跨平台价格，寻找买卖时点。"""

import json
import os
import sys
import argparse
from datetime import datetime
from collections import defaultdict
import math

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE, 'src'))
try:
    from i18n import create_i18n, TRANSLATIONS
except ImportError:
    create_i18n = lambda lang: type('I18n', {}, {'t': lambda self, k: k})()
    TRANSLATIONS = {}

def load_data():
    with open(os.path.join(BASE, 'icons/data/prices/fc26/base-icons.json')) as f:
        icons_data = json.load(f)
    with open(os.path.join(BASE, 'heroes/data/prices/fc26/base-heroes.json')) as f:
        heroes_data = json.load(f)
    return icons_data, heroes_data

def safe_num(v, default=0):
    if v is None:
        return default
    return v

def extract_players(data, card_type, platform='cross'):
    players = []
    window = data.get('window', {})
    all_days = window.get('days', [])
    
    for p in data['players']:
        prices = p.get('prices', {})
        plat_prices = prices.get(platform, {})
        if not plat_prices or len(plat_prices) < 5:
            continue
        
        daily = []
        for day in all_days:
            val = plat_prices.get(day)
            if val is not None and val > 0:
                daily.append({'date': day, 'price': val})
        
        if len(daily) < 5:
            continue
        
        metrics = p.get('metrics', {}).get(platform, {})
        players.append({
            'name': p['name'],
            'nameZh': p.get('nameZh', ''),
            'id': p['id'],
            'rating': p.get('rating', 0),
            'card_type': card_type,
            'daily': daily,
            'launch_price': daily[0]['price'],
            'end_price': daily[-1]['price'],
            'min_price': safe_num(metrics.get('minimum'), min(d['price'] for d in daily)),
            'max_price': safe_num(metrics.get('maximum'), max(d['price'] for d in daily)),
            'change_pct': metrics.get('changePct', 0),
            'num_days': len(daily),
        })
    return players

def find_buy_sell_window(player):
    daily = player['daily']
    min_idx = 0
    min_price = daily[0]['price']
    for i, d in enumerate(daily):
        if d['price'] < min_price:
            min_price = d['price']
            min_idx = i
    sell_idx = min_idx
    sell_price = min_price
    for i in range(min_idx, len(daily)):
        if daily[i]['price'] > sell_price:
            sell_price = daily[i]['price']
            sell_idx = i
    profit_pct = ((sell_price - min_price) / min_price * 100) if min_price > 0 else 0
    return {
        'buy_date': daily[min_idx]['date'],
        'buy_day': min_idx + 1,
        'buy_price': min_price,
        'sell_date': daily[sell_idx]['date'],
        'sell_day': sell_idx + 1,
        'sell_price': sell_price,
        'profit_pct': profit_pct,
        'hold_days': sell_idx - min_idx,
    }

def find_best_swing(player):
    daily = player['daily']
    if len(daily) < 3:
        return find_buy_sell_window(player)
    best_profit = 0
    best_buy_idx = 0
    best_sell_idx = 0
    for i in range(len(daily) - 1):
        for j in range(i + 1, len(daily)):
            if daily[i]['price'] > 0:
                profit = (daily[j]['price'] - daily[i]['price']) / daily[i]['price'] * 100
                if profit > best_profit:
                    best_profit = profit
                    best_buy_idx = i
                    best_sell_idx = j
    return {
        'buy_date': daily[best_buy_idx]['date'],
        'buy_day': best_buy_idx + 1,
        'buy_price': daily[best_buy_idx]['price'],
        'sell_date': daily[best_sell_idx]['date'],
        'sell_day': best_sell_idx + 1,
        'sell_price': daily[best_sell_idx]['price'],
        'profit_pct': best_profit,
        'hold_days': best_sell_idx - best_buy_idx,
    }

def compute_daily_index(players, all_days):
    daily_sums = defaultdict(list)
    for p in players:
        for d in p['daily']:
            daily_sums[d['date']].append(d['price'])
    index = []
    for day in all_days:
        vals = daily_sums.get(day, [])
        if vals:
            avg = sum(vals) / len(vals)
            index.append({'date': day, 'avg': avg, 'count': len(vals)})
    if index:
        base = index[0]['avg']
        for item in index:
            item['index'] = round(item['avg'] / base * 100, 1) if base > 0 else 100
    return index

def compute_tier_stats(players):
    tiers = {
        'icon_top': {'label': 'Icon 93+', 'players': [], 'color': '#ffd700'},
        'icon_mid': {'label': 'Icon 90-92', 'players': [], 'color': '#ff9800'},
        'icon_low': {'label': 'Icon 87-89', 'players': [], 'color': '#ff5722'},
        'hero_top': {'label': 'Hero 88+', 'players': [], 'color': '#e91e63'},
        'hero_mid': {'label': 'Hero 85-87', 'players': [], 'color': '#9c27b0'},
    }
    for p in players:
        ct = p['card_type']
        r = p['rating']
        if ct == 'icon':
            if r >= 93: tiers['icon_top']['players'].append(p)
            elif r >= 90: tiers['icon_mid']['players'].append(p)
            else: tiers['icon_low']['players'].append(p)
        else:
            if r >= 88: tiers['hero_top']['players'].append(p)
            elif r >= 85: tiers['hero_mid']['players'].append(p)
    
    stats = {}
    for key, tier in tiers.items():
        ps = tier['players']
        if not ps:
            continue
        buy_sells = [find_buy_sell_window(p) for p in ps]
        avg_profit = sum(bs['profit_pct'] for bs in buy_sells) / len(buy_sells)
        valid_changes = [p['change_pct'] * 100 for p in ps if p['change_pct'] is not None]
        avg_change = sum(valid_changes) / len(valid_changes) if valid_changes else 0
        avg_launch = sum(p['launch_price'] for p in ps) / len(ps)
        avg_min = sum(p['min_price'] for p in ps) / len(ps)
        buy_days = [bs['buy_day'] for bs in buy_sells]
        avg_buy_day = sum(buy_days) / len(buy_days) if buy_days else 0
        stats[key] = {
            'label': tier['label'], 'color': tier['color'], 'count': len(ps),
            'avg_launch': round(avg_launch), 'avg_min': round(avg_min),
            'avg_change_pct': round(avg_change, 1),
            'avg_profit_pct': round(avg_profit, 1),
            'avg_buy_day': round(avg_buy_day, 1),
            'drop_from_launch': round((avg_min - avg_launch) / avg_launch * 100, 1) if avg_launch > 0 else 0,
        }
    return stats

def format_price(v):
    if v >= 1_000_000: return f"{v/1_000_000:.1f}M"
    elif v >= 1_000: return f"{v/1_000:.0f}K"
    return str(int(v))

def format_price_full(v):
    if v >= 1_000_000: return f"{v/1_000_000:.2f}M"
    elif v >= 1_000: return f"{v/1_000:.1f}K"
    return str(int(v))

def compute_platform_data(icons_data, heroes_data, all_days, platform):
    """Compute all stats for a given platform, return JSON-serializable dict."""
    icon_players = extract_players(icons_data, 'icon', platform)
    hero_players = extract_players(heroes_data, 'hero', platform)
    all_players = icon_players + hero_players
    
    for p in all_players:
        p['bs'] = find_best_swing(p)
    
    icon_index = compute_daily_index(icon_players, all_days)
    hero_index = compute_daily_index(hero_players, all_days)
    tier_stats = compute_tier_stats(all_players)
    
    total = len(all_players)
    icon_count = len(icon_players)
    hero_count = len(hero_players)
    
    valid_icon_changes = [p['change_pct'] * 100 for p in icon_players if p['change_pct'] is not None]
    valid_hero_changes = [p['change_pct'] * 100 for p in hero_players if p['change_pct'] is not None]
    avg_icon_change = sum(valid_icon_changes) / len(valid_icon_changes) if valid_icon_changes else 0
    avg_hero_change = sum(valid_hero_changes) / len(valid_hero_changes) if valid_hero_changes else 0
    
    all_profits = [p['bs']['profit_pct'] for p in all_players]
    avg_all_profit = sum(all_profits) / len(all_profits) if all_profits else 0
    
    buy_day_counts = defaultdict(int)
    sell_day_counts = defaultdict(int)
    for p in all_players:
        buy_day_counts[p['bs']['buy_day']] += 1
        sell_day_counts[p['bs']['sell_day']] += 1
    
    sorted_by_profit = sorted(all_players, key=lambda x: x['bs']['profit_pct'], reverse=True)
    
    dod_changes = defaultdict(list)
    for p in all_players:
        daily = p['daily']
        for i in range(1, len(daily)):
            if daily[i-1]['price'] > 0:
                change = (daily[i]['price'] - daily[i-1]['price']) / daily[i-1]['price'] * 100
                dod_changes[daily[i]['date']].append(change)
    dod_avg = {}
    for day in all_days:
        vals = dod_changes.get(day, [])
        if vals:
            dod_avg[day] = sum(vals) / len(vals)
    
    max_drop_day = min(dod_avg, key=dod_avg.get) if dod_avg else ''
    max_drop_val = dod_avg.get(max_drop_day, 0)
    max_rise_day = max(dod_avg, key=dod_avg.get) if dod_avg else ''
    max_rise_val = dod_avg.get(max_rise_day, 0)
    
    day1_avg = sum(p['launch_price'] for p in all_players) / total if total else 0
    day2_prices = [p['daily'][1]['price'] for p in all_players if len(p['daily']) > 1]
    day2_avg = sum(day2_prices) / len(day2_prices) if day2_prices else day1_avg
    day1_premium = (day1_avg - day2_avg) / day2_avg * 100 if day2_avg > 0 else 0
    
    day3_prices = [p['daily'][2]['price'] for p in all_players if len(p['daily']) > 2]
    day6_prices = [p['daily'][5]['price'] for p in all_players if len(p['daily']) > 5]
    if day3_prices and day6_prices:
        day3_avg = sum(day3_prices) / len(day3_prices)
        day6_avg = sum(day6_prices) / len(day6_prices)
        early_swing_pct = (day6_avg - day3_avg) / day3_avg * 100 if day3_avg > 0 else 0
    else:
        early_swing_pct = 0
    
    day30_avg = sum(p['daily'][-1]['price'] for p in all_players) / total if total else 0
    month_decline = (day1_avg - day30_avg) / day1_avg * 100 if day1_avg > 0 else 0
    
    # Top 20
    top20_data = []
    for i, p in enumerate(sorted_by_profit[:20]):
        bs = p['bs']
        top20_data.append({
            'idx': i,
            'nameZh': p.get('nameZh', '') or p['name'],
            'nameEn': p['name'].title(),
            'rating': p['rating'],
            'cardType': p['card_type'],
            'prices': [d['price'] for d in p['daily']],
            'dates': [d['date'] for d in p['daily']],
            'launchPrice': p['launch_price'],
            'endPrice': p['end_price'],
            'minPrice': p['min_price'],
            'maxPrice': p['max_price'],
            'changePct': round((p['change_pct'] or 0) * 100, 1),
            'buyDay': bs['buy_day'],
            'buyPrice': bs['buy_price'],
            'buyDate': bs['buy_date'],
            'sellDay': bs['sell_day'],
            'sellPrice': bs['sell_price'],
            'sellDate': bs['sell_date'],
            'holdDays': bs['hold_days'],
            'profitPct': round(bs['profit_pct'], 1),
        })
    
    # Bottom 20
    bottom20_data = []
    for i, p in enumerate(sorted_by_profit[-20:]):
        bs = p['bs']
        bottom20_data.append({
            'nameZh': p.get('nameZh', '') or p['name'],
            'nameEn': p['name'].title(),
            'rating': p['rating'],
            'cardType': p['card_type'],
            'launchPrice': p['launch_price'],
            'minPrice': p['min_price'],
            'maxPrice': p['max_price'],
            'changePct': round((p['change_pct'] or 0) * 100, 1),
            'profitPct': round(bs['profit_pct'], 1),
            'buyDay': bs['buy_day'],
            'sellDay': bs['sell_day'],
        })
    
    # Weekday pattern
    weekday_prices = defaultdict(list)
    for p in all_players:
        for d in p['daily']:
            dt = datetime.strptime(d['date'], '%Y-%m-%d')
            weekday_prices[dt.weekday()].append(d['price'])
    weekday_names = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    weekday_avg = {}
    for wd in range(7):
        vals = weekday_prices.get(wd, [])
        if vals:
            weekday_avg[wd] = sum(vals) / len(vals)
    weekday_index = {}
    if weekday_avg:
        base_wd = list(weekday_avg.values())[0]
        weekday_index = {wd: round(v / base_wd * 100, 1) for wd, v in weekday_avg.items()}
    
    return {
        'dateLabels': [d[5:] for d in all_days],
        'iconIndex': [d['index'] for d in icon_index],
        'heroIndex': [d['index'] for d in hero_index],
        'dodAvg': [{'x': d, 'y': round(dod_avg.get(d, 0), 1)} for d in all_days],
        'dodColors': ['#f44336' if dod_avg.get(d, 0) < 0 else '#4caf50' for d in all_days],
        'tierStats': list(tier_stats.values()),
        'tierLabels': [s['label'] for s in tier_stats.values()],
        'tierProfitData': [s['avg_profit_pct'] for s in tier_stats.values()],
        'tierColors': [s['color'] for s in tier_stats.values()],
        'top20': top20_data,
        'bottom20': bottom20_data,
        'buyDayCounts': [buy_day_counts.get(d, 0) for d in range(1, 31)],
        'sellDayCounts': [sell_day_counts.get(d, 0) for d in range(1, 31)],
        'weekdayIndex': [weekday_index[wd] for wd in range(7) if wd in weekday_index] if weekday_index else [],
        'weekdayColors': ['#42a5f5' if weekday_index[wd] < 100 else '#ffd700' for wd in range(7) if wd in weekday_index] if weekday_index else [],
        'weekdayNames': weekday_names,
        'keyStats': {
            'total': total,
            'iconCount': icon_count,
            'heroCount': hero_count,
            'day1Premium': round(day1_premium, 1),
            'monthDecline': round(month_decline, 1),
            'avgAllProfit': round(avg_all_profit, 1),
            'day2Drop': round(abs(dod_avg.get(all_days[1], 0)) if len(all_days) > 1 else 0, 1),
            'earlySwingPct': round(early_swing_pct, 1),
            'avgIconChange': round(avg_icon_change, 1),
            'avgHeroChange': round(avg_hero_change, 1),
            'maxDropDay': max_drop_day[5:] if max_drop_day else '',
            'maxDropVal': round(max_drop_val, 1),
            'maxRiseDay': max_rise_day[5:] if max_rise_day else '',
            'maxRiseVal': round(max_rise_val, 1),
            'bestBuyDay': max(buy_day_counts, key=buy_day_counts.get) if buy_day_counts else 1,
            'theoreticalMax': round(day1_premium + month_decline, 0),
        }
    }

def generate_report(icons_data, heroes_data, all_days, lang='zh'):
    cross_data = compute_platform_data(icons_data, heroes_data, all_days, 'cross')
    pc_data = compute_platform_data(icons_data, heroes_data, all_days, 'pc')
    
    cross_json = json.dumps(cross_data, ensure_ascii=False)
    pc_json = json.dumps(pc_data, ensure_ascii=False)
    
    ks = cross_data['keyStats']
    
    html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FC26 传奇与英雄卡价格深度分析</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3.0.0/dist/chartjs-adapter-date-fns.bundle.min.js"></script>
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0e27; color: #e0e0e0; line-height: 1.6; }}
.container {{ max-width: 1280px; margin: 0 auto; padding: 20px; }}
h1 {{ text-align: center; font-size: 30px; margin: 20px 0 5px; background: linear-gradient(135deg, #ffd700, #ff6b6b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }}
h2 {{ font-size: 24px; margin: 40px 0 15px; padding-bottom: 8px; border-bottom: 2px solid #2a3055; color: #8b9fdc; }}
h3 {{ font-size: 18px; margin: 25px 0 10px; color: #c3c3c3; }}
.subtitle {{ text-align: center; color: #888; margin-bottom: 40px; font-size: 14px; }}

.toggle-bar {{ position: fixed; top: 16px; right: 16px; z-index: 9999; display: flex; gap: 8px; }}
.lang-toggle, .platform-toggle {{ display: flex; gap: 4px; background: #141831; border-radius: 8px; padding: 4px; border: 1px solid #2a3055; }}
.lang-btn, .platform-btn {{ padding: 6px 14px; border-radius: 6px; border: none; background: transparent; color: #888; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.2s; }}
.lang-btn:hover, .platform-btn:hover {{ color: #e0e0e0; background: #1a1f3a; }}
.lang-btn.active {{ background: #667eea; color: #fff; }}
.platform-btn.active {{ background: #42a5f5; color: #fff; }}
.player-name {{ font-weight: 600; }}

.stats-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px; }}
.stat-card {{ background: #141831; border-radius: 12px; padding: 20px; border: 1px solid #1e2444; text-align: center; }}
.stat-card h3 {{ color: #667eea; margin-bottom: 8px; font-size: 14px; }}
.stat-value {{ font-size: 32px; font-weight: bold; color: #fff; }}
.stat-detail {{ font-size: 12px; color: #888; margin-top: 5px; }}
.stat-value.positive {{ color: #4caf50; }}
.stat-value.negative {{ color: #f44336; }}

.chart-container {{ background: #141831; border-radius: 12px; padding: 20px; margin-bottom: 25px; border: 1px solid #1e2444; }}
.chart-wrapper {{ position: relative; height: 400px; }}
.chart-wrapper.tall {{ height: 500px; }}
.chart-wrapper.small {{ height: 300px; }}
.chart-row {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px; }}

table {{ width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }}
th {{ background: #1a1f3a; padding: 10px 8px; text-align: left; font-weight: 600; color: #8b9fdc; border-bottom: 2px solid #2a3055; position: sticky; top: 0; }}
td {{ padding: 8px; border-bottom: 1px solid #1e2444; }}
tr:hover {{ background: #1a1f3a; }}
.card-type-badge {{ display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }}
.badge-icon {{ background: #2a2a4a; color: #8b9fdc; }}
.badge-hero {{ background: #4a2a2a; color: #ff6b6b; }}
.positive {{ color: #4caf50; }}
.negative {{ color: #f44336; }}

.strategy-grid {{ display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 30px; }}
.strategy-card {{ background: #141831; border-radius: 12px; padding: 25px; border: 1px solid #1e2444; }}
.strategy-card.sell {{ border-left: 4px solid #f44336; }}
.strategy-card.buy {{ border-left: 4px solid #4caf50; }}
.strategy-card h3 {{ font-size: 20px; margin-bottom: 15px; }}
.strategy-card.sell h3 {{ color: #f44336; }}
.strategy-card.buy h3 {{ color: #4caf50; }}
.strategy-card ul {{ list-style: none; padding: 0; }}
.strategy-card li {{ padding: 6px 0; padding-left: 20px; position: relative; }}
.strategy-card li::before {{ content: '\\25B8'; position: absolute; left: 0; color: #667eea; }}

.tier-table th, .tier-table td {{ text-align: center; }}
.insight {{ background: #141831; border-radius: 8px; padding: 15px 20px; margin-bottom: 10px; border-left: 3px solid #667eea; }}
.insight strong {{ color: #667eea; }}

.clickable-row {{ cursor: pointer; transition: background 0.15s; }}
.clickable-row:hover {{ background: #1e2444 !important; }}
.clickable-row.selected {{ background: #2a3055 !important; border-left: 3px solid #ffd700; }}

.player-detail {{ display: none; margin-top: 20px; }}
.player-detail-header {{ display: flex; align-items: center; gap: 15px; margin-bottom: 15px; flex-wrap: wrap; }}
.player-detail-name {{ font-size: 22px; font-weight: bold; color: #fff; }}
.player-detail-badge {{ display: inline-block; padding: 4px 12px; border-radius: 6px; font-size: 13px; font-weight: 600; }}
.player-detail-stats {{ display: flex; gap: 20px; flex-wrap: wrap; }}
.player-detail-stat {{ background: #1a1f3a; padding: 8px 16px; border-radius: 8px; font-size: 13px; }}
.player-detail-stat .label {{ color: #888; }}
.player-detail-stat .value {{ font-weight: bold; color: #fff; margin-left: 5px; }}
.player-detail-hint {{ color: #888; font-size: 13px; margin-bottom: 10px; }}
.summary-box {{ background: linear-gradient(135deg, #1a1f3a, #141831); border-radius: 12px; padding: 30px; margin: 30px 0; border: 1px solid #2a3055; }}
.summary-box h2 {{ border: none; margin-top: 0; }}

@media (max-width: 768px) {{
  .chart-row, .strategy-grid {{ grid-template-columns: 1fr; }}
  .toggle-bar {{ top: 8px; right: 8px; flex-direction: column; }}
}}
</style>
</head>
<body>
<div class="toggle-bar">
  <div class="platform-toggle">
    <button class="platform-btn active" onclick="setPlatform('cross')">Cross</button>
    <button class="platform-btn" onclick="setPlatform('pc')">PC</button>
  </div>
  <div class="lang-toggle">
    <button class="lang-btn active" onclick="setLang('zh')">中</button>
    <button class="lang-btn" onclick="setLang('en')">EN</button>
    <button class="lang-btn" onclick="setLang('bilingual')">双语</button>
  </div>
</div>
<div class="container">

<h1>FC26 传奇与英雄卡价格深度分析</h1>
<p class="subtitle" id="subtitle">数据范围: 2025-09-18 ~ 2025-10-17 (开服首月30天) | Icon <span id="sub-icon"></span> | Hero <span id="sub-hero"></span> | <span id="sub-platform">Cross</span> 平台价格</p>

<div class="summary-box">
<h2 style="color: #ffd700;">核心发现: 先卖后买，波段套利</h2>
<div style="margin-top: 15px;">
<p style="font-size: 16px; line-height: 1.8; margin-bottom: 15px;">
<strong style="font-size: 20px; color: #f44336;">关键发现: 开服 Day 1 是绝对价格高点，全天溢价高达 <span id="ks-premium"></span>%</strong><br>
Icon & Hero 卡在开服首日存在巨大溢价，Day 2 即暴跌 <span id="ks-day2drop"></span>%，
此后价格持续阴跌至月底，全月平均跌幅 <strong style="color: #f44336;"><span id="ks-decline"></span>%</strong>。
<strong style="color: #4caf50;">价格从未反弹回 Day 1 水平</strong>，因此最优策略不是"低买高卖"，而是 <strong style="color: #ffd700;">"先卖后买"</strong>。
</p>
</div>
<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-top: 20px;">
<div style="background: #1a1f3a; border-radius: 10px; padding: 20px; border-left: 4px solid #f44336;">
<h3 style="color: #f44336; margin-bottom: 10px;">策略一: 开服即卖</h3>
<p style="font-size: 14px;">
<strong style="font-size: 18px; color: #f44336;">Day 1 全部卖出</strong><br>
开服首日价格 = 全月最高<br>
溢价 <span id="ks-premium2"></span>% 高于 Day 2<br>
卖后持币等待抄底
</p>
</div>
<div style="background: #1a1f3a; border-radius: 10px; padding: 20px; border-left: 4px solid #4caf50;">
<h3 style="color: #4caf50; margin-bottom: 10px;">策略二: 快速波段</h3>
<p style="font-size: 14px;">
<strong style="font-size: 18px; color: #4caf50;">Day 3 买 → Day 6 卖</strong><br>
Day 2-3 暴跌后有小反弹<br>
波段收益约 +<span id="ks-swing"></span>%<br>
3天快速获利了结
</p>
</div>
<div style="background: #1a1f3a; border-radius: 10px; padding: 20px; border-left: 4px solid #ffd700;">
<h3 style="color: #ffd700; margin-bottom: 10px;">策略三: 深度抄底</h3>
<p style="font-size: 14px;">
<strong style="font-size: 18px; color: #ffd700;">Day 27-30 买入</strong><br>
月底价格触底 (指数~50)<br>
仅为开服价的 50%<br>
持有至次月等 SBC/Promo 拉升
</p>
</div>
</div>
</div>

<h2>关键数据</h2>
<div class="stats-grid">
<div class="stat-card"><h3>分析球员总数</h3><div class="stat-value" id="stat-total"></div><div class="stat-detail" id="stat-total-detail"></div></div>
<div class="stat-card"><h3>Day 1 溢价</h3><div class="stat-value negative" id="stat-premium"></div><div class="stat-detail">开服首日高于次日</div></div>
<div class="stat-card"><h3>全月平均跌幅</h3><div class="stat-value negative" id="stat-decline"></div><div class="stat-detail">Day 1 &rarr; Day 30</div></div>
<div class="stat-card"><h3>最优波段平均收益</h3><div class="stat-value positive" id="stat-profit"></div><div class="stat-detail">月内最佳买→卖</div></div>
<div class="stat-card"><h3>Day 2 单日暴跌</h3><div class="stat-value negative" id="stat-day2drop"></div><div class="stat-detail">最大单日跌幅</div></div>
<div class="stat-card"><h3>早期波段收益</h3><div class="stat-value positive" id="stat-swing"></div><div class="stat-detail">Day 3&rarr;Day 6 反弹</div></div>
<div class="stat-card"><h3>Day 1 卖出持币至月底</h3><div class="stat-value positive" id="stat-max"></div><div class="stat-detail">理论最大套利空间</div></div>
</div>

<h2>价格走势 (归一化指数, 开服日=100)</h2>
<div class="chart-container"><div class="chart-wrapper tall"><canvas id="priceIndexChart"></canvas></div></div>

<h2>日均涨跌幅分析</h2>
<div class="chart-container"><div class="chart-wrapper"><canvas id="dodChart"></canvas></div></div>

<div class="insight" id="dod-insight"></div>

<h2>买卖时机分布</h2>
<div class="chart-row">
<div class="chart-container"><h3>最佳买入日分布 (全球员)</h3><div class="chart-wrapper small"><canvas id="buyDistChart"></canvas></div></div>
<div class="chart-container"><h3>最佳卖出日分布 (全球员)</h3><div class="chart-wrapper small"><canvas id="sellDistChart"></canvas></div></div>
</div>
<div class="insight" id="buy-sell-insight"></div>

<h2>按评级分层分析</h2>
<div class="chart-container"><h3>各分层最优策略收益对比</h3><div class="chart-wrapper small"><canvas id="tierChart"></canvas></div></div>
<table class="tier-table" id="tierTable">
<thead><tr><th>分层</th><th>人数</th><th>平均开服价</th><th>平均最低价</th><th>跌幅</th><th>首月涨跌</th><th>最优策略收益</th><th>平均买入日</th></tr></thead>
<tbody id="tierTableBody"></tbody>
</table>

<h2>三大交易策略详解</h2>
<div class="strategy-grid">
<div class="strategy-card sell">
<h3>策略一: 开服即卖 (首推)</h3>
<ul>
<li><strong>时机: Day 1 开服当天</strong>，价格处于全月绝对高点</li>
<li><strong>逻辑: </strong> 开服首日供给极度稀缺 + 玩家热情高涨 = 巨大溢价 (<span class="ks-premium3"></span>%)</li>
<li><strong>操作: </strong> 所有开包获得的 Icon/Hero 全部当天挂卖</li>
<li><strong>收益: </strong> 相比持有一个月，多赚 <span class="ks-decline2"></span>%（价格会持续下跌）</li>
<li><strong>注意: </strong> Day 2 价格即暴跌 <span class="ks-day2drop2"></span>%，切勿隔夜持有</li>
<li><strong>适合: </strong> 所有玩家，零风险套利</li>
</ul>
</div>
<div class="strategy-card buy">
<h3>策略二: 快速波段</h3>
<ul>
<li><strong>买入: Day 2-3</strong>，首日暴跌后的第一个局部底部</li>
<li><strong>卖出: Day 5-6</strong>，短暂反弹高点</li>
<li><strong>收益: </strong> 约 +<span class="ks-swing2"></span>%，3 天快速获利</li>
<li><strong>逻辑: </strong> Day 2 暴跌引发抄底盘，Day 3-6 出现技术性反弹</li>
<li><strong>选标的: </strong> 跌幅最深的高评级 Icon 93+ 反弹最猛</li>
<li><strong>注意: </strong> 反弹力度有限，不可贪心，Day 6 必须卖出</li>
</ul>
</div>
<div class="strategy-card" style="border-left: 4px solid #ffd700;">
<h3 style="color: #ffd700;">策略三: 深度抄底</h3>
<ul>
<li><strong>买入: Day 27-30</strong>，月底价格触底（指数~50）</li>
<li><strong>卖出: 次月</strong>，等 SBC/Promo 需求拉升</li>
<li><strong>收益: </strong> 月底买入价仅为开服价的 50%，次月反弹空间巨大</li>
<li><strong>逻辑: </strong> 供给持续增加 + 需求枯竭 = 月底最低点</li>
<li><strong>选标的: </strong> Hero 85-87 性价比最高</li>
<li><strong>注意: </strong> 需持有 1-2 周甚至更长，资金占用时间久</li>
</ul>
</div>
</div>

<h2>TOP 20 利润最大化机会</h2>
<p class="player-detail-hint">👆 点击任意行查看该球员的价格走势图</p>
<table id="top20Table">
<thead><tr><th>#</th><th>球员</th><th>卡种</th><th>OVR</th><th>开服价</th><th>买入价</th><th>买入日</th><th>卖出价</th><th>卖出日</th><th>持有天数</th><th>收益率</th></tr></thead>
<tbody id="top20Body"></tbody>
</table>

<h2>BOTTOM 20 最差交易标的</h2>
<p style="color: #888; margin-bottom: 15px;">以下球员即使采用最优买卖策略，收益仍然最低，不建议作为投资标的</p>
<table id="bottom20Table">
<thead><tr><th>#</th><th>球员</th><th>卡种</th><th>OVR</th><th>开服价</th><th>最低价</th><th>最高价</th><th>首月涨跌</th><th>最优收益</th></tr></thead>
<tbody id="bottom20Body"></tbody>
</table>

<div class="player-detail" id="playerDetail">
<div class="player-detail-header">
<span class="player-detail-name" id="detailName">-</span>
<span class="player-detail-badge" id="detailBadge">-</span>
<span class="player-detail-badge" id="detailRating" style="background: #2a3055; color: #8b9fdc;">-</span>
</div>
<div class="player-detail-stats">
<div class="player-detail-stat"><span class="label">开服价</span><span class="value" id="detailLaunch">-</span></div>
<div class="player-detail-stat"><span class="label">最低价</span><span class="value" id="detailMin">-</span></div>
<div class="player-detail-stat"><span class="label">最高价</span><span class="value" id="detailMax">-</span></div>
<div class="player-detail-stat"><span class="label">月末价</span><span class="value" id="detailEnd">-</span></div>
<div class="player-detail-stat"><span class="label">买入点</span><span class="value" id="detailBuy">-</span></div>
<div class="player-detail-stat"><span class="label">卖出点</span><span class="value" id="detailSell">-</span></div>
<div class="player-detail-stat"><span class="label">波段收益</span><span class="value" id="detailProfit" style="color: #4caf50;">-</span></div>
<div class="player-detail-stat"><span class="label">首月涨跌</span><span class="value" id="detailChange">-</span></div>
</div>
<div class="chart-container" style="margin-top: 15px;"><div class="chart-wrapper tall"><canvas id="playerDetailChart"></canvas></div></div>
</div>

<h2>周内价格规律</h2>
<div class="chart-container"><div class="chart-wrapper small"><canvas id="weekdayChart"></canvas></div></div>
<div class="insight" id="weekday-insight"></div>

<h2>深度洞察</h2>
<div class="insight" id="insight1"></div>
<div class="insight" id="insight2"></div>
<div class="insight" id="insight3"></div>
<div class="insight" id="insight4"></div>
<div class="insight" id="insight5"></div>
<div class="insight" id="insight6"></div>

<h2>FC27 开服操作计划</h2>
<div class="summary-box" style="border-color: #ffd700;">
<table style="font-size: 14px;" id="fc27-plan-table">
<thead><tr><th>阶段</th><th>时间</th><th>操作</th><th>资金/仓位</th><th>核心要点</th></tr></thead>
<tbody id="fc27PlanBody"></tbody>
</table>
</div>
<div class="insight" id="capital-efficiency"></div>

<p style="text-align: center; color: #555; margin-top: 40px; font-size: 12px;">
数据来源: FUTBIN | 分析时间: 2026-08-31 | 仅供参考，市场有风险，投资需谨慎
</p>
</div>

<script>
const crossData = {cross_json};
const pcData = {pc_json};
let currentPlatform = 'cross';
let currentData = crossData;
let currentPlayer = null;
let currentLang = localStorage.getItem('fc-lang') || 'zh';
const charts = {{}};

Chart.defaults.color = '#a0a0b0';
Chart.defaults.borderColor = '#1e2444';

function fmtPrice(v) {{
  if (v >= 1e6) return (v/1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v/1e3).toFixed(0) + 'K';
  return String(v);
}}

function setPlatform(platform) {{
  currentPlatform = platform;
  currentData = platform === 'cross' ? crossData : pcData;
  document.querySelectorAll('.platform-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelector('.platform-btn.' + platform + '-btn, .platform-btn:nth-child(' + (platform === 'cross' ? 1 : 2) + ')').classList.add('active');
  // Simpler: find by text
  document.querySelectorAll('.platform-btn').forEach(btn => {{
    if (btn.textContent.trim().toLowerCase() === platform) btn.classList.add('active');
    else btn.classList.remove('active');
  }});
  document.getElementById('sub-platform').textContent = platform === 'cross' ? 'Cross' : 'PC';
  renderAll();
  localStorage.setItem('fc-platform', platform);
}}

function setLang(lang) {{
  currentLang = lang;
  document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.remove('active'));
  const map = {{ 'zh': 0, 'en': 1, 'bilingual': 2 }};
  document.querySelectorAll('.lang-btn')[map[lang]].classList.add('active');
  document.querySelectorAll('.player-name').forEach(el => {{
    if (lang === 'zh') el.textContent = el.dataset.zh;
    else if (lang === 'en') el.textContent = el.dataset.en;
    else el.textContent = el.dataset.zh + ' / ' + el.dataset.en;
  }});
  if (currentPlayer) updatePlayerDetail();
  localStorage.setItem('fc-lang', lang);
}}

function renderAll() {{
  const d = currentData;
  const ks = d.keyStats;
  
  // Subtitle
  document.getElementById('sub-icon').textContent = ks.iconCount;
  document.getElementById('sub-hero').textContent = ks.heroCount;
  
  // Key stats text
  const setText = (cls, val) => document.querySelectorAll('.' + cls).forEach(el => el.textContent = val);
  document.getElementById('ks-premium').textContent = ks.day1Premium.toFixed(0);
  document.getElementById('ks-day2drop').textContent = ks.day2Drop.toFixed(0);
  document.getElementById('ks-decline').textContent = ks.monthDecline.toFixed(0);
  document.getElementById('ks-premium2').textContent = ks.day1Premium.toFixed(0);
  document.getElementById('ks-swing').textContent = ks.earlySwingPct.toFixed(1);
  setText('ks-premium3', ks.day1Premium.toFixed(0));
  setText('ks-decline2', ks.monthDecline.toFixed(0));
  setText('ks-day2drop2', ks.day2Drop.toFixed(0));
  setText('ks-swing2', ks.earlySwingPct.toFixed(1));
  
  // Stat cards
  document.getElementById('stat-total').textContent = ks.total;
  document.getElementById('stat-total-detail').textContent = 'Icon ' + ks.iconCount + ' + Hero ' + ks.heroCount;
  document.getElementById('stat-premium').textContent = '+' + ks.day1Premium.toFixed(0) + '%';
  document.getElementById('stat-decline').textContent = ks.monthDecline.toFixed(0) + '%';
  document.getElementById('stat-profit').textContent = '+' + ks.avgAllProfit.toFixed(1) + '%';
  document.getElementById('stat-day2drop').textContent = ks.day2Drop.toFixed(1) + '%';
  document.getElementById('stat-swing').textContent = '+' + ks.earlySwingPct.toFixed(1) + '%';
  document.getElementById('stat-max').textContent = '+' + ks.theoreticalMax.toFixed(0) + '%';
  
  // DoD insight
  document.getElementById('dod-insight').innerHTML = '<strong>日均涨跌幅解读:</strong> 最大单日跌幅出现在 <strong>' + ks.maxDropDay + '</strong> (' + ks.maxDropVal + '%)，这是恐慌性抛售的信号，也是抄底的最佳时机。最大单日涨幅出现在 <strong>' + ks.maxRiseDay + '</strong> (' + ks.maxRiseVal + '%)，表明市场触底后快速反弹。';
  
  // Buy/sell insight
  document.getElementById('buy-sell-insight').innerHTML = '<strong>买卖时机分布解读:</strong> 买入日集中在第 <strong>' + ks.bestBuyDay + '</strong> 天附近，说明多数球员在同一时间窗口触底。卖出日相对分散，说明不同球员的反弹节奏有差异，需个体判断。';
  
  // Tier table
  let tierHtml = '';
  d.tierStats.forEach(s => {{
    tierHtml += '<tr><td style="color:' + s.color + '; font-weight:600;">' + s.label + '</td><td>' + s.count + '</td><td>' + fmtPrice(s.avg_launch) + '</td><td>' + fmtPrice(s.avg_min) + '</td><td class="negative">' + s.drop_from_launch.toFixed(1) + '%</td><td class="' + (s.avg_change_pct < 0 ? 'negative' : 'positive') + '">' + (s.avg_change_pct >= 0 ? '+' : '') + s.avg_change_pct.toFixed(1) + '%</td><td class="positive">+' + s.avg_profit_pct.toFixed(1) + '%</td><td>Day ' + s.avg_buy_day.toFixed(0) + '</td></tr>';
  }});
  document.getElementById('tierTableBody').innerHTML = tierHtml;
  
  // Top20 table
  let top20Html = '';
  d.top20.forEach((p, i) => {{
    top20Html += '<tr class="clickable-row" data-idx="' + i + '" onclick="showPlayerChart(' + i + ')"><td>' + (i+1) + '</td><td><span class="player-name" data-zh="' + p.nameZh + '" data-en="' + p.nameEn + '">' + (currentLang === 'zh' ? p.nameZh : currentLang === 'en' ? p.nameEn : p.nameZh + ' / ' + p.nameEn) + '</span></td><td><span class="card-type-badge badge-' + p.cardType + '">' + (p.cardType === 'icon' ? 'Icon' : 'Hero') + '</span></td><td>' + p.rating + '</td><td>' + fmtPrice(p.launchPrice) + '</td><td class="positive">' + fmtPrice(p.buyPrice) + '</td><td>Day ' + p.buyDay + ' (' + p.buyDate.slice(5) + ')</td><td>' + fmtPrice(p.sellPrice) + '</td><td>Day ' + p.sellDay + ' (' + p.sellDate.slice(5) + ')</td><td>' + p.holdDays + '天</td><td class="positive" style="font-weight:bold;">+' + p.profitPct + '%</td></tr>';
  }});
  document.getElementById('top20Body').innerHTML = top20Html;
  
  // Bottom20 table
  let bot20Html = '';
  d.bottom20.forEach((p, i) => {{
    bot20Html += '<tr><td>' + (i+1) + '</td><td><span class="player-name" data-zh="' + p.nameZh + '" data-en="' + p.nameEn + '">' + (currentLang === 'zh' ? p.nameZh : currentLang === 'en' ? p.nameEn : p.nameZh + ' / ' + p.nameEn) + '</span></td><td><span class="card-type-badge badge-' + p.cardType + '">' + (p.cardType === 'icon' ? 'Icon' : 'Hero') + '</span></td><td>' + p.rating + '</td><td>' + fmtPrice(p.launchPrice) + '</td><td>' + fmtPrice(p.minPrice) + '</td><td>' + fmtPrice(p.maxPrice) + '</td><td class="' + (p.changePct < 0 ? 'negative' : 'positive') + '">' + (p.changePct >= 0 ? '+' : '') + p.changePct + '%</td><td class="' + (p.profitPct < 10 ? 'negative' : 'positive') + '">+' + p.profitPct + '%</td></tr>';
  }});
  document.getElementById('bottom20Body').innerHTML = bot20Html;
  
  // FC27 plan table
  let planHtml = '';
  const planRows = [
    ['<span style="color:#f44336;font-weight:600;">卖出期</span>', 'Day 1', '全部卖出', '清仓 100%', '开服首日价格全月最高，溢价 ' + ks.day1Premium.toFixed(0) + '%，必须当天卖出'],
    ['<span style="color:#8b9fdc;font-weight:600;">观望期</span>', 'Day 2', '持币观望', '0%', '价格暴跌 ' + ks.day2Drop.toFixed(0) + '%，恐慌盘涌出，准备抄底'],
    ['<span style="color:#4caf50;font-weight:600;">抄底期</span>', 'Day 3', '建仓买入', '40%', '第一个局部底部，选跌幅最深的高评级卡'],
    ['<span style="color:#4caf50;font-weight:600;">加仓期</span>', 'Day 4', '补仓', '20%', '如继续下跌可补，否则观望'],
    ['<span style="color:#ffd700;font-weight:600;">波段卖出</span>', 'Day 5-6', '获利了结', '卖出 60%', '短暂反弹高点，快速获利 +' + ks.earlySwingPct.toFixed(1) + '%，不可贪心'],
    ['<span style="color:#8b9fdc;font-weight:600;">空仓期</span>', 'Day 7-26', '持币等待', '0%', '价格持续阴跌，不做任何操作，保存弹药'],
    ['<span style="color:#4caf50;font-weight:600;">深度抄底</span>', 'Day 27-30', '全仓买入', '100%', '月底触底，价格仅为开服价 50%，持有至次月'],
    ['<span style="color:#ffd700;font-weight:600;">次月卖出</span>', 'Month 2', '分批卖出', '100%', '等 SBC/Promo 需求拉升后获利了结'],
  ];
  planRows.forEach(r => {{ planHtml += '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] + '</td><td>' + r[3] + '</td><td>' + r[4] + '</td></tr>'; }});
  document.getElementById('fc27PlanBody').innerHTML = planHtml;
  
  // Capital efficiency
  document.getElementById('capital-efficiency').innerHTML = '<strong>资金使用效率对比:</strong><br>方案A (Day 1 卖出 → Day 30 买回): 套利空间 <strong style="color:#4caf50;">+' + ks.theoreticalMax.toFixed(0) + '%</strong>，零风险，适合所有人<br>方案B (Day 3 买 → Day 6 卖 快速波段): 收益 <strong style="color:#4caf50;">+' + ks.earlySwingPct.toFixed(1) + '%</strong>，3天周期，适合有经验玩家<br>方案C (Day 27-30 买入 → 次月卖出): 预期收益 <strong style="color:#4caf50;">+30~50%</strong>，需持有 2-4 周，适合长线玩家<br>方案D (持有不动 Day 1→30): 亏损 <strong style="color:#f44336;">' + ks.monthDecline.toFixed(0) + '%</strong>，最差方案';
  
  // Insights
  document.getElementById('insight1').innerHTML = '<strong>1. 开服 Day 1 = 全月最高点:</strong> 开服首日价格平均比次日高 ' + ks.day1Premium.toFixed(0) + '%，比月底高 ' + ks.monthDecline.toFixed(0) + '%。这是因为开服初期供给极度稀缺（玩家还没开出足够包）+ 热情高涨。<strong style="color:#f44336;">如果开包得到 Icon/Hero，必须在 Day 1 当天卖出</strong>，这是零风险套利。';
  document.getElementById('insight2').innerHTML = '<strong>2. Day 2 暴跌是最佳抄底窗口:</strong> Day 2 出现全月最大单日跌幅（' + ks.day2Drop.toFixed(0) + '%），恐慌盘涌出。Day 3 触及第一个局部底部后，Day 4-6 出现短暂反弹（+' + ks.earlySwingPct.toFixed(1) + '%），是月内唯一的快速波段机会。但反弹力度有限，Day 6 后价格继续阴跌。';
  document.getElementById('insight3').innerHTML = '<strong>3. 价格持续阴跌，无V型反转:</strong> 价格指数从 Day 1 的 100 一路跌到 Day 30 的 ~50，<strong>从未出现超过 3 天的连续反弹</strong>。日均涨跌幅几乎全为负值，说明市场处于持续供给增加、需求不足的状态。这意味着"抄底后等反弹"的策略在首月内基本无效——除非持有到次月。';
  document.getElementById('insight4').innerHTML = '<strong>4. Icon vs Hero 跌幅对比:</strong> Icon 卡平均跌幅 ' + Math.abs(ks.avgIconChange).toFixed(1) + '%，Hero 卡平均跌幅 ' + Math.abs(ks.avgHeroChange).toFixed(1) + '%。两类卡的下跌节奏基本一致，但 Hero 卡的绝对价格更低，同样的跌幅下资金门槛更小。中小资金量玩家建议聚焦 Hero 85-87 评级，大资金玩家操作 Icon 93+。';
  document.getElementById('insight5').innerHTML = '<strong>5. 最优波段交易收益有限:</strong> 即使在月内找到最佳买入→卖出点，平均收益也只有 +' + ks.avgAllProfit.toFixed(1) + '%。相比之下，<strong style="color:#4caf50;">"Day 1 卖出 → Day 30 买回"的套利空间高达 ' + ks.theoreticalMax.toFixed(0) + '%</strong>。如果一定要在月内做波段，优先选择早期波段（Day 3→6），避开中后期的持续阴跌。';
  document.getElementById('insight6').innerHTML = '<strong>6. 评级越高，跌幅越深但反弹也越快:</strong> 高评级 Icon (93+) 和 Hero (88+) 的跌幅最大，但 Day 3→6 的反弹力度也最强。低评级卡跌幅小、波动小，几乎没有波段操作空间。激进型玩家聚焦高评级做快速波段，保守型玩家直接 Day 1 卖出持币。';
  
  // Weekday insight
  if (d.weekdayIndex.length > 0) {{
    const bestBuy = d.weekdayIndex.indexOf(Math.min(...d.weekdayIndex));
    const bestSell = d.weekdayIndex.indexOf(Math.max(...d.weekdayIndex));
    document.getElementById('weekday-insight').innerHTML = '<strong>周内规律:</strong> <strong>' + d.weekdayNames[bestBuy] + '</strong> 价格平均最低 (指数 ' + d.weekdayIndex[bestBuy] + ')，是最佳买入日；<strong>' + d.weekdayNames[bestSell] + '</strong> 价格平均最高 (指数 ' + d.weekdayIndex[bestSell] + ')，是最佳卖出日。建议在周中低价买入，周末高价卖出。';
  }}
  
  // Update charts
  updateCharts();
  
  // Reset player detail
  document.getElementById('playerDetail').style.display = 'none';
  currentPlayer = null;
}}

function updateCharts() {{
  const d = currentData;
  
  // Price index
  if (charts.priceIndex) charts.priceIndex.destroy();
  charts.priceIndex = new Chart(document.getElementById('priceIndexChart'), {{
    type: 'line',
    data: {{
      labels: d.dateLabels,
      datasets: [
        {{ label: 'Icon 归一化指数', data: d.iconIndex, borderColor: '#8b9fdc', backgroundColor: 'rgba(139,159,220,0.1)', borderWidth: 2.5, fill: true, tension: 0.3, pointRadius: 3 }},
        {{ label: 'Hero 归一化指数', data: d.heroIndex, borderColor: '#ff6b6b', backgroundColor: 'rgba(255,107,107,0.1)', borderWidth: 2.5, fill: true, tension: 0.3, pointRadius: 3 }},
      ]
    }},
    options: {{
      responsive: true, maintainAspectRatio: false,
      interaction: {{ intersect: false, mode: 'index' }},
      plugins: {{ legend: {{ position: 'top', labels: {{ color: '#e0e0e0', font: {{ size: 13 }} }} }}, tooltip: {{ callbacks: {{ label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(1) }} }} }},
      scales: {{
        x: {{ ticks: {{ color: '#888', maxRotation: 45 }}, grid: {{ color: '#1a1f3a' }} }},
        y: {{ ticks: {{ color: '#888' }}, grid: {{ color: '#1a1f3a' }}, title: {{ display: true, text: '指数 (开服日=100)', color: '#888' }} }}
      }}
    }}
  }});
  
  // DoD chart
  if (charts.dod) charts.dod.destroy();
  charts.dod = new Chart(document.getElementById('dodChart'), {{
    type: 'bar',
    data: {{
      labels: d.dateLabels,
      datasets: [{{ label: '日均涨跌幅(%)', data: d.dodAvg.map(x => x.y), backgroundColor: d.dodColors, borderRadius: 3 }}]
    }},
    options: {{
      responsive: true, maintainAspectRatio: false,
      plugins: {{ legend: {{ display: false }} }},
      scales: {{
        x: {{ ticks: {{ color: '#888', maxRotation: 45 }}, grid: {{ color: '#1a1f3a' }} }},
        y: {{ ticks: {{ color: '#888', callback: v => v + '%' }}, grid: {{ color: '#1a1f3a' }} }}
      }}
    }}
  }});
  
  // Buy distribution
  if (charts.buyDist) charts.buyDist.destroy();
  charts.buyDist = new Chart(document.getElementById('buyDistChart'), {{
    type: 'bar',
    data: {{ labels: Array.from({{length:30}},(_,i)=>'D'+(i+1)), datasets: [{{ label: '球员数量', data: d.buyDayCounts, backgroundColor: '#4caf50', borderRadius: 3 }}] }},
    options: {{ responsive: true, maintainAspectRatio: false, plugins: {{ legend: {{ display: false }} }}, scales: {{ x: {{ ticks: {{ color: '#888', font: {{ size: 10 }} }}, grid: {{ display: false }} }}, y: {{ ticks: {{ color: '#888' }}, grid: {{ color: '#1a1f3a' }} }} }} }}
  }});
  
  // Sell distribution
  if (charts.sellDist) charts.sellDist.destroy();
  charts.sellDist = new Chart(document.getElementById('sellDistChart'), {{
    type: 'bar',
    data: {{ labels: Array.from({{length:30}},(_,i)=>'D'+(i+1)), datasets: [{{ label: '球员数量', data: d.sellDayCounts, backgroundColor: '#f44336', borderRadius: 3 }}] }},
    options: {{ responsive: true, maintainAspectRatio: false, plugins: {{ legend: {{ display: false }} }}, scales: {{ x: {{ ticks: {{ color: '#888', font: {{ size: 10 }} }}, grid: {{ display: false }} }}, y: {{ ticks: {{ color: '#888' }}, grid: {{ color: '#1a1f3a' }} }} }} }}
  }});
  
  // Tier chart
  if (charts.tier) charts.tier.destroy();
  charts.tier = new Chart(document.getElementById('tierChart'), {{
    type: 'bar',
    data: {{ labels: d.tierLabels, datasets: [{{ label: '最优策略平均收益(%)', data: d.tierProfitData, backgroundColor: d.tierColors, borderRadius: 5 }}] }},
    options: {{ responsive: true, maintainAspectRatio: false, plugins: {{ legend: {{ display: false }} }}, scales: {{ x: {{ ticks: {{ color: '#e0e0e0', font: {{ size: 12 }} }}, grid: {{ display: false }} }}, y: {{ ticks: {{ color: '#888', callback: v => '+' + v + '%' }}, grid: {{ color: '#1a1f3a' }} }} }} }}
  }});
  
  // Weekday chart
  if (d.weekdayIndex.length > 0) {{
    if (charts.weekday) charts.weekday.destroy();
    charts.weekday = new Chart(document.getElementById('weekdayChart'), {{
      type: 'bar',
      data: {{ labels: d.weekdayNames, datasets: [{{ label: '周内价格指数', data: d.weekdayIndex, backgroundColor: d.weekdayColors, borderRadius: 5 }}] }},
      options: {{ responsive: true, maintainAspectRatio: false, plugins: {{ legend: {{ display: false }} }}, scales: {{ x: {{ ticks: {{ color: '#e0e0e0', font: {{ size: 13 }} }}, grid: {{ display: false }} }}, y: {{ ticks: {{ color: '#888' }}, grid: {{ color: '#1a1f3a' }} }} }} }}
    }});
  }}
}}

function showPlayerChart(idx) {{
  const p = currentData.top20[idx];
  currentPlayer = p;
  document.getElementById('playerDetail').style.display = 'block';
  document.querySelectorAll('#top20Table .clickable-row').forEach(r => r.classList.remove('selected'));
  const row = document.querySelector('#top20Table .clickable-row[data-idx="' + idx + '"]');
  if (row) row.classList.add('selected');
  updatePlayerDetail();
}}

function updatePlayerDetail() {{
  if (!currentPlayer) return;
  const p = currentPlayer;
  const nameEl = document.getElementById('detailName');
  if (currentLang === 'zh') nameEl.textContent = p.nameZh + ' (' + p.rating + ')';
  else if (currentLang === 'en') nameEl.textContent = p.nameEn + ' (' + p.rating + ')';
  else nameEl.textContent = p.nameZh + ' / ' + p.nameEn + ' (' + p.rating + ')';
  
  const badge = document.getElementById('detailBadge');
  badge.textContent = p.cardType === 'icon' ? 'Icon' : 'Hero';
  badge.className = 'player-detail-badge ' + (p.cardType === 'icon' ? 'badge-icon' : 'badge-hero');
  
  document.getElementById('detailRating').textContent = 'OVR ' + p.rating;
  document.getElementById('detailLaunch').textContent = fmtPrice(p.launchPrice);
  document.getElementById('detailMin').textContent = fmtPrice(p.minPrice);
  document.getElementById('detailMax').textContent = fmtPrice(p.maxPrice);
  document.getElementById('detailEnd').textContent = fmtPrice(p.endPrice);
  document.getElementById('detailBuy').textContent = fmtPrice(p.buyPrice) + ' (Day ' + p.buyDay + ')';
  document.getElementById('detailSell').textContent = fmtPrice(p.sellPrice) + ' (Day ' + p.sellDay + ')';
  document.getElementById('detailProfit').textContent = '+' + p.profitPct + '%';
  const changeEl = document.getElementById('detailChange');
  changeEl.textContent = p.changePct > 0 ? '+' + p.changePct + '%' : p.changePct + '%';
  changeEl.style.color = p.changePct >= 0 ? '#4caf50' : '#f44336';
  
  const buyIdx = p.buyDay - 1;
  const sellIdx = p.sellDay - 1;
  const buyPointData = p.prices.map((v, i) => i === buyIdx ? v : null);
  const sellPointData = p.prices.map((v, i) => i === sellIdx ? v : null);
  
  if (charts.playerDetail) charts.playerDetail.destroy();
  charts.playerDetail = new Chart(document.getElementById('playerDetailChart'), {{
    type: 'line',
    data: {{
      labels: currentData.dateLabels,
      datasets: [
        {{ label: '价格', data: p.prices, borderColor: '#667eea', backgroundColor: 'rgba(102,126,234,0.15)', borderWidth: 2.5, fill: true, tension: 0.3, pointRadius: 3, pointBackgroundColor: '#667eea' }},
        {{ label: '买入点 Day ' + p.buyDay + ' (' + fmtPrice(p.buyPrice) + ')', data: buyPointData, borderColor: '#4caf50', backgroundColor: '#4caf50', borderWidth: 0, pointRadius: 8, pointStyle: 'triangle', showLine: false }},
        {{ label: '卖出点 Day ' + p.sellDay + ' (' + fmtPrice(p.sellPrice) + ')', data: sellPointData, borderColor: '#f44336', backgroundColor: '#f44336', borderWidth: 0, pointRadius: 8, pointStyle: 'rectRot', showLine: false }},
      ]
    }},
    options: {{
      responsive: true, maintainAspectRatio: false,
      interaction: {{ intersect: false, mode: 'index' }},
      plugins: {{ legend: {{ position: 'top', labels: {{ color: '#e0e0e0', font: {{ size: 12 }}, boxWidth: 15 }} }}, tooltip: {{ callbacks: {{ label: ctx => {{
        if (ctx.datasetIndex === 0) return '价格: ' + fmtPrice(ctx.parsed.y);
        if (ctx.datasetIndex === 1) return '买入: ' + fmtPrice(ctx.parsed.y) + ' (Day ' + p.buyDay + ')';
        if (ctx.datasetIndex === 2) return '卖出: ' + fmtPrice(ctx.parsed.y) + ' (Day ' + p.sellDay + ')';
        return null;
      }} }} }} }},
      scales: {{
        x: {{ ticks: {{ color: '#888', maxRotation: 45 }}, grid: {{ color: '#1a1f3a' }} }},
        y: {{ ticks: {{ color: '#888', callback: v => fmtPrice(v) }}, grid: {{ color: '#1a1f3a' }}, title: {{ display: true, text: '价格', color: '#888' }} }}
      }}
    }}
  }});
}}

// Init
const savedPlatform = localStorage.getItem('fc-platform') || 'cross';
setPlatform(savedPlatform);
setLang(currentLang);
</script>
</body>
</html>'''
    return html

def main():
    parser = argparse.ArgumentParser(description='FC26 Icon & Hero Deep Price Analysis V2')
    parser.add_argument('--lang', choices=['zh', 'en', 'bilingual'], default='zh')
    args = parser.parse_args()
    
    icons_data, heroes_data = load_data()
    all_days = icons_data.get('window', {}).get('days', [])
    
    print(f"Loaded {len(icons_data['players'])} icons, {len(heroes_data['players'])} heroes")
    print(f"Date range: {all_days[0]} ~ {all_days[-1]} ({len(all_days)} days)")
    
    html = generate_report(icons_data, heroes_data, all_days, lang=args.lang)
    
    output_path = os.path.join(BASE, 'output', 'fc26-icon-hero-deep-analysis.html')
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)
    
    print(f"Report saved: {output_path}")
    print(f"File size: {os.path.getsize(output_path)} bytes")

if __name__ == '__main__':
    main()
