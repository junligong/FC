#!/usr/bin/env python3
"""作用：根据稳定数据源生成FC27 Pina隐藏妖人HTML报告。"""
import json, os
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_DIR / 'output'
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Load source data
with open('/tmp/fc27-pina-analysis.json', 'r') as f:
    all_players = json.load(f)

# Load Chinese names
with open(PROJECT_DIR / 'data/players/player-index.json', 'r') as f:
    idx = json.load(f)
name_map = {}
for p in idx['players']:
    if p.get('nameZh'):
        name_map[p['slug']] = p['nameZh']

# Pina FC26 reference
PINA = {
    'name': 'Claudia Pina Medina', 'nameZh': '克劳蒂亚·皮纳',
    'rating': 86, 'pac': 79, 'sho': 86, 'pas': 83, 'dri': 87, 'def': 45, 'phy': 71,
    'weakFoot': 5, 'skills': 4, 'height': 160, 'acceleRATE': 'Controlled',
    'futbinRating': 76.9, 'price': 9200
}

# 13 hidden gems in order
gem_slugs = [
    'maria-francesca-caldentey-oliver', 'melchie-dumornay', 'sophia-wilson',
    'sakina-karchaoui', 'pedro-gonzalez-lopez', 'klara-buhl',
    'bruno-miguel-borges-fernandes', 'vitor-machado-ferreira',
    'dominik-szoboszlai', 'ewa-pajor', 'katie-mccabe',
    'raphael-dias-belloli', 'michael-olise'
]

gems = []
for slug in gem_slugs:
    p = next((x for x in all_players if x.get('slug') == slug), None)
    if p:
        p['nameZh'] = name_map.get(slug, p['name'])
        if slug == 'melchie-dumornay':
            p['nameZh'] = '梅尔奇·杜莫奈'
        p['fc27Url'] = f"https://www.futbin.com/27/player/{p['id']}/{p['slug']}"
        accel = 'Unknown'
        if p.get('heightInfo'):
            if 'Explosive' in p['heightInfo']: accel = 'Explosive'
            elif 'Lengthy' in p['heightInfo']: accel = 'Lengthy'
            else: accel = 'Controlled'
        p['acceleRATE'] = accel
        gems.append(p)

# Also load the scoring results for reasons
with open(OUTPUT_DIR / 'pina-hidden-gem-results.json', 'r') as f:
    results = json.load(f)
scored_map = {p['slug']: p for p in results.get('allScored', [])}

# Generate HTML
def stat_box(label, value, highlight=False, warn=False):
    cls = ''
    if highlight: cls = ' highlight'
    if warn: cls = ' warn'
    return f'<div class="stat-box{cls}"><div class="label">{label}</div><div class="value">{value}</div></div>'

def gem_stat(label, value, match=False):
    cls = ' pina-match' if match else ''
    return f'<div class="gem-stat{cls}"><div class="label">{label}</div><div class="value">{value}</div></div>'

def diff_str(val, pina_val, higher_better=True):
    d = val - pina_val
    if d == 0:
        return 'diff-neutral', '±0' if isinstance(pina_val, int) else '='
    sign = '+' if d > 0 else ''
    if higher_better:
        cls = 'diff-positive' if d > 0 else 'diff-negative'
    else:
        cls = 'diff-negative' if d > 0 else 'diff-positive'
    return cls, f'{sign}{d}'

html_parts = []

