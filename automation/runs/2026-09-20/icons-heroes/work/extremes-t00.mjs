// 一次性脚本（临时）：icons-pricerange-hourly 2026-09-20 T00 轮区间极值并列张数 + 自洽性核对。
// 全部按 cardId 关联（禁 slug/name）。输入：hourly T00 快照（2026-09-20T00）+ research JSON。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/wuyanzu/Desktop/FC';
const D = '2026-09-20';
const HH = '00';
const j = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const P = (...a) => console.log(a.join(' '));

const h = j(`apps/market/engine/icons/data/prices/fc27/pricerange/hourly/${D}T${HH}.json`);
const res = j(`apps/market/engine/icons/data/research/fc26-vs-fc27-${D}.json`);
const nameOf = (id) => {
  const r = res.rows.find((x) => String(x.id) === String(id));
  return r ? `${r.nameZh || r.name}(${id})` : `?(${id})`;
};
const cards = h.cards || [];

// T00 为全量成功轮（131/131）：仅对采到区间的卡做极值统计（部分失败轮时未采到的卡 priceRange=null，如实排除，不填充）
const withR = cards.filter((c) => c.priceRange && typeof c.priceRange.min === 'number');
P(`[极值口径] 本轮有区间卡=${withR.length}/${cards.length} 无区间（未采到）=${cards.length - withR.length}`);

const minV = Math.min(...withR.map((c) => c.priceRange.min));
const maxV = Math.max(...withR.map((c) => c.priceRange.max));
const atMin = withR.filter((c) => c.priceRange.min === minV);
const atMax = withR.filter((c) => c.priceRange.max === maxV);
P(`[极值并列] 下沿最低 ${minV.toLocaleString('en-US')} 共 ${atMin.length} 张：${atMin.map((c) => nameOf(c.id)).join(' / ')}`);
P(`[极值并列] 上沿最高 ${maxV.toLocaleString('en-US')} 共 ${atMax.length} 张（首 8 张）：${atMax.slice(0, 8).map((c) => nameOf(c.id)).join(' / ')} ...`);

// 区间自洽：有效平台价必须落在 [min,max]（FUTBIN 封顶值 15,000,000 允许等于上沿）
let outOfRange = 0, effTotal = 0, effConsole = 0, effPc = 0, invalidTie = 0;
const validTieList = [];
for (const c of withR) {
  for (const k of ['console', 'pc']) {
    const v = c.current?.[k];
    const ok = c.currentValid?.[k] === true;
    if (!ok) continue;
    effTotal++; if (k === 'pc') effPc++; else effConsole++;
    if (v < c.priceRange.min || v > c.priceRange.max) {
      outOfRange++;
      validTieList.push(`${nameOf(c.id)} ${k}=${v} 区间${c.priceRange.min}-${c.priceRange.max}`);
    }
    if (v === maxV) invalidTie++;
  }
}
P(`[自洽] 有效平台价越界（<min 或 >max）= ${outOfRange} 张 ${validTieList.join(' | ') || ''}`);
P(`[自洽] 有平台价恰等于上沿 ${maxV.toLocaleString('en-US')} 的卡 ${invalidTie} 张（上沿为 FUTBIN 顶格值，非异常）`);
P(`[计数] 有效平台价 Console=${effConsole} PC=${effPc} 合计=${effTotal} 任一平台有效=${cards.filter((c) => c.currentValid?.console || c.currentValid?.pc).length}`);
P(`[区间] 区间宽度=0（min==max）的卡 ${withR.filter((c) => c.priceRange.min === c.priceRange.max).length} 张`);
