#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 FC27 开服布局报告（自包含 HTML）。
输入: _findings.json + _report-data.json
输出: deliverables/trading-agent/fc27-gold-analysis-2026-09-16.html
"""
# 运行位置无关：向上定位含 shared/config/project.json 的项目根（唯一配置源）后切目录
import os as _os, pathlib as _pl
_p=_pl.Path(__file__).resolve()
for _q in _p.parents:
    if (_q/"shared"/"config"/"project.json").exists():
        _os.chdir(_q); break
_WD=_p.parent  # 本脚本所在工作目录，中间产物只写这里

import json
UP='#ff6259'; DN='#4ec08a'   # 红涨绿跌（中国习惯）
F=json.load(open(_WD/'_findings.json'))
R=json.load(open(_WD/'_report-data.json'))
M=F['market']; D=F['distribution']

def yuan(x):
    if x is None: return '—'
    x=float(x)
    if x>=10000: return f'{x/10000:.1f}万'
    return f'{int(round(x)):,}'
def pctf(x,d=1):
    return '—' if x is None else f'{x*100:+.{d}f}%'

CLS=lambda v:'up' if (v or 0)>0 else ('dn' if (v or 0)<0 else 'fl')

rows_buy=[]
PLAN_A=[
 ('詹卢卡·曼奇尼','CB','84','新增金特技','1,000','1.18','低价后卫+SBC 消耗品，首月低价档典型标的'),
 ('安斯·干沙','CB','84','OVR +2','2,900','1.17','评分上调两档，价格仍在耗材区间'),
 ('瓦尔德马·安东','CB','84','新卡','1,000','—','无历史包袱，开服定价常被低估'),
 ('恩佐·费尔南德斯','CM','86','新卡','4,500','—','86 评分中场新卡，OVR 饲料需求稳定'),
 ('法比安·鲁伊斯','CM','86','新卡','4,500','—','同上，SBC 扁平化后 86 档价值更纯'),
 ('尤里安·廷伯','RB','84','新卡','4,500','—','84 档边卫，进化题材可承接'),
 ('费德里科·迪马尔科','LB','86','新增金特技','7,100','1.06','金特技加持，价格贴地板'),
 ('德克兰·赖斯','CDM','88','新增金特技','25,000','1.01','88 档高 OVR，SBC 扁平化后最吃香'),
 ('奥雷利安·楚阿梅尼','CDM','84','新增金特技','25,000','1.01','金特技 + 位置刚需'),
]
PLAN_B=[
 ('路易斯·迪亚斯','LM','85→88','ratio 0.38（全清单最低）','20,000','0.38','OVR +3 且新增金特技，现价不足 FC26 开服价四成'),
 ('威廉·帕乔','CB','86→89','ratio 1.30','250,000','1.30','评分 +3，后防线上弹性最足'),
 ('萨尔马·帕拉尔卢埃洛','LW','84→87','ratio 1.29','70,000','1.29','评分 +3，女足线高成长'),
 ('克维查·克瓦拉茨赫利亚','LW','87→89','ratio 0.54','100,000','0.54','评分 +2，现价约为 FC26 开服价一半'),
 ('崔妮蒂·罗德曼','LM','85→87','ratio 1.06','48,000','1.06','评分 +2，需留意金特技 -1'),
 ('格雷森·布雷默','CB','85→86','ratio 1.04','50,000','1.04','新增金特技，价格与 FC26 开服价持平'),
 ('皮耶罗·欣卡皮耶','LB','83→84','ratio 0.85','80,000','0.85','首月实证 +105.6%，低位弹性标的'),
 ('德西雷·杜埃','RW','85→86','ratio 1.17','84,000','1.17','评分 +1，年轻边锋'),
]
for n,pos,ovr,note,price,ratio,why in PLAN_A:
    rows_buy.append(f'<tr><td class="c-name">{n}</td><td class="c-pos">{pos}</td><td class="c-rating">{ovr}</td>'
                    f'<td class="c-type">{note}</td><td class="c-price">{price}</td><td class="c-note">{why}</td></tr>')
rows_buyB=[]
for n,pos,ovr,note,price,ratio,why in PLAN_B:
    rows_buyB.append(f'<tr><td class="c-name">{n}</td><td class="c-pos">{pos}</td><td class="c-rating">{ovr}</td>'
                     f'<td class="c-type">{note}</td><td class="c-price">{price}</td><td class="c-note">{why}</td></tr>')

rows_avoid=''.join(
  f'<tr><td class="c-name">{x["zh"]}</td><td class="c-pos">{x["ovr26"]}→{x["ovr27"]}</td>'
  f'<td class="c-dn">{x["ovr_diff"]:+d}</td><td class="c-dn">{x["ratio"]:.2f}×</td><td class="c-note">{x["reason"]}</td></tr>'
  for x in F['recAvoid'])

_rk={x['label']:x for x in F['tierRisk']}
_merged=[dict(t,**(_rk.get(t['label']) or {})) for t in F['byTier']]
tier_rows=''.join(
  f'<tr><td class="c-name">{t["label"]}</td><td>{t["n"]}</td>'
  f'<td class="{CLS(t["median"])}">{pctf(t["median"])}</td>'
  f'<td class="{CLS(t["mean"])}">{pctf(t["mean"])}</td>'
  f'<td>{t["winRate"]*100:.1f}%</td><td class="c-dn">-{(t.get("mdd") or 0)*100:.1f}%</td>'
  f'<td>{(t.get("vol") or 0)*100:.1f}%</td><td>{(t.get("riskScore") or 0):.0f}</td></tr>'
  for t in _merged)

anchor_rows=''.join(
  f'<tr><td>{a["ovr_diff"]:+d}</td><td>{a["n"]}</td>'
  f'<td class="{CLS(a["median"]-1)}">{a["median"]:.3f}×</td>'
  f'<td>{a["up1"]*100:.1f}%</td></tr>' for a in F['anchorByOvr'])
ps_rows=''.join(
  f'<tr><td>{p["gold_diff"]:+d}</td><td>{p["n"]}</td><td class="{CLS(p["median"]-1)}">{p["median"]:.3f}×</td></tr>'
  for p in F['anchorByPlaystyle'])
six_rows=''.join(
  f'<tr><td>{s["label"]}</td><td>{s["n"]}</td><td class="{CLS(s["median"]-1)}">{s["median"]:.3f}×</td></tr>'
  for s in F['anchorBySix'])
peak_rows=''.join(
  f'<tr><td>{p["label"]}</td><td>{p["n"]}</td><td>{p["share"]*100:.1f}%</td><td>第 {p["medianOffset"]+1} 天</td></tr>'
  for p in F['peakWeek1ByTier'])

grid_head=''.join(f'<th>卖第 {d} 天</th>' for d in F['lowTierGrid']['sellDays'])
def grid_rows(G,low=True):
    out=[]
    for r in G['rows']:
        cells=''.join('<td class="%s">%s</td>'%(CLS(c),pctf(c)) if c is not None else '<td class="c-quiet">—</td>' for c in r['netMedian'])
        out.append(f'<tr><td class="c-quiet">第 {r["buyDay"]} 天</td>{cells}</tr>')
    return ''.join(out)

worst_rows=''.join(f'<tr><td class="c-name">{w["name"]}</td><td class="c-quiet">{yuan(w["start"])}</td>'
                   f'<td class="c-quiet">{yuan(w["end"])}</td><td class="c-dn">{pctf(w["changePct"])}</td>'
                   f'<td class="c-quiet">{w["peakDate"]}</td></tr>' for w in F['worst5'][:5])
best_rows=''.join(f'<tr><td class="c-name">{w["name"]}</td><td class="c-quiet">{yuan(w["start"])}</td>'
                  f'<td class="c-quiet">{yuan(w["end"])}</td><td class="c-up">{pctf(w["changePct"])}</td>'
                  f'<td class="c-quiet">{w["peakDate"]}</td></tr>' for w in F['best5'][:5])

mech=[
 ('金卡快速出售 650 → 约 290','金稀有低价卡的地板下移 55%，最低 BIN 600→300','只买有 OVR 支撑、会被 SBC 消耗的卡；不做无差别扫货','dn'),
 ('普通金卡 QS 150 → 约 290','普通金卡地板抬高 93%','优先普通金卡，回避金稀有卡的高位接盘','up'),
 ('Common / Rare 分类合并','稀有度溢价消失，价格锚点收窄到 OVR','把 OVR 锚点模型当主武器，弱化稀有度套利','up'),
 ('SBC 扁平化打分（取消化学/位置）','「位置税」「化学税」归零，同 OVR 价格趋同','抛弃冷门位置/联赛套利，转向 OVR 分层与高 OVR 饲料','dn'),
 ('新增 Holographic 稀有度','同数值卡可达 3 倍价，出现新溢价维度','抽到即卖或长期持有，不作为主动建仓标的','nu'),
 ('进化分支 + 金特技封顶 3 个','力量曲线被压平，基础卡优势更持久','支撑中线持有基础金卡，不必急抛','up'),
 ('可交易奖励与金币收益增加','供给端持续放量，压制整体价格','首月下行可能比 FC26 更深，降低杠杆、留现金','dn'),
]
mech_rows=''.join(f'<tr><td class="c-name">{a}</td><td>{b}</td><td class="c-type">{c}</td></tr>' for a,b,c,_ in mech)

days_json=json.dumps(R['days'],ensure_ascii=False)
DASH_HTML = r'''<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FC27 开服布局分析报告 2026-09-16</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
:root{color-scheme:dark;--bg:#101713;--surface:#161e18;--surface2:#131b15;--line:#30392f;
--text:#f5f4eb;--muted:#aeb5aa;--quiet:#859080;--red:#ff6259;--up:#ff6259;--dn:#4ec08a;--gold:#e3b341}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
padding:26px 28px 56px;line-height:1.62;max-width:1180px;margin:0 auto}
h1{font-size:22px;font-weight:800;letter-spacing:-.3px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.badge{font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;background:rgba(255,98,89,.16);border:1px solid rgba(255,98,89,.42);color:var(--red)}
.badge.gold{background:rgba(227,179,65,.14);border-color:rgba(227,179,65,.4);color:var(--gold)}
.sub{color:var(--quiet);font-size:12.5px;margin:10px 0 22px}
h2{font-size:17px;font-weight:750;margin:34px 0 14px;display:flex;align-items:center;gap:9px}
h2:before{content:"";width:3px;height:17px;background:var(--red);border-radius:2px}
h3{font-size:14.5px;font-weight:700;margin:16px 0 8px}
.card{background:linear-gradient(180deg,var(--surface),var(--surface2));border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-bottom:12px}
.verdict{background:linear-gradient(135deg,#3a1512,#241512 55%,#2b1f0e);border:1px solid rgba(255,98,89,.42)}
.verdict .big{font-size:40px;font-weight:900;letter-spacing:-1px;line-height:1.1;color:#ff8b84}
.verdict .big small{font-size:15px;font-weight:700;color:var(--gold);margin-left:10px}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 4px}
.chip{font-size:11.5px;font-weight:700;padding:4px 11px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid var(--line);color:var(--muted)}
.chip.r{background:rgba(255,98,89,.15);border-color:rgba(255,98,89,.4);color:#ff8b84}
.chip.g{background:rgba(78,192,138,.12);border-color:rgba(78,192,138,.4);color:#4ec08a}
.chip.y{background:rgba(227,179,65,.14);border-color:rgba(227,179,65,.4);color:var(--gold)}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px}
.grid4 .cell{background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.08);border-radius:9px;padding:11px 12px}
.cell .k{font-size:11px;color:var(--quiet);font-weight:600;letter-spacing:.03em}
.cell .v{font-size:16px;font-weight:800;margin-top:3px}
.cell .n{font-size:11px;color:var(--quiet);margin-top:2px}
.chart-wrap{position:relative;height:330px}
.chart-wrap.tall{height:380px}
.chart-wrap.radar{height:360px}
.tbl-wrap{overflow-x:auto}
.tbl{width:100%;border-collapse:collapse;font-size:12.5px}
th{text-align:left;color:var(--quiet);font-weight:600;padding:8px 9px;border-bottom:1px solid var(--line);font-size:11.5px;letter-spacing:.03em;white-space:nowrap}
td{padding:7px 9px;border-bottom:1px solid #232c24;vertical-align:top}
tr:last-child td{border-bottom:0}
tbody tr:hover{background:#1a211b}
.c-name{font-weight:650}
.c-price{color:var(--gold);font-weight:700;white-space:nowrap}
.c-pos,.c-rating{color:var(--muted)}
.c-type{color:var(--quiet);font-size:12px}
.c-note{color:var(--quiet);font-size:11.5px}
.c-quiet{color:var(--quiet)}
.c-up,.up{color:var(--up);font-weight:700}
.c-dn,.dn{color:var(--dn);font-weight:700}
.fl{color:var(--muted)}
ul{padding-left:19px}li{margin:6px 0;font-size:13px;color:var(--muted)}
li b{color:var(--text)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.kv{display:flex;justify-content:space-between;gap:12px;font-size:12.5px;padding:6px 0;border-bottom:1px dashed #263027}
.kv:last-child{border-bottom:0}
.kv span:first-child{color:var(--quiet)}
.kv span:last-child{font-weight:700}
.disclaimer{color:var(--quiet);font-size:12px;padding:16px 18px;border-top:1px solid var(--line);margin-top:30px;line-height:1.7}
.note{background:rgba(227,179,65,.08);border-left:3px solid var(--gold);border-radius:0 8px 8px 0;padding:10px 14px;font-size:12.5px;color:var(--muted);margin:12px 0}
@media(max-width:820px){.grid4{grid-template-columns:1fr 1fr}.two{grid-template-columns:1fr}}
</style></head><body>

<h1>FC27 开服布局分析报告 <span class="badge">数据驱动</span><span class="badge gold">FC26 首月实证</span></h1>
<div class="sub">样本：FC26 开服首月（2025-09-18 → 2025-10-17）Cross 平台 152 张可追踪金卡 × 30 天日频价格 · FC26→FC27 对照 227 人 · 报告日期 2026-09-16</div>

<h2>一、决策卡片</h2>
<div class="card verdict">
  <div class="big">BUY <small>结构性做多 · 分层限仓 · 非全面看多</small></div>
  <div class="chips">
    <span class="chip r">信心水平：中高</span>
    <span class="chip y">风险等级：中高</span>
    <span class="chip">建议总仓位：首月 ≤ 40%</span>
    <span class="chip g">明确回避：≥10 万大卡 / OVR 下调卡</span>
  </div>
  <div class="grid4">
    <div class="cell"><div class="k">主仓方向</div><div class="v" style="color:#ff8b84">低价档耗材</div><div class="n">开盘 &lt; 1 万 · 首月中位 +26.4%</div></div>
    <div class="cell"><div class="k">辅仓方向</div><div class="v" style="color:#e3b341">OVR 上调 ≥ +2</div><div class="n">预测价中位 3.06× 锚点</div></div>
    <div class="cell"><div class="k">最佳建仓窗口</div><div class="v">开服第 5 – 9 天</div><div class="n">避开首日溢价，兑现第 20 – 24 天</div></div>
    <div class="cell"><div class="k">关键回避</div><div class="v" style="color:#4ec08a">≥ 10 万大卡</div><div class="n">10–30 万档首月胜率 0%</div></div>
  </div>
</div>

<h2>二、核心结论</h2>
<div class="card">
<ul>
<li><b>FC26 首月不是普涨行情，而是极端分层行情。</b>152 张金卡里下跌 96 张、上涨 56 张，逐卡涨跌幅中位 <b class="c-dn">-25.7%</b>、均值 -10.6%；但按开盘价分层后规律立刻清晰：<b>越贵的卡跌得越狠，最便宜的卡反而在涨。</b></li>
<li><b>开盘价是最强的单一解释变量。</b>开盘 &lt; 1 万的一档首月中位 <b class="c-up">+26.4%</b>、胜率 68%（其中 2–5 千档中位 +63.5%、胜率 88%）；而 1–10 万档中位 <b class="c-dn">-51.0%</b>、10–30 万档 <b class="c-dn">-62.3%</b> 且胜率 0%。log(开盘价) 与首月涨跌幅的相关系数 <b>-0.417</b>。</li>
<li><b>峰值时点随价格档位单调前移。</b>≥100 万档 <b class="c-dn">100%</b> 在首周见顶（中位就是开服当天）、10–30 万档 86.7%（中位第 2 天）、1–10 万档 75%；而 &lt; 1 万档只有 30.3% 在首周见顶，中位峰值被推迟到<b>开服后第 22 天</b>。大卡是「开服抢筹→迅速回落」，小卡是「先沉寂→后段发力」。</li>
<li><b>能力值是 FC27 定价的核心锚点，解释力很强。</b>OVR 变化与「FC27 预测价 ÷ FC26 开服价」倍率的秩相关达 <b>0.77</b>：OVR 每上调 1 点倍率约 1.33×、+2 及以上中位 <b>3.06×</b>；而下调 1 点只剩 0.40×、下调 3 点仅 0.08×。金特技是放大器：新增 1 个 <b>1.69×</b>，被削 1 个掉到 <b>0.42×</b>。</li>
<li><b>FC27 的机制改动会同时放大机会与风险。</b>campaign 缩容、进化金特技封顶 3 个，利好基础卡生命周期；但金卡快速出售地板或从 650 砍到约 290、可交易奖励增加，意味着低价档的「地板保护」变薄、供给端持续放量——<b>FC27 首月的下行可能比 FC26 更深，必须降杠杆。</b></li>
</ul>
<div class="note"><b>一句话结论：</b>不要在开服首日买任何卡。真正的钱在「低价档 + 有 OVR 支撑 + SBC 会消耗」的交集里，等首周中后段分批进，第 3 周兑现；所有 ≥10 万的大卡在首月都是单边下行，别接盘。</div>
</div>

<h2>三、综合评分雷达</h2>
<div class="card">
  <div class="chart-wrap radar"><canvas id="radarChart"></canvas></div>
  <div class="two" style="margin-top:14px">
    __RADAR_DETAIL__
  </div>
</div>

<h2>四、价格走势：分层指数（FC26 首月，基期 = 100）</h2>
<div class="card">
  <div class="chart-wrap tall"><canvas id="priceChart"></canvas></div>
  <div class="note">基期为开服首日中位价（2025-09-18 = 100）。灰色虚线为全样本 7 日均线。四条曲线的终点差异是本报告最重要的一张图：<b class="c-up">低价档收于 150.1</b>，而<b class="c-dn">中价档 36.8、高价档 45.1、全样本 74.9</b>。</div>
</div>

<h2>五、开盘价格分档表现与风险</h2>
<div class="card">
  <div class="chart-wrap"><canvas id="tierChart"></canvas></div>
  <div class="tbl-wrap" style="margin-top:16px">
  <table class="tbl"><thead><tr><th>开盘价档位</th><th>样本</th><th>中位涨跌</th><th>均值涨跌</th><th>上涨占比</th><th>中位最大回撤</th><th>中位日波动</th><th>风险分</th></tr></thead>
  <tbody>__TIER_ROWS__</tbody></table></div>
  <div class="note">风险分来自项目内部模型（日波动率与最大回撤加权，0–100，越高越危险）。注意 <b>&lt;1 万档的收益最高、回撤最小、风险分最低（28）</b>——这是首月唯一「高收益低风险」的组合。</div>
</div>

<h2>六、定价锚点：OVR 与金特技的价格弹性</h2>
<div class="card two">
  <div>
    <h3>OVR 变化 → 预测价 ÷ FC26 开服价</h3>
    <div class="chart-wrap"><canvas id="anchorChart"></canvas></div>
    <div class="tbl-wrap" style="margin-top:12px">
    <table class="tbl"><thead><tr><th>OVR 变化</th><th>样本</th><th>中位倍率</th><th>倍率 &gt; 1 占比</th></tr></thead><tbody>__ANCHOR_ROWS__</tbody></table></div>
  </div>
  <div>
    <h3>金特技变化 → 中位倍率</h3>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>金特技变化</th><th>样本</th><th>中位倍率</th></tr></thead><tbody>__PS_ROWS__</tbody></table></div>
    <h3 style="margin-top:18px">六维属性合计变化 → 中位倍率</h3>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>六维合计变化</th><th>样本</th><th>中位倍率</th></tr></thead><tbody>__SIX_ROWS__</tbody></table></div>
    <div class="note">读法：倍率是「FC27 预测价相对 FC26 开服价」的中位数。OVR 定方向、金特技加杠杆、六维属性做微调，三者同向叠加时弹性最猛。</div>
  </div>
</div>

<h2>七、峰值时点：谁在首周见顶</h2>
<div class="card">
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>开盘价档位</th><th>样本</th><th>首周内见顶占比</th><th>中位见顶时点</th></tr></thead><tbody>__PEAK_ROWS__</tbody></table></div>
  <div class="note">全样本有 <b>57.9%</b> 的金卡在开服首周内见顶。价格档位越高，「见顶越早」越极端——大卡的中位见顶时点就是<b>开服当天</b>。</div>
</div>

<h2>八、多空论点对比</h2>
<div class="card">
  <div class="chart-wrap tall"><canvas id="debateChart"></canvas></div>
  <div class="two" style="margin-top:14px">
    <div><h3 style="color:#ff8b84">多头论据</h3><ul>__BULL_LIST__</ul></div>
    <div><h3 style="color:#4ec08a">空头论据</h3><ul>__BEAR_LIST__</ul></div>
  </div>
  <div class="note"><b>裁决：</b>空头在「市场整体 Beta」上完全正确——首月全样本中位 -25.7%、开服首日是最差买点；多头在「结构性分层」上完全正确——低价档 +26.4%、OVR 上调卡 3.06×。两者并不矛盾：<b>买对结构、避开大盘，才是这份报告的操作含义。</b></div>
</div>

<h2>九、风险评估：三方视角</h2>
<div class="card two">
  <div class="chart-wrap radar"><canvas id="riskChart"></canvas></div>
  <div>
    <div class="kv"><span>全样本中位最大回撤</span><span class="c-dn">-48.7%</span></div>
    <div class="kv"><span>回撤超 50% 的卡</span><span class="c-dn">72 / 152</span></div>
    <div class="kv"><span>回撤超 80% 的卡</span><span class="c-dn">21 / 152</span></div>
    <div class="kv"><span>回撤超 90% 的卡</span><span class="c-dn">6 / 152</span></div>
    <div class="kv"><span>低价档中位最大回撤</span><span class="c-up">-22.2%</span></div>
    <div class="kv"><span>低价档中位日波动</span><span class="c-up">7.4%</span></div>
    <div class="kv"><span>全样本中位日波动</span><span>8.4%</span></div>
    <div class="kv"><span>买卖税</span><span>5%（卖出扣）</span></div>
    <div class="note" style="margin-top:10px"><b>风险主管裁决：</b>三方分歧不在方向，而在仓位。激进方要求打满低价档；保守方指出地板下移与供给放量；中性方给出可执行折中——<b>低价饲料为主仓（约占首月可用资金的 60%）、OVR 上调卡为辅仓（约 30%）、留 10% 现金</b>，且总仓位首月不超过 40%。</div>
  </div>
</div>

<h2>十、FC27 建议买入清单</h2>
<div class="card">
  <h3>A 组 · 首月交易盘（主仓，开盘 ≤ 1 万，靠流动性与 SBC 消耗赚钱）</h3>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>球员</th><th>位置</th><th>OVR</th><th>入选理由</th><th>预测价（easysbc）</th><th>说明</th></tr></thead><tbody>__BUY_A__</tbody></table></div>
  <h3 style="margin-top:20px">B 组 · 能力值上调盘（辅仓，中线 30–90 天，等首月出清后再建仓）</h3>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>球员</th><th>位置</th><th>OVR 变化</th><th>价格锚点</th><th>预测价</th><th>说明</th></tr></thead><tbody>__BUY_B__</tbody></table></div>
  <div class="note"><b>B 组为什么不能开服就买：</b>这些卡能力值上调是「长期锚点」，不是「首月护身符」——FC26 首月里 1–10 万档的胜率只有 16.1%。必须等首月泡沫出清、价格贴近 OVR 锚点后再分批介入。</div>
</div>

<h2>十一、FC27 明确回避清单</h2>
<div class="card">
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>球员</th><th>OVR 变化</th><th>变化幅度</th><th>预测价 / FC26 开服价</th><th>回避理由</th></tr></thead><tbody>__AVOID_ROWS__</tbody></table></div>
  <ul style="margin-top:12px">
    <li><b>所有 ≥10 万的卡：</b>10–30 万档首月中位 -62.3%、胜率 0%；≥100 万档同样 0%。开服抢筹价就是阶段性最高价。</li>
    <li><b>OVR 持平的卡：</b>预测价中位仅为 FC26 开服价的 <b>0.819×</b>——「评分没变 = 安全」是典型的估值幻觉。</li>
    <li><b>金特技被削的卡：</b>被削 1 个金特技，倍率从 1.69× 直接掉到 0.42×，杀伤力不亚于 OVR 下调。</li>
  </ul>
</div>

<h2>十二、操作节奏：买入/卖出时点矩阵</h2>
<div class="card">
  <h3>低价档（开盘 &lt; 1 万，n=66）· 税后中位收益</h3>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>买入时点</th>__GRID_HEAD__</tr></thead><tbody>__GRID_LOW__</tbody></table></div>
  <h3 style="margin-top:20px">中价档（开盘 1–10 万，n=56）· 税后中位收益</h3>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>买入时点</th>__GRID_HEAD__</tr></thead><tbody>__GRID_MID__</tbody></table></div>
  <div class="note"><b>两张表放在一起看，结论就无可辩驳：</b>低价档最优组合是「<b class="c-up">开服第 7 天买入 → 第 21 天卖出，税后中位 +46.7%</b>」；而中价档<b class="c-dn">整张表全是负数</b>，最好的格子也只有 -11.1%。同一个市场、同一个时间窗，选择哪一档比择时重要得多。</div>
</div>

<h2>十三、FC27 机制变更与应对</h2>
<div class="card">
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>FC27 机制变更</th><th>对卡价的影响</th><th>应对策略</th></tr></thead><tbody>__MECH_ROWS__</tbody></table></div>
  <div class="note">金卡快速出售与 Common/Rare 合并目前来自封闭测试泄露，<b>EA 仍有在 9 月 25 日正式开服前调整的可能</b>。若正式版维持 650 的旧地板，则 FC26 的低价档规律可以更放心地平移；若确认砍到 290，则低价档的仓位要再降一档。</div>
</div>

<h2>十四、首月最差与最强样本（FC26 实证）</h2>
<div class="card two">
  <div><h3 style="color:#4ec08a">跌幅最深的 5 张</h3>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>球员</th><th>开服价</th><th>月末价</th><th>首月涨跌</th><th>见顶日</th></tr></thead><tbody>__WORST__</tbody></table></div></div>
  <div><h3 style="color:#ff8b84">涨幅最高的 5 张</h3>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>球员</th><th>开服价</th><th>月末价</th><th>首月涨跌</th><th>见顶日</th></tr></thead><tbody>__BEST__</tbody></table></div></div>
</div>

<div class="disclaimer">
<b>数据来源与口径。</b>价格与逐日曲线：FUTBIN 历史价格（FC26，Cross 平台，2025-09-18 → 2025-10-17，152 张金卡 × 30 天，采集完整率 100%）；FC26→FC27 属性与特技对照：项目内 227 人对照库；FC27 预测价：easysbc.io。交易成本按 5% 卖出税折算，收益矩阵均为税后中位数。<br>
<b>方法边界。</b>本文为历史数据回测与统计归纳，不是对 FC27 实际价格的预测。FC27 的经济机制仍在变动，样本量为 152 张卡、时间窗仅 30 天，结论对极端事件（大版本补丁、活动节奏变化）不具备稳健性。<br>
<b>免责声明。</b>本内容为基于公开数据的虚拟游戏市场研究，仅用于《EA SPORTS FC》游戏内的虚拟物品决策参考，<b>不构成任何投资建议、证券建议或现实世界资产配置建议</b>。虚拟市场有风险，游戏道具价格可归零，请勿据此进行任何现实货币的投入。报告由 AI 基于公开数据整理生成。
</div>

<script>
const DAYS=__DAYS__;
const IDX=__IDX__, SMA7=__SMA7__, SMA14=__SMA14__;
const UP='#ff6259', DN='#4ec08a', GOLD='#e3b341', TEAL='#5fc9e8', MUTED='#859080', TEXT='#f5f4eb', LINE='#30392f';
Chart.defaults.color=MUTED; Chart.defaults.font.family='-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
Chart.defaults.font.size=11;
const gridc={color:'rgba(48,57,47,.75)'};

new Chart(document.getElementById('priceChart'),{type:'line',
 data:{labels:DAYS,datasets:[
  {label:'全样本中位价指数',data:IDX.all,borderColor:MUTED,borderWidth:2,tension:.25,pointRadius:0},
  {label:'低价档 <1万',data:IDX.low,borderColor:UP,borderWidth:2.6,tension:.25,pointRadius:0},
  {label:'中价档 1-10万',data:IDX.mid,borderColor:DN,borderWidth:2.2,tension:.25,pointRadius:0},
  {label:'高价档 ≥10万',data:IDX.high,borderColor:TEAL,borderWidth:2.2,tension:.25,pointRadius:0,borderDash:[5,4]},
  {label:'全样本 7 日均线',data:SMA7,borderColor:'rgba(174,181,170,.55)',borderWidth:1.4,tension:.3,pointRadius:0,borderDash:[3,4]},
 ]},
 options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
  plugins:{legend:{labels:{boxWidth:12,boxHeight:2,padding:14}},
   tooltip:{callbacks:{label:c=>c.dataset.label+'：'+c.parsed.y.toFixed(1)}}},
  scales:{y:{grid:gridc,title:{display:true,text:'指数（2025-09-18 = 100）'}},
          x:{grid:{display:false},ticks:{maxTicksLimit:10}}}}});

new Chart(document.getElementById('tierChart'),{type:'bar',
 data:{labels:__TIER_LABELS__,datasets:[
  {label:'中位涨跌幅',data:__TIER_MED__,backgroundColor:__TIER_COLORS__,borderRadius:5},
  {label:'上涨占比',data:__TIER_WIN__,backgroundColor:'rgba(227,179,65,.55)',borderRadius:5,yAxisID:'y1'},
 ]},
 options:{responsive:true,maintainAspectRatio:false,
  plugins:{legend:{labels:{boxWidth:12,boxHeight:2}},tooltip:{callbacks:{label:c=>c.dataset.label+'：'+(c.datasetIndex===0?(c.parsed.y*100).toFixed(1)+'%':(c.parsed.y*100).toFixed(0)+'%')}}},
  scales:{y:{grid:gridc,ticks:{callback:v=>(v*100).toFixed(0)+'%'},title:{display:true,text:'涨跌幅'}},
   y1:{position:'right',grid:{display:false},min:0,max:1,ticks:{callback:v=>(v*100).toFixed(0)+'%',color:GOLD},title:{display:true,text:'上涨占比',color:GOLD}},
   x:{grid:{display:false}}}}});

new Chart(document.getElementById('radarChart'),{type:'radar',
 data:{labels:__RADAR_LABELS__,datasets:[{label:'FC27 卡市综合评分',data:__RADAR_VALUES__,
  backgroundColor:'rgba(255,98,89,.22)',borderColor:UP,borderWidth:2,pointBackgroundColor:UP,pointRadius:4}]},
 options:{responsive:true,maintainAspectRatio:false,
  plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.parsed.r+' / 10'}}},
  scales:{r:{min:0,max:10,grid:gridc,angleLines:gridc,ticks:{stepSize:2,backdropColor:'transparent',color:MUTED},pointLabels:{color:TEXT,font:{size:12.5,weight:'600'}}}}}});

new Chart(document.getElementById('riskChart'),{type:'radar',
 data:{labels:__RISK_LABELS__,datasets:[{label:'对「积极建仓」的认同度',data:__RISK_VALUES__,
  backgroundColor:'rgba(227,179,65,.20)',borderColor:GOLD,borderWidth:2,pointBackgroundColor:GOLD,pointRadius:5}]},
 options:{responsive:true,maintainAspectRatio:false,
  plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.parsed.r+' / 10'}}},
  scales:{r:{min:0,max:10,grid:gridc,angleLines:gridc,ticks:{stepSize:2,backdropColor:'transparent',color:MUTED},pointLabels:{color:TEXT,font:{size:12.5,weight:'600'}}}}}});

new Chart(document.getElementById('anchorChart'),{type:'bar',
 data:{labels:__ANCHOR_LABELS__,datasets:[{label:'预测价 ÷ FC26 开服价（中位）',data:__ANCHOR_VALUES__,
  backgroundColor:__ANCHOR_COLORS__,borderRadius:5}]},
 options:{responsive:true,maintainAspectRatio:false,
  plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.parsed.y.toFixed(3)+'×'}}},
  scales:{y:{grid:gridc,ticks:{callback:v=>v.toFixed(1)+'×'}},x:{grid:{display:false}}}}});

new Chart(document.getElementById('debateChart'),{type:'bar',
 data:{labels:[...__BULL_T__.map((_,i)=>'多头 '+(i+1)),...__BEAR_T__.map((_,i)=>'空头 '+(i+1))],
  datasets:[{label:'论据权重',data:[...__BULL_W__,...__BEAR_W__],
   backgroundColor:[...__BULL_W__.map(()=>UP),...__BEAR_W__.map(()=>DN)],borderRadius:4}]},
 options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
  plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>{const i=c.dataIndex;
    return __BULL_T__.concat(__BEAR_T__)[i]+'　权重 '+c.parsed.x;}}}},
  scales:{x:{min:0,max:10,grid:gridc,title:{display:true,text:'论点权重（1–10）'}},y:{grid:{display:false}}}}});
</script>
</body></html>'''

RADAR_DETAIL=''.join(f'<div class="kv"><span>{k}</span></div><div class="c-note" style="margin:-2px 0 8px">{v}</div>'
                     for k,v in R['radar']['detail'].items())
BULL_LIST=''.join(f'<li><b>权重 {b["w"]}</b> · {b["t"]}</li>' for b in R['bull'])
BEAR_LIST=''.join(f'<li><b>权重 {b["w"]}</b> · {b["t"]}</li>' for b in R['bear'])

out=DASH_HTML
rep={
 '__RADAR_DETAIL__':RADAR_DETAIL,'__TIER_ROWS__':tier_rows,
 '__ANCHOR_ROWS__':anchor_rows,'__PS_ROWS__':ps_rows,'__SIX_ROWS__':six_rows,
 '__PEAK_ROWS__':peak_rows,'__BULL_LIST__':BULL_LIST,'__BEAR_LIST__':BEAR_LIST,
 '__BUY_A__':''.join(rows_buy),'__BUY_B__':''.join(rows_buyB),'__AVOID_ROWS__':rows_avoid,
 '__GRID_HEAD__':grid_head,'__GRID_LOW__':grid_rows(F['lowTierGrid']),'__GRID_MID__':grid_rows(F['midTierGrid']),
 '__MECH_ROWS__':mech_rows,'__WORST__':worst_rows,'__BEST__':best_rows,
 '__DAYS__':days_json,'__IDX__':json.dumps(R['idx']),'__SMA7__':json.dumps(R['sma7']),'__SMA14__':json.dumps(R['sma14']),
 '__TIER_LABELS__':json.dumps([t['label'] for t in _merged],ensure_ascii=False),
 '__TIER_MED__':json.dumps([t['median'] for t in _merged]),
 '__TIER_WIN__':json.dumps([t['winRate'] for t in _merged]),
 '__TIER_COLORS__':json.dumps([UP if t['median']>0 else DN for t in _merged]),
 '__RADAR_LABELS__':json.dumps(R['radar']['labels'],ensure_ascii=False),
 '__RADAR_VALUES__':json.dumps(R['radar']['values']),
 '__RISK_LABELS__':json.dumps(R['riskTriangle']['labels'],ensure_ascii=False),
 '__RISK_VALUES__':json.dumps(R['riskTriangle']['values']),
 '__ANCHOR_LABELS__':json.dumps([f"{a['ovr_diff']:+d} ({a['n']}人)" for a in F['anchorByOvr']],ensure_ascii=False),
 '__ANCHOR_VALUES__':json.dumps([a['median'] for a in F['anchorByOvr']]),
 '__ANCHOR_COLORS__':json.dumps([UP if a['median']>1 else DN for a in F['anchorByOvr']]),
 '__BULL_T__':json.dumps([b['t'] for b in R['bull']],ensure_ascii=False),
 '__BULL_W__':json.dumps([b['w'] for b in R['bull']]),
 '__BEAR_T__':json.dumps([b['t'] for b in R['bear']],ensure_ascii=False),
 '__BEAR_W__':json.dumps([b['w'] for b in R['bear']]),
}
for k,v in rep.items(): out=out.replace(k,v)
open('deliverables/trading-agent/fc27-gold-analysis-2026-09-16.html','w').write(out)
print('written',len(out),'bytes')
assert '__' not in out.replace('__BULL',''), [x for x in rep if x in out]