# Head
html_parts.append('''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FC27 隐形好球员 Finder — Pina 模型筛选报告</title>
<style>
:root{--bg:#0d1117;--card:#161b22;--border:#30363d;--text:#c9d1d9;--text-bright:#f0f6fc;--accent:#58a6ff;--accent2:#3fb950;--warn:#d29922;--danger:#f85149;--pina:#bc5717;--gem:#da3633}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;background:var(--bg);color:var(--text);line-height:1.6;max-width:1200px;margin:0 auto;padding:20px}
h1{color:var(--text-bright);font-size:2em;margin-bottom:8px}
h2{color:var(--accent);font-size:1.4em;margin:32px 0 12px;border-bottom:1px solid var(--border);padding-bottom:6px}
h3{color:var(--text-bright);font-size:1.1em;margin:20px 0 8px}
p{margin-bottom:10px}
.subtitle{color:var(--text);font-size:0.9em;margin-bottom:24px}
.tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:0.75em;font-weight:600;margin-right:4px}
.tag-pina{background:rgba(188,87,23,0.2);color:#e8854a;border:1px solid #bc5717}
.tag-gem{background:rgba(218,54,51,0.15);color:#ff6b6b;border:1px solid #da3633}
.tag-controlled{background:rgba(88,166,255,0.12);color:#79b8ff;border:1px solid #58a6ff}
.pina-card{background:linear-gradient(135deg,#1a1410,#1a1216);border:2px solid var(--pina);border-radius:12px;padding:24px;margin:20px 0}
.pina-card h2{color:#e8854a;border:none;margin:0 0 16px}
.pina-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:8px;margin:12px 0}
.stat-box{background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center}
.stat-box .label{font-size:0.65em;color:var(--text);text-transform:uppercase;letter-spacing:1px}
.stat-box .value{font-size:1.3em;font-weight:700;color:var(--text-bright)}
.stat-box.highlight .value{color:var(--accent2)}
.stat-box.warn .value{color:var(--warn)}
.why-pina{background:rgba(188,87,23,0.06);border-left:3px solid var(--pina);padding:16px;margin:16px 0;border-radius:0 8px 8px 0}
.why-pina ul{list-style:none;padding-left:0}
.why-pina li{padding:4px 0;padding-left:20px;position:relative}
.why-pina li::before{content:'▸';position:absolute;left:0;color:var(--pina)}
.gem-grid{display:grid;grid-template-columns:1fr;gap:16px;margin:16px 0}
.gem-card{background:var(--card);border:1px solid var(--border);border-radius:10px;overflow:hidden;transition:border-color 0.2s}
.gem-card:hover{border-color:var(--accent)}
.gem-card-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border)}
.gem-rank{font-size:1.5em;font-weight:800;color:var(--gem);min-width:32px}
.gem-name{font-size:1.15em;font-weight:600;color:var(--text-bright)}
.gem-name .zh{color:var(--text);font-size:0.85em;margin-left:6px}
.gem-score{text-align:right}
.gem-score .score-val{font-size:1.8em;font-weight:800;color:var(--accent2)}
.gem-score .score-label{font-size:0.65em;color:var(--text);text-transform:uppercase}
.gem-card-body{padding:16px 20px}
.gem-stats{display:grid;grid-template-columns:repeat(8,1fr);gap:4px;margin-bottom:12px}
.gem-stat{text-align:center;padding:6px 2px;background:rgba(255,255,255,0.02);border-radius:6px}
.gem-stat .label{font-size:0.6em;color:var(--text);text-transform:uppercase}
.gem-stat .value{font-size:1.1em;font-weight:700;color:var(--text-bright)}
.gem-stat.pina-match{background:rgba(188,87,23,0.1);border:1px solid rgba(188,87,23,0.3)}
.gem-stat.pina-match .value{color:#e8854a}
.gem-reasons{display:flex;flex-wrap:wrap;gap:4px;margin:8px 0}
.gem-reasons .reason{font-size:0.75em;background:rgba(88,166,255,0.08);color:var(--accent);border:1px solid rgba(88,166,255,0.2);border-radius:4px;padding:2px 8px}
.gem-comparison{margin-top:12px;font-size:0.85em}
.gem-comparison table{width:100%;border-collapse:collapse}
.gem-comparison th,.gem-comparison td{text-align:center;padding:6px 8px;border-bottom:1px solid var(--border)}
.gem-comparison th{color:var(--text);font-size:0.8em;text-transform:uppercase}
.gem-comparison .pina-col{color:#e8854a;font-weight:600}
.gem-comparison .diff-positive{color:var(--accent2)}
.gem-comparison .diff-negative{color:var(--danger)}
.gem-comparison .diff-neutral{color:var(--text)}
.gem-link{margin-top:8px}
.gem-link a{color:var(--accent);text-decoration:none;font-size:0.8em}
.gem-link a:hover{text-decoration:underline}
.methodology{background:rgba(88,166,255,0.04);border:1px solid rgba(88,166,255,0.15);border-radius:10px;padding:20px;margin:20px 0}
.methodology table{width:100%;border-collapse:collapse;margin-top:8px}
.methodology th,.methodology td{text-align:left;padding:8px;border-bottom:1px solid var(--border)}
.methodology th{color:var(--accent);font-size:0.85em}
.methodology td:first-child{font-weight:600;color:var(--text-bright)}
.data-sources{font-size:0.8em;color:var(--text);margin-top:24px;padding:12px;background:rgba(255,255,255,0.02);border-radius:8px}
.data-sources code{background:rgba(255,255,255,0.05);padding:1px 4px;border-radius:3px;color:var(--accent2)}
footer{text-align:center;margin-top:32px;padding:16px;border-top:1px solid var(--border);font-size:0.8em;color:var(--text)}
</style>
</head>
<body>
''')

