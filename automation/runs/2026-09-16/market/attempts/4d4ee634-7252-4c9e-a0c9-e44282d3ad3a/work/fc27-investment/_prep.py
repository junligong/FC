#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""为 HTML 报告准备图表数据：分层价格指数曲线（含 SMA）、雷达/三角评分、多空权重。
输入: deliverables/trading-agent/_findings.json + fc26 dashboard
输出: deliverables/trading-agent/_report-data.json
"""
# 运行位置无关：向上定位含 shared/config/project.json 的项目根（唯一配置源）后切目录
import os as _os, pathlib as _pl
_p=_pl.Path(__file__).resolve()
for _q in _p.parents:
    if (_q/"shared"/"config"/"project.json").exists():
        _os.chdir(_q); break
_WD=_p.parent  # 本脚本所在工作目录，中间产物只写这里

import json, statistics as st, math
BASE='apps/market/engine'
DASH=json.load(open(f'{BASE}/gold/data/prices/fc26/fc26-first-month-dashboard.json'))
F=json.load(open(_WD/'_findings.json'))
days=sorted(DASH['window']['days'])

def series(pred):
    out=[]
    for d in days:
        v=[p['prices']['cross'][d] for p in DASH['players']
           if p['status']=='captured' and isinstance(p['prices'].get('cross',{}).get(d),(int,float)) and pred(p)]
        out.append(st.median(v) if v else None)
    return out
def idx(s):
    b=s[0]
    return [None if x is None else round(x/b*100,2) for x in s]
def sma(s,n):
    o=[]
    for i in range(len(s)):
        w=[x for x in s[max(0,i-n+1):i+1] if x is not None]
        o.append(round(sum(w)/len(w),2) if len(w)==n else None)
    return o

allS=idx(series(lambda p: True))
lowS=idx(series(lambda p: (p['prices']['cross'].get(days[0]) or 1e18) < 10000))
midS=idx(series(lambda p: 10000 <= (p['prices']['cross'].get(days[0]) or 0) < 100000))
highS=idx(series(lambda p: (p['prices']['cross'].get(days[0]) or 0) >= 100000))

R={'days':days,'idx':{'all':allS,'low':lowS,'mid':midS,'high':highS},
   'sma7':sma(allS,7),'sma14':sma(allS,14),
   'sma7low':sma(lowS,7),
   'lowAbs':series(lambda p:(p['prices']['cross'].get(days[0]) or 1e18)<10000)}

# 五维评分（0-10），全部由实测数据折算
R['radar']={
 'labels':['价格趋势','定价锚点','机制友好度','供给与情绪','风险可控度'],
 'values':[3.5, 8.5, 6.0, 3.0, 6.0],
 'detail':{
  '价格趋势':'全样本首月中位 -25.7%、仅 37% 上涨；但 <1万档中位 +26.4%、胜率 68% → 结构性分化明显，整体趋势为负',
  '定价锚点':'OVR 变化与价格倍率秩相关 0.77，倍率表单调；+2 及以上中位 3.06 倍，-3 及以下不足 0.09 倍',
  '机制友好度':'campaign 变小、进化 PS+ 封顶 3、力量曲线平缓利好基础卡；但 SBC 扁平化取消位置/化学溢价，打法要重建',
  '供给与情绪':'可交易奖励与金币收益增加，供给端持续放量；首日抢筹情绪极高，57.9% 的卡在首周见顶',
  '风险可控度':'中位最大回撤 48.7%、72 张回撤超 50%；但低价档中位回撤仅 22.2%、波动 7.4%，可用限仓控制',
 }}

# 三方风险评分（0-10，越高越认同"积极建仓"）
R['riskTriangle']={
 'labels':['激进视角','中性视角','保守视角'],
 'values':[9.0,6.5,3.0],
 'detail':{
  '激进视角':'低价档首月胜率 68%、2-5千档 88%；买第7日持到第21日税后中位 +46.7% —— 不参与才是最大风险',
  '中性视角':'方向对但要分批：低价饲料为主仓、OVR 上调卡为辅仓、留现金；避开 ≥10 万大卡',
  '保守视角':'全样本首月中位 -25.7%，QS 地板或腰斩 55%，供给放量；老打法（位置/化学套利）被 SBC 扁平化废掉，应小仓位试水',
 }}

# 多空论点（权重 1-10）
R['bull']=[
 {'t':'低价档首月实证胜率 68%，2-5 千档达 88%（中位 +63.5%）','w':9},
 {'t':'OVR 上调 ≥+2 者预测价中位 3.06× 锚点，秩相关 0.77','w':9},
 {'t':'新增金特技者 1.69×，被削者仅 0.42×，杠杆清晰','w':8},
 {'t':'FC27 取消化学/位置要求，OVR 锚点更纯粹，模型更适用','w':7},
 {'t':'进化 PS+ 封顶 3、campaign 阵容缩小 → 基础卡生命周期延长','w':7},
 {'t':'六维合计 ≥+6 者 1.74×，属性与价格单调对应','w':6},
]
R['bear']=[
 {'t':'全样本首月中位 -25.7%，开服首日是全年最差买点','w':10},
 {'t':'10-30 万档中位 -62.3%、胜率 0%；≥100 万档同样 0%','w':9},
 {'t':'金卡 QS 650→290、最低 BIN 600→300，低价卡地板下移 55%','w':8},
 {'t':'中位最大回撤 48.7%，72 张回撤超 50%、21 张超 80%','w':8},
 {'t':'SBC 扁平化废掉位置/化学溢价，FC26 老打法需重建','w':7},
 {'t':'可交易奖励与金币收益增加，供给端持续压制价格','w':7},
 {'t':'评分持平者预测价仅 0.819×，「没变就是安全」是幻觉','w':6},
]

json.dump(R,open(_WD/'_report-data.json','w'),ensure_ascii=False,indent=1)
print('days',len(days))
print('all idx',allS[:6],'...',allS[-3:])
print('low idx',lowS[:6],'...',lowS[-3:])
print('mid idx',midS[:4],'...',midS[-2:])
print('high idx',highS[:4],'...',highS[-2:])
print('lowAbs',[round(x) if x else x for x in R['lowAbs']])
print('sma7',R['sma7'][:9])
