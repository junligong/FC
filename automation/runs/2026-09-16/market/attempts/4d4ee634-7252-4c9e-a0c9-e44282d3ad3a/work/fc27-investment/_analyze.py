#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""FC26 开服首月卡价 + FC27 定价锚点 全量量化分析。
输入: apps/market/engine/gold/data/prices/fc26/*.json, apps/market/engine/data/analysis/fc27-top200/*.json
输出: deliverables/trading-agent/_findings.json
"""
# 运行位置无关：向上定位含 shared/config/project.json 的项目根（唯一配置源）后切目录
import os as _os, pathlib as _pl
_p=_pl.Path(__file__).resolve()
for _q in _p.parents:
    if (_q/"shared"/"config"/"project.json").exists():
        _os.chdir(_q); break
_WD=_p.parent  # 本脚本所在工作目录，中间产物只写这里

import json, csv, math, statistics as st
from collections import defaultdict, Counter

BASE = 'apps/market/engine'
DASH = json.load(open(f'{BASE}/gold/data/prices/fc26/fc26-first-month-dashboard.json'))
MATRIX = json.load(open(f'{BASE}/data/analysis/fc27-top200/fc27-price-matrix.json'))
REC = json.load(open(f'{BASE}/data/analysis/fc27-top200/fc27-recommendations.json'))
DB26 = json.load(open(f'{BASE}/data/players/database/fc26.json'))['players']
EASY = json.load(open(f'{BASE}/gold/data/prices/easysbc/fc27-gold-prices.json'))

def med(v):
    v=[x for x in v if x is not None and math.isfinite(x)]
    return st.median(v) if v else None
def avg(v):
    v=[x for x in v if x is not None and math.isfinite(x)]
    return sum(v)/len(v) if v else None
def pct(v,q):
    v=sorted([x for x in v if x is not None and math.isfinite(x)])
    if not v: return None
    i=min(len(v)-1,max(0,int(round(q*(len(v)-1)))))
    return v[i]
def r(x,n=4):
    return None if x is None else round(x,n)

F = {}

# ---------- 1. 大盘 ----------
cross = DASH['summary']['cross']
F['market'] = {
  'launchDate': DASH['launchDate'], 'window': DASH['window'],
  'players': cross['overall']['completePlayers'],
  'medianStart': cross['overall']['marketMedianStart'],
  'medianEnd': cross['overall']['marketMedianEnd'],
  'medianChangePct': r(cross['overall']['marketMedianChangePct']),
  'medianPlayerChangePct': r(cross['overall']['medianPlayerChangePct']),
  'signalCounts': cross['signalCounts'],
  'dailyMedian': cross['dailyMedian'],
  'periods': {k:{'label':v['label'],'start':v['start'],'end':v['end'],
                 'medianChangePct': r(v['marketMedianChangePct']),
                 'gainers':v['gainers'],'losers':v['losers'],'flat':v.get('flat',0),
                 'medianPlayerChangePct': r(v['medianPlayerChangePct'])} for k,v in cross['periods'].items()},
  'taxRate': DASH['tradingMethod']['taxRate'],
}

# ---------- 2. 逐球员 ----------
players=[]
for p in DASH['players']:
    a = p.get('analysis',{}).get('cross')
    if not a or p.get('status')!='captured': continue
    pr = p['prices'].get('cross',{})
    vals = {d:v for d,v in pr.items() if isinstance(v,(int,float))}
    if len(vals)<30: continue
    ov = a['overall']
    players.append({
      'slug':p['slug'],'name':p['name'],'nameZh':p.get('nameZh') or p['name'],
      'groups':p.get('rankByGroup') or [],
      'start':ov.get('start'),'end':ov.get('end'),
      'changePct':ov.get('changePct'),
      'signal':a.get('signal',{}).get('label') if isinstance(a.get('signal'),dict) else a.get('signal'),
      'vol':a.get('trading',{}).get('dailyVolatility'),'mdd':a.get('trading',{}).get('maxDrawdown'),
      'pricePosition':a.get('trading',{}).get('pricePosition'),
      'riskScore':a.get('trading',{}).get('riskScore'),
      'oppScore':a.get('trading',{}).get('opportunityScore'),
      'breakEven':a.get('trading',{}).get('breakEvenBuyPrice'),
      'taxAdjReturn':a.get('trading',{}).get('taxAdjustedReturn'),
      'troughDate':ov.get('troughDate'),'peakDate':ov.get('peakDate'),
      'trading':a.get('trading',{}),'daily':vals,
      'avg':ov.get('average'),'median':ov.get('median'),'min':ov.get('minimum'),'max':ov.get('maximum'),
    })
F['playerCount']=len(players)

chg=[p['changePct'] for p in players if p['changePct'] is not None]
F['distribution']={
  'n':len(chg),
  'up':sum(1 for c in chg if c>0),'down':sum(1 for c in chg if c<0),'flat':sum(1 for c in chg if c==0),
  'up10':sum(1 for c in chg if c>0.10),'down50':sum(1 for c in chg if c<-0.50),
  'down80':sum(1 for c in chg if c<-0.80),
  'up100':sum(1 for c in chg if c>1.0),'up300':sum(1 for c in chg if c>3.0),
  'median':r(med(chg)),'mean':r(avg(chg)),
  'p10':r(pct(chg,0.10)),'p25':r(pct(chg,0.25)),'p75':r(pct(chg,0.75)),'p90':r(pct(chg,0.90)),
  'min':r(min(chg)),'max':r(max(chg)),
}

# 信号分组
by_sig=defaultdict(list)
for p in players:
    if p['changePct'] is not None: by_sig[p['signal'] or '未分类'].append(p['changePct'])
F['bySignal']={k:{'n':len(v),'median':r(med(v)),'mean':r(avg(v))} for k,v in sorted(by_sig.items(),key=lambda kv:-len(kv[1]))}

# ---------- 3. 开盘价格分档 ----------
TIERS=[(0,10000,'<1万'),(10000,100000,'1-10万'),(100000,300000,'10-30万'),
       (300000,1000000,'30-100万'),(1000000,float('inf'),'≥100万')]
by_tier=[]
for lo,hi,label in TIERS:
    sel=[p for p in players if p['start'] is not None and lo<=p['start']<hi and p['changePct'] is not None]
    if not sel: continue
    c=[x['changePct'] for x in sel]
    by_tier.append({'label':label,'lo':lo,'hi':None if hi==float('inf') else hi,'n':len(sel),
                    'median':r(med(c)),'mean':r(avg(c)),
                    'up':sum(1 for x in c if x>0),'down':sum(1 for x in c if x<0),
                    'winRate':r(sum(1 for x in c if x>0)/len(c)),
                    'mdd':r(med([x['mdd'] for x in sel if x['mdd'] is not None])),
                    'vol':r(med([x['vol'] for x in sel if x['vol'] is not None]))})
F['byTier']=by_tier

# 相关系数：log(开盘价) vs 涨跌幅
def corr(xs,ys):
    n=len(xs)
    if n<3: return None
    mx,my=sum(xs)/n,sum(ys)/n
    num=sum((a-mx)*(b-my) for a,b in zip(xs,ys))
    dx=math.sqrt(sum((a-mx)**2 for a in xs)); dy=math.sqrt(sum((b-my)**2 for b in ys))
    return num/(dx*dy) if dx and dy else None
pairs=[(math.log10(p['start']),p['changePct']) for p in players if p['start'] and p['start']>0 and p['changePct'] is not None]
F['corr_logPrice_change']=r(corr([a for a,_ in pairs],[b for _,b in pairs]))

# ---------- 4. 时点分布 ----------
pk=Counter(p['peakDate'] for p in players if p['peakDate'])
tr=Counter(p['troughDate'] for p in players if p['troughDate'])
F['peakDates']=sorted(pk.items())
F['troughDates']=sorted(tr.items())
F['peakInWeek1']=r(sum(v for k,v in pk.items() if k<='2025-09-25')/sum(pk.values()))
F['troughInWeek34']=r(sum(v for k,v in tr.items() if k>='2025-10-09')/sum(tr.values()))

# 周内动能：第1周涨 vs 之后
w1=[p for p in players if p['daily']]
def ret_in(p,d0,d1):
    ds=sorted(p['daily'].keys())
    a=next((p['daily'][d] for d in ds if d>=d0),None)
    b=next((p['daily'][d] for d in reversed(ds) if d<=d1),None)
    return None if not a or not b or a<=0 else (b-a)/a
seg=[('w1','2025-09-18','2025-09-24'),('w2','2025-09-25','2025-10-01'),
     ('w3','2025-10-02','2025-10-08'),('w4','2025-10-09','2025-10-17')]
F['weeklyMedian']={k:r(med([ (lambda x: x)(ret_in(p,a,b)) for p in w1 if ret_in(p,a,b) is not None])) for k,a,b in seg}

# ---------- 5. FC26→FC27 锚点 ----------
db={x['slug']:x for x in DB26}
F['matrixN']=len(MATRIX)
def ratio(x): return None if not x.get('fc26_launch') or not x.get('eb_price') else x['eb_price']/x['fc26_launch']

anchor=[]
for x in MATRIX:
    rr=ratio(x)
    if rr is None: continue
    anchor.append({'slug':x['slug'],'name':x['name'],'ovr_diff':x['ovr_diff'],
                   'gold_diff':x.get('gold_diff'),'six_total_diff':x.get('six_total_diff'),
                   'ratio':rr,'fc26_launch':x['fc26_launch'],'eb_price':x['eb_price'],
                   'eb_launch':x.get('eb_launch'),'ovr27':x['ovr27'],'ovr26':x.get('ovr26'),
                   'pos27':x.get('pos27'),'gold27':x.get('gold27'),'has_fc26':x.get('has_fc26')})
F['anchorN']=len(anchor)
anchor_k=[a for a in anchor if a['ovr_diff'] is not None]   # 有 FC26 同档对照的样本
F['anchorPairN']=len(anchor_k)

by_ovr=[]
for d in sorted({a['ovr_diff'] for a in anchor_k}):
    sel=[a['ratio'] for a in anchor_k if a['ovr_diff']==d]
    if len(sel)<2: continue
    by_ovr.append({'ovr_diff':d,'n':len(sel),'median':r(med(sel)),'mean':r(avg(sel)),
                   'up1':r(sum(1 for x in sel if x>1)/len(sel))})
F['anchorByOvr']=by_ovr

by_ps=[]
for d in sorted({a['gold_diff'] for a in anchor_k if a['gold_diff'] is not None}):
    sel=[a['ratio'] for a in anchor_k if a['gold_diff']==d]
    if len(sel)<2: continue
    by_ps.append({'gold_diff':d,'n':len(sel),'median':r(med(sel))})
F['anchorByPlaystyle']=by_ps

# 交叉：ovr_diff 分组 × gold_diff 符号
cross_tab=[]
for lab,f in [('评分下调(≤-1)',lambda a:a['ovr_diff']<=-1),('评分持平(0)',lambda a:a['ovr_diff']==0),
              ('评分上调(+1)',lambda a:a['ovr_diff']==1),('评分上调(≥+2)',lambda a:a['ovr_diff']>=2)]:
    sel=[a for a in anchor_k if f(a)]
    if not sel: continue
    cross_tab.append({'label':lab,'n':len(sel),'median':r(med([a['ratio'] for a in sel])),
                      'nGoldUp':sum(1 for a in sel if (a['gold_diff'] or 0)>0),
                      'medianGoldUp':r(med([a['ratio'] for a in sel if (a['gold_diff'] or 0)>0])),
                      'medianGoldDown':r(med([a['ratio'] for a in sel if (a['gold_diff'] or 0)<0])),
                      'medianGoldFlat':r(med([a['ratio'] for a in sel if (a['gold_diff'] or 0)==0]))})
F['anchorCross']=cross_tab

# 六维属性
six=[]
for lab,f in [('六维合计 ≤-6',lambda a:a['six_total_diff']<=-6),('-5 ~ -1',lambda a:-5<=a['six_total_diff']<=-1),
              ('持平 0',lambda a:a['six_total_diff']==0),('+1 ~ +5',lambda a:1<=a['six_total_diff']<=5),
              ('≥ +6',lambda a:a['six_total_diff']>=6)]:
    sel=[a['ratio'] for a in anchor_k if a['six_total_diff'] is not None and f(a)]
    if len(sel)<2: continue
    six.append({'label':lab,'n':len(sel),'median':r(med(sel))})
F['anchorBySix']=six

# 锚点模型的可解释性：用 ovr_diff 解释 price ratio 的秩相关
F['corr_ovrdiff_ratio']=r(corr([a['ovr_diff'] for a in anchor_k],
                               [math.log10(max(a['ratio'],1e-4)) for a in anchor_k]))

# ---------- 6. 分层组合回测 ----------
def basket(sel,label):
    rets=[]
    for p in sel: rets.append((p['end']-p['start'])/p['start'])
    tax=DASH['tradingMethod']['taxRate']
    net=[(1+x)*(1-tax)-1 for x in rets]  # 卖出扣税
    return {'label':label,'n':len(sel),'gross':r(med(rets)),'netAfterTax':r(med(net)),
            'meanGross':r(avg(rets))}
F['baskets']=[
  basket([p for p in players if p['start'] and p['start']<10000],'低价耗材(开盘<1万)'),
  basket([p for p in players if p['start'] and 10000<=p['start']<100000],'中价(1-10万)'),
  basket([p for p in players if p['start'] and 100000<=p['start']<1000000],'高价(10-100万)'),
  basket([p for p in players if p['start'] and p['start']>=1000000],'顶级(≥100万)'),
  basket([p for p in players if p['changePct'] is not None],'全样本'),
]

# ---------- 7. 极端个股 ----------
srt=sorted([p for p in players if p['changePct'] is not None],key=lambda p:p['changePct'])
def slim(p): return {'name':p['nameZh'],'nameEn':p['name'],'start':p['start'],'end':p['end'],
                     'changePct':r(p['changePct']),'mdd':r(p['mdd']),'vol':r(p['vol']),
                     'signal':p['signal'],'peakDate':p['peakDate'],'troughDate':p['troughDate']}
F['worst5']=[slim(p) for p in srt[:8]]
F['best5']=[slim(p) for p in srt[-8:]][::-1]

# ---------- 8. 位置/群体 ----------
grp=defaultdict(list)
for p in players:
    if p['changePct'] is None: continue
    for g in (p['groups'] or ['other']): grp[g].append(p['changePct'])
F['byGroup']={k:{'n':len(v),'median':r(med(v))} for k,v in sorted(grp.items(),key=lambda kv:-len(kv[1]))}

# ---------- 9. FC27 清单 ----------
def slim2(x):
    d={'slug':x['slug'],'name':x['name'],'zh':db.get(x['slug'],{}).get('nameZh') or x['name'],
       'ovr27':x.get('ovr27'),'ovr26':x.get('ovr26'),'ovr_diff':x.get('ovr_diff'),
       'pos':x.get('pos27') or x.get('pos'),'ratio':r(x.get('ratio')),'eb_price':x.get('eb_price'),
       'eb_launch':x.get('eb_launch'),'fc26_launch':x.get('fc26_launch'),
       'gold_diff':x.get('gold_diff'),'six_total_diff':x.get('six_total_diff'),
       'reason':x.get('reason'),'verdict':x.get('verdict'),'rank':x.get('rank')}
    return d
F['recBuy']=[slim2(x) for x in REC['buy']]
F['recAvoid']=[slim2(x) for x in REC['avoid']]
F['recNew']=[slim2(x) for x in REC['new_cards'] if x.get('verdict')=='buy'][:14]
F['recWatchN']=len(REC['watch'])
F['recMeta']=REC['meta']

# ---------- 10. 时点与风险补充 ----------
F['medianPeakDate']=r(st.median([hash(d) for d in []]) ) if False else None
import datetime as _dt
def _d2n(x): return _dt.date.fromisoformat(x).toordinal()
pks=[_d2n(p['peakDate']) for p in players if p['peakDate']]
trs=[_d2n(p['troughDate']) for p in players if p['troughDate']]
F['medianPeakDate']=_dt.date.fromordinal(int(st.median(pks))).isoformat() if pks else None
F['medianTroughDate']=_dt.date.fromordinal(int(st.median(trs))).isoformat() if trs else None
F['medianPeakOffsetDays']=int(st.median(pks))-_d2n('2025-09-18') if pks else None
F['medianTroughOffsetDays']=int(st.median(trs))-_d2n('2025-09-18') if trs else None
F['peakDatesTop']=sorted(pk.items(),key=lambda kv:-kv[1])[:8]
F['troughDatesTop']=sorted(tr.items(),key=lambda kv:-kv[1])[:8]

# 分档风险
tier_risk=[]
for t in by_tier:
    lo,hi=t['lo'],t['hi']
    sel=[p for p in players if p['start'] is not None and lo<=p['start']<(hi if hi is not None else float('inf'))]
    tier_risk.append({'label':t['label'],'n':len(sel),
        'mdd':r(med([x['mdd'] for x in sel if x['mdd'] is not None])),
        'vol':r(med([x['vol'] for x in sel if x['vol'] is not None])),
        'riskScore':r(med([x['riskScore'] for x in sel if x['riskScore'] is not None])),
        'oppScore':r(med([x['oppScore'] for x in sel if x['oppScore'] is not None]))})
F['tierRisk']=tier_risk

# 全样本波动/回撤
F['riskAll']={'mddMed':r(med([p['mdd'] for p in players if p['mdd'] is not None])),
              'mddMean':r(avg([p['mdd'] for p in players if p['mdd'] is not None])),
              'volMed':r(med([p['vol'] for p in players if p['vol'] is not None])),
              'mddOver50':sum(1 for p in players if (p['mdd'] or 0)<-0.5),
              'mddOver80':sum(1 for p in players if (p['mdd'] or 0)<-0.8)}

# 低价档内部再分层（FC27 重点）
sub=[]
for lo,hi,lab in [(0,2000,'<2千'),(2000,5000,'2-5千'),(5000,10000,'5千-1万')]:
    sel=[p for p in players if p['start'] is not None and lo<=p['start']<hi and p['changePct'] is not None]
    if not sel: continue
    sub.append({'label':lab,'n':len(sel),'median':r(med([x['changePct'] for x in sel])),
                'winRate':r(sum(1 for x in sel if x['changePct']>0)/len(sel))})
F['lowTierSub']=sub

# 卖出时点敏感性：若在第N天买入/卖出
grid=[]
for bi in [0,3,6,10,14]:
    row={'buyDay':bi+1,'cells':[]}
    for si in [10,17,23,29]:
        if si<=bi: row['cells'].append(None); continue
        d0=sorted(DASH['window']['days'])[bi]; d1=sorted(DASH['window']['days'])[si]
        rets=[]
        for p in players:
            a=p['daily'].get(d0); b=p['daily'].get(d1)
            if a and b and a>0: rets.append(b/a-1)
        row['cells'].append(r(med(rets)))
    grid.append(row)
F['entryExitGrid']={'days':[d for d in sorted(DASH['window']['days'])],
                    'rows':grid,'colLabels':['第11天','第18天','第24天','第30天']}

# 修正回撤阈值统计（dashboard 中 maxDrawdown 为正的幅度值）
F['riskAll']['mddOver50']=sum(1 for p in players if (p['mdd'] or 0)>0.5)
F['riskAll']['mddOver80']=sum(1 for p in players if (p['mdd'] or 0)>0.8)
F['riskAll']['mddOver90']=sum(1 for p in players if (p['mdd'] or 0)>0.9)

# 低价档(<1万) 建仓/离场测算
low=[p for p in players if p['start'] is not None and p['start']<10000]
def grid_for(sel):
    out=[]
    for bi in [0,3,6,10,14]:
        row=[]
        for si in [6,10,13,20,29]:
            if si<=bi: row.append(None); continue
            d0=sorted(DASH['window']['days'])[bi]; d1=sorted(DASH['window']['days'])[si]
            rets=[p['daily'][d1]/p['daily'][d0]-1 for p in sel if p['daily'].get(d0) and p['daily'].get(d1)]
            net=[(1+x)*0.95-1 for x in rets]
            row.append(r(med(net)))
        out.append({'buyDay':bi+1,'netMedian':row})
    return out
F['lowTierGrid']={'buyDays':[1,4,7,11,15],'sellDays':[7,11,14,21,30],'rows':grid_for(low),'n':len(low)}
F['midTierGrid']={'buyDays':[1,4,7,11,15],'sellDays':[7,11,14,21,30],
                  'rows':grid_for([p for p in players if p['start'] is not None and 10000<=p['start']<100000]),
                  'n':len([p for p in players if p['start'] is not None and 10000<=p['start']<100000])}

# 首周峰值占比（按档）
F['peakWeek1ByTier']=[]
for t in by_tier:
    lo,hi=t['lo'],t['hi']
    sel=[p for p in players if p['start'] is not None and lo<=p['start']<(hi if hi is not None else float('inf')) and p['peakDate']]
    F['peakWeek1ByTier'].append({'label':t['label'],'n':len(sel),
        'share':r(sum(1 for x in sel if x['peakDate']<='2025-09-25')/len(sel)) if sel else None,
        'medianOffset':int(st.median([_d2n(x['peakDate'])-_d2n('2025-09-18') for x in sel])) if sel else None})

json.dump(F,open(_WD/'_findings.json','w'),ensure_ascii=False,indent=1)

# ---------- 打印摘要 ----------
print('== 大盘 =='); print(json.dumps(F['market'],ensure_ascii=False)[:400])
print('\n== 分布 =='); print(json.dumps(F['distribution'],ensure_ascii=False))
print('\n== 分档 =='); [print(' ',json.dumps(t,ensure_ascii=False)) for t in F['byTier']]
print('\n== 周度中位 ==',json.dumps(F['weeklyMedian'],ensure_ascii=False))
print('== 峰值周内占比 ==',F['peakInWeek1'],' 谷值后段占比 ==',F['troughInWeek34'])
print('\n== 信号 =='); [print(' ',k,v) for k,v in F['bySignal'].items()]
print('\n== 锚点 OVR =='); [print(' ',x) for x in F['anchorByOvr']]
print('\n== 锚点 金特技 =='); [print(' ',x) for x in F['anchorByPlaystyle']]
print('\n== 锚点交叉 =='); [print(' ',x) for x in F['anchorCross']]
print('\n== 锚点 六维 =='); [print(' ',x) for x in F['anchorBySix']]
print('\ncorr(logPrice,change)=',F['corr_logPrice_change'],' corr(ovrdiff,log ratio)=',F['corr_ovrdiff_ratio'])
print('\n== 组合 =='); [print(' ',x) for x in F['baskets']]
print('\n== 群体 ==',F['byGroup'])
print('\n== 最差 =='); [print(' ',x['name'],x['changePct']) for x in F['worst5']]
print('== 最好 =='); [print(' ',x['name'],x['changePct']) for x in F['best5']]
print('\n== 时点 ==','峰值中位',F['medianPeakDate'],F['medianPeakOffsetDays'],'谷值中位',F['medianTroughDate'],F['medianTroughOffsetDays'])
print('峰值Top',F['peakDatesTop']); print('谷值Top',F['troughDatesTop'])
print('\n== 分档风险 =='); [print(' ',x) for x in F['tierRisk']]
print('== 全样本风险 ==',F['riskAll'])
print('== 低价再分层 =='); [print(' ',x) for x in F['lowTierSub']]
print('== 买入/卖出网格 =='); [print(' 买第%d日'%(x['buyDay']),x['cells']) for x in F['entryExitGrid']['rows']]
print('\n== 全样本风险(修正) ==',F['riskAll'])
print('== 首周峰值占比(按档) =='); [print(' ',x) for x in F['peakWeek1ByTier']]
print('== 低价档净收益网格(行=买入日,列=卖出日%s) =='%F['lowTierGrid']['sellDays'])
[print('  买第%2d日'%x['buyDay'],x['netMedian']) for x in F['lowTierGrid']['rows']]
print('== 中价档净收益网格 ==')
[print('  买第%2d日'%x['buyDay'],x['netMedian']) for x in F['midTierGrid']['rows']]
print('\nbuy',len(F['recBuy']),'avoid',len(F['recAvoid']),'new',len(F['recNew']),'watch',F['recWatchN'])