# Title
html_parts.append('<h1>FC27 隐形好球员 Finder</h1>')
html_parts.append('<p class="subtitle">基于 FC26 Pina 特征模型，在 FC27 Gold 球员中筛选"数据不突出但实战好用"的球员 · 2026-09-04</p>')

# Pina Profile
html_parts.append('''
<div class="pina-card">
<h2><span class="tag tag-pina">FC26 PINA</span> Claudia Pina Medina · 克劳蒂亚·皮纳</h2>
<p style="color:var(--text)">FC26 Base Gold · 86 OVR · CAM · 9,200 coins · FUTBIN 社区评分 76.9</p>
<p style="color:#e8854a;font-size:0.9em;margin:8px 0">→ 她是"隐形好球员"的典型：86 OVR 在 CAM 里不起眼，79 PAC 让人忽视，但 87 DRI + 5★逆足 + 160cm 矮小体型 + Controlled 加速 + Technical PlayStyle 使实战手感极佳。FUTBIN 社区评分 76.9 远超 OVR 暗示的价值。</p>
<div class="pina-stats">
''')
html_parts.append(stat_box('PAC', 79, warn=True))
html_parts.append(stat_box('SHO', 86, highlight=True))
html_parts.append(stat_box('PAS', 83))
html_parts.append(stat_box('DRI', 87, highlight=True))
html_parts.append(stat_box('DEF', 45))
html_parts.append(stat_box('PHY', 71))
html_parts.append(stat_box('WF', '5★'))
html_parts.append(stat_box('SK', '4★'))
html_parts.append(stat_box('身高', 160, warn=True))
html_parts.append(stat_box('加速', 'Ctrl'))
html_parts.append(stat_box('IGS', 2189))
html_parts.append(stat_box('社区', 76.9, highlight=True))
html_parts.append('</div>')

html_parts.append('''
<div class="why-pina">
<h3 style="color:#e8854a">为什么 Pina 是"隐形好球员"的典型？</h3>
<ul>
<li><b>低速度被忽视</b> — PAC 79 在前锋/前腰里排倒数，大多数人直接跳过</li>
<li><b>高盘带是核心</b> — DRI 87 是精英级别，配合 Technical PlayStyle 在小空间极强</li>
<li><b>5★ 逆足</b> — 双脚都能射/传，防守方无法逼弱脚</li>
<li><b>160cm 矮小体型</b> — 重心低，转向快，手感极佳</li>
<li><b>Controlled 加速</b> — 不是 Explosive（短程爆发）也不是 Lengthy（长程冲刺），是均衡型</li>
<li><b>86 OVR 不起眼</b> — 不是 90+ 的明星卡，价格低（9200 coins），性价比极高</li>
<li><b>社区评分远高于 OVR</b> — FUTBIN 76.9 意味着真实玩家认可她的实战价值</li>
</ul>
</div>
</div>
''')

# Methodology
html_parts.append('''
<h2>筛选模型</h2>
<div class="methodology">
<p>从 FCMaster 项目内 <b>377 名球员</b>（129 Icon + 93 Hero + 152 Gold + 3 重复）中，对 <b>278 名有完整六维数据的球员</b>运行相似度打分模型。排除众所周知的超级巨星后，聚焦 Gold 卡中的"隐形好球员"。</p>
<table>
<tr><th>维度</th><th>Pina 参考值</th><th>打分逻辑</th><th>权重</th></tr>
<tr><td>PAC（速度）</td><td>79</td><td>≤80 得高分（被忽视的信号），≤82 得中分</td><td>25</td></tr>
<tr><td>DRI（盘带）</td><td>87</td><td>≥87 得高分，≥88 得额外分（精英盘带）</td><td>25</td></tr>
<tr><td>SHO（射门）</td><td>86</td><td>≥83 得分（攻击手属性）</td><td>10</td></tr>
<tr><td>Weak Foot（逆足）</td><td>5★</td><td>5★ 得满分，4★ 得中分</td><td>15</td></tr>
<tr><td>身高</td><td>160cm</td><td>≤165cm 得高分，≤170 得中分（矮小=灵活）</td><td>15</td></tr>
<tr><td>AcceleRATE</td><td>Controlled</td><td>Controlled 加分，Explosive 小加分</td><td>5</td></tr>
<tr><td>FUTBIN vs OVR 差值</td><td>+（社区更高）</td><td>差值 >0 按比例加分（社区认可）</td><td>15</td></tr>
<tr><td>OVR（综合评分）</td><td>86</td><td>≤87 得高分（非精英=隐藏），≤89 得中分</td><td>10</td></tr>
</table>
</div>
''')

# Hidden Gems
html_parts.append('<h2>FC27 隐形好球员 Top 13</h2>')
html_parts.append('<p style="color:var(--text);font-size:0.9em">以下球员按 Pina 相似度得分排序。已排除 Messi、Mbappé、Bellingham、Dembélé、Haaland、Vinicius、Yamal、Putellas、Bonmatí、Hansen、Kvaratskhelia 等众所周知的超级巨星。Pina 本人（FC27 升至 89 OVR）也排除。</p>')
html_parts.append('<div class="gem-grid">')

for i, p in enumerate(gems):
    rank = i + 1
    scored = scored_map.get(p['slug'], {})
    reasons = scored.get('reasons', [])
    
    # Tags
    tags = f'<span class="tag tag-gem">隐形好球员</span>'
    if p['acceleRATE'] == 'Controlled':
        tags += ' <span class="tag tag-controlled">Controlled</span>'
    elif p['acceleRATE'] == 'Explosive':
        tags += ' <span class="tag tag-controlled">Explosive</span>'
    
    # Match indicators (same as Pina)
    pac_match = p['pac'] == PINA['pac']
    dri_match = p['dri'] == PINA['dri']
    wf_match = p['weakFoot'] == PINA['weakFoot']
    height_match = p['height'] == PINA['height']
    
    html_parts.append(f'''
<div class="gem-card">
<div class="gem-card-header">
<div style="display:flex;align-items:center;gap:12px">
<span class="gem-rank">{rank}</span>
<div><span class="gem-name">{p['name']} <span class="zh">· {p['nameZh']}</span></span>
<br><span style="color:var(--text);font-size:0.8em">{p['rating']} OVR · {p['position']} · {tags}</span></div>
</div>
<div class="gem-score"><div class="score-val">{p['pinaScore']}</div><div class="score-label">Pina Score</div></div>
</div>
<div class="gem-card-body">
<div class="gem-stats">
{gem_stat('PAC', p['pac'], pac_match)}
{gem_stat('SHO', p['sho'])}
{gem_stat('PAS', p['pas'])}
{gem_stat('DRI', p['dri'], dri_match)}
{gem_stat('DEF', p['def'])}
{gem_stat('PHY', p['phy'])}
{gem_stat('WF', f"{p['weakFoot']}★", wf_match)}
{gem_stat('SK', f"{p['skills']}★")}
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:4px 0;font-size:0.8em">
<span>身高: <b style="color:{"#e8854a" if height_match else "var(--text)"}">{p['height']}cm</b>{" (= Pina)" if height_match else ""}</span>
<span>FUTBIN: <b style="color:var(--accent2)">{p['futbinRating']}</b> (差 +{round(p['futbinRating'] - p['rating'], 1)})</span>
</div>
<div class="gem-reasons">
''')
    for r in reasons[:6]:
        html_parts.append(f'<span class="reason">{r}</span>')
    html_parts.append('</div>')
    
    # Comparison table
    html_parts.append('<div class="gem-comparison"><table>')
    html_parts.append('<tr><th>对比</th><th class="pina-col">Pina FC26</th><th>FC27</th><th>差值</th></tr>')
    
    for label, key, pina_key, higher_better in [
        ('PAC', 'pac', 'pac', False), ('DRI', 'dri', 'dri', True),
        ('SHO', 'sho', 'sho', True), ('PAS', 'pas', 'pas', True),
        ('DEF', 'def', 'def', True), ('PHY', 'phy', 'phy', True),
    ]:
        val = p[key]
        pina_val = PINA[pina_key]
        cls, diff = diff_str(val, pina_val, higher_better)
        html_parts.append(f'<tr><td>{label}</td><td class="pina-col">{pina_val}</td><td>{val}</td><td class="{cls}">{diff}</td></tr>')
    
    # Height row
    h_cls, h_diff = diff_str(p['height'], PINA['height'], False)
    html_parts.append(f'<tr><td>身高</td><td class="pina-col">{PINA["height"]}</td><td>{p["height"]}</td><td class="{h_cls}">{h_diff}</td></tr>')
    
    # WF row
    wf_pina = PINA['weakFoot']
    wf_val = p['weakFoot']
    wf_d = wf_val - wf_pina
    if wf_d == 0:
        wf_cls, wf_diff = 'diff-neutral', '='
    else:
        wf_cls = 'diff-positive' if wf_d > 0 else 'diff-negative'
        wf_diff = f'{"+" if wf_d > 0 else ""}{wf_d}★'
    html_parts.append(f'<tr><td>WF</td><td class="pina-col">{wf_pina}★</td><td>{wf_val}★</td><td class="{wf_cls}">{wf_diff}</td></tr>')
    
    html_parts.append('</table></div>')
    
    # FUTBIN link
    html_parts.append(f'<div class="gem-link"><a href="{p["fc27Url"]}" target="_blank">→ FUTBIN FC27 卡页</a></div>')
    html_parts.append('</div></div>')

html_parts.append('</div>')

# Summary
html_parts.append('<h2>总结与推荐</h2>')
html_parts.append('<div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px;margin:16px 0">')
html_parts.append('<h3 style="color:var(--accent2)">最像 Pina 的三张卡</h3>')
html_parts.append('<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:0.9em">')
html_parts.append('<tr style="color:var(--text);border-bottom:1px solid var(--border)"><th style="text-align:left;padding:8px">球员</th><th>Score</th><th>OVR</th><th>PAC</th><th>DRI</th><th>SHO</th><th>DEF</th><th>PHY</th><th>WF</th><th>身高</th><th>核心相似点</th></tr>')

top3 = [
    (gems[0], 'PAC 79 完全一致 + DRI 90 + 矮小 + Controlled'),
    (gems[1], '5★逆足 + 160cm 完全一致 + DRI 90 + 社区差+5.4'),
    (gems[3], '160cm 完全一致 + DRI 88 + 5★技能 + 社区差+5.8'),
]
for p, desc in top3:
    html_parts.append(f'<tr style="border-bottom:1px solid var(--border)">')
    html_parts.append(f'<td style="padding:8px"><b>{p["name"]}</b></td>')
    html_parts.append(f'<td style="text-align:center">{p["pinaScore"]}</td>')
    html_parts.append(f'<td style="text-align:center">{p["rating"]}</td>')
    html_parts.append(f'<td style="text-align:center;color:{"#e8854a" if p["pac"]==PINA["pac"] else "var(--text)"}">{p["pac"]}</td>')
    html_parts.append(f'<td style="text-align:center">{p["dri"]}</td>')
    html_parts.append(f'<td style="text-align:center">{p["sho"]}</td>')
    html_parts.append(f'<td style="text-align:center">{p["def"]}</td>')
    html_parts.append(f'<td style="text-align:center">{p["phy"]}</td>')
    html_parts.append(f'<td style="text-align:center;color:{"#e8854a" if p["weakFoot"]==PINA["weakFoot"] else "var(--text)"}">{p["weakFoot"]}★</td>')
    html_parts.append(f'<td style="text-align:center;color:{"#e8854a" if p["height"]==PINA["height"] else "var(--text)"}">{p["height"]}</td>')
    html_parts.append(f'<td style="padding:8px;font-size:0.85em">{desc}</td>')
    html_parts.append('</tr>')

html_parts.append('</table></div>')

# Advice
html_parts.append('''
<div style="background:rgba(63,185,80,0.06);border-left:3px solid var(--accent2);padding:16px;margin:16px 0;border-radius:0 8px 8px 0">
<h3 style="color:var(--accent2)">实战建议</h3>
<ul style="list-style:none;padding-left:0">
<li style="padding:4px 0 4px 20px;position:relative"><span style="position:absolute;left:0;color:var(--accent2)">▸</span><b>Mariona Caldentey</b> 是最像 Pina 的球员：PAC 79 完全一致、DRI 90 比肩精英、165cm 矮小体型、Controlled 加速。在 FC27 里她就是"另一个 Pina"。</li>
<li style="padding:4px 0 4px 20px;position:relative"><span style="position:absolute;left:0;color:var(--accent2)">▸</span><b>Melchie Dumornay</b> 是 Pina 的升级版：5★ 逆足不变、160cm 不变、DRI 升至 90、PAC 升至 92（解决了 Pina 速度痛点）。88 OVR 但社区评分 93.4 说明实战远超纸面。</li>
<li style="padding:4px 0 4px 20px;position:relative"><span style="position:absolute;left:0;color:var(--accent2)">▸</span><b>Sakina Karchaoui</b> 是 LB 位的隐藏宝：160cm 极矮 + 5★ 技能 + DRI 88。87 OVR 价格低，社区评分差 +5.8 是全场最高认可。</li>
<li style="padding:4px 0 4px 20px;position:relative"><span style="position:absolute;left:0;color:var(--accent2)">▸</span><b>Bruno Fernandes</b> 是"低速隐藏卡"的极致：PAC 67 让人直接跳过，但 PAS 92 + SHO 85 + Controlled 让他在 CAM 位实战极强。社区评分差 +2.0 证明有人用出了价值。</li>
<li style="padding:4px 0 4px 20px;position:relative"><span style="position:absolute;left:0;color:var(--accent2)">▸</span><b>Katie McCabe</b> 与 Pina 最"同频"：同 86 OVR、同 PAC 79、同样 164cm 矮小、同样 Controlled。如果想要一张"新的 Pina"，她就是。</li>
</ul>
</div>
''')

# Data sources
html_parts.append('''
<div class="data-sources">
<h3 style="font-size:0.9em">数据来源</h3>
<p>本报告全部数据来自 FCMaster 项目本地文件，无需外部抓取：</p>
<ul style="list-style:none;padding-left:0;font-size:0.85em">
<li>• <code>icons/data/prices/fc26/base-icons.json</code> — 129 名 Icon 球员（含 rowText 完整属性串）</li>
<li>• <code>heroes/data/prices/fc26/base-heroes.json</code> — 93 名 Hero 球员（含 rowText + 价格 + 中文名）</li>
<li>• <code>gold/data/prices/fc26/fc26-first-month.json</code> — 152 名 Gold 球员（含 FC27 Rating/Position + 价格分析）</li>
<li>• <code>data/players/player-index.json</code> — 227 名球员 FC26↔FC27 双版本映射 + 中文名</li>
<li>• <code>evolution/players/fc27/eligible-players.json</code> — 134 名进化合格球员</li>
<li>• <code>/tmp/fc27-pina-analysis.json</code> — 66 名 FC27 Gold 球员详细六维数据（前期 Chrome 扩展抓取）</li>
</ul>
<p style="margin-top:8px">总计解析 <b>377 名球员</b>，其中 278 名有完整六维属性，运行 Pina 相似度模型后筛选出 13 张"隐形好球员"。</p>
</div>
''')

# Footer
html_parts.append('''
<footer>
<p>Generated by FCMaster Pina Hidden Gem Finder · 2026-09-04</p>
<p>数据截止：FC26 首月（2025-09-18 ~ 2025-10-17） · FC27 Gold 球员列表</p>
</footer>
</body>
</html>
''')

# Write
output = ''.join(html_parts)
with open(OUTPUT_DIR / 'fc27-pina-hidden-gem-report.html', 'w', encoding='utf-8') as f:
    f.write(output)

print(f'HTML report generated: {len(output)} bytes')
print(f'Players: {len(gems)}')

# Verify data correctness
print('\n=== Data verification ===')
for p in gems:
    print(f"{p['name']}: OVR={p['rating']} PAC={p['pac']} SHO={p['sho']} PAS={p['pas']} DRI={p['dri']} DEF={p['def']} PHY={p['phy']} WF={p['weakFoot']} SK={p['skills']} H={p['height']} Score={p['pinaScore']} FB={p['futbinRating']}")
