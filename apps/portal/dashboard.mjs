// 作用：生成 dashboard 风格的「单日日报」页面，index.html 与 archive/D.html 共用同一模板，保证格式完全一致。
// 布局：左侧固定导航栏（含紧凑海报） + 顶栏 + hero + 主内容区（报告卡/历史日报） + 右侧栏目（进化专栏 + 本期速览）。
// 配色：取自「彦祖工作室」海报并做提纯（近黑 #0b0708 / 深红 #c8102e / 金 #e9c84a / 冷灰文字 #a89aa0）。
// 输入：date 日期；panels 已 srcdoc 转义的板块 HTML（含可选 evolution-column）；archiveLinks 历史日报链接；assetBase 资源前缀（index 为 ''，archive 页为 '../'）。
// 输出：完整 HTML 字符串。
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.8 20v-5.4h4.4V20"/></svg>',
  football: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M12 7.6l3 2.2-1.15 3.5h-3.7L9 9.8z"/><path d="M12 3.4v4.2M4.3 9.8h4.7M19.7 9.8h-4.7M7.2 19.6l2.5-6.3M16.8 19.6l-2.5-6.3"/></svg>',
  news: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.2" y="4.6" width="17.6" height="14.8" rx="2.2"/><path d="M7 9.2h6.4M7 12.8h10M7 16.4h7"/></svg>',
  market: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.4 17.4l4.8-4.9 3.9 3 8-8.8"/><path d="M15 6.2h5.2v5.2"/></svg>',
  evolution: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18c3.2 0 4.4-2.4 6-5.6C11.4 9.2 13 6 16.4 6"/><path d="M13.6 6H20v6.4"/><circle cx="4.6" cy="18.2" r="1.6"/></svg>',
  archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M12 7.2v5.2l3.4 2"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7.2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V12"/><path d="M12 3.2v12.4M7.6 7.6 12 3.2l4.4 4.4"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13.4M13 6.2l5.8 5.8-5.8 5.8"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.6l1.9 5.7 5.7 1.9-5.7 1.9L12 17.8l-1.9-5.7L4.4 10.2l5.7-1.9z"/><path d="M18.8 15.4l.85 2.5 2.5.85-2.5.85-.85 2.5-.85-2.5-2.5-.85 2.5-.85z" opacity=".65"/></svg>',
};

// 板块定义：nav / 卡片 / 视图 共用。evolution 为右侧独立栏目的内容视图。
const TABS = [
  { id: 'football-daily', view: 'football', label: '足球动态', en: 'FOOTBALL', icon: 'football', desc: '七大联赛 + 欧冠 · 积分榜 / 射手榜 / 助攻榜三榜齐备' },
  { id: 'fc27-news', view: 'news', label: 'FC27 资讯', en: 'FC27 NEWS', icon: 'news', desc: 'X.com 信息源自动采集 · 智能过滤与中文翻译' },
  { id: 'market-analysis', view: 'market', label: 'FC27 市场', en: 'THE MARKET', icon: 'market', desc: '两个视图可切换：市场概览（活动卡/周黑/热门金卡/进化/传奇英雄）+ 市场扫描（价格分层 × 热门球员双维度）' },
];

const EVOLUTION_TAB = { id: 'evolution-column', view: 'evolution', label: '进化专栏', en: 'EVOLUTION', icon: 'evolution' };

// 首页卡片顺序：三个数据板块 + 进化专栏，与左侧导航一一对应
const CARD_ITEMS = [
  ...TABS,
  { ...EVOLUTION_TAB, desc: '热门进化卡与进化路线建议 · 来源 FUTBIN Popular Evolutions，由进化任务每日补充' },
];

const CSS = `:root{
color-scheme:dark;
--bg:#0b0708;--bg-soft:#120d0f;--surface:#161113;--surface-2:#1d1619;--surface-3:#231a1e;
--line:rgba(255,255,255,.07);--line-2:rgba(255,255,255,.14);
--text:#f4eff1;--muted:#a89aa0;--quiet:#786b73;
--red:#c8102e;--red-soft:rgba(200,16,46,.16);--red-line:rgba(200,16,46,.42);
--gold:#e9c84a;--gold-soft:rgba(233,200,74,.13);--gold-line:rgba(233,200,74,.38);
--radius:14px;--radius-sm:10px;
--sidebar:236px;
--font:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
}
*{box-sizing:border-box}
body{margin:0;background:
 radial-gradient(1100px 620px at 88% -10%,rgba(200,16,46,.10),transparent 62%),
 radial-gradient(900px 520px at 4% 0%,rgba(233,200,74,.05),transparent 58%),
 var(--bg);
 color:var(--text);font-family:var(--font);font-size:15px;line-height:1.6;-webkit-font-smoothing:antialiased}
button,input,select{font:inherit}button{cursor:pointer;color:inherit;background:none;border:0}a{color:inherit;text-decoration:none}img{max-width:100%}
h1,h2,h3,p{margin:0}svg{width:22px;height:22px;flex:none}
button:focus-visible,a:focus-visible{outline:2px solid var(--gold);outline-offset:3px;border-radius:6px}
.muted{color:var(--muted)}
.eyebrow{font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:var(--quiet);font-weight:600}

/* ============ 侧边栏 ============ */
.sidebar{position:fixed;inset:0 auto 0 0;width:var(--sidebar);display:flex;flex-direction:column;overflow-y:auto;
 background:linear-gradient(180deg,#120c0e,#0c0809);border-right:1px solid var(--line);z-index:20}
.brand{padding:26px 22px 20px;display:block}
.brand strong{display:block;font-size:23px;font-weight:800;letter-spacing:-.3px;line-height:1.25}
.brand strong b{color:var(--red);font-weight:900}
.brand span{display:block;color:var(--quiet);margin-top:6px;font-size:12.5px;letter-spacing:.16em;text-transform:uppercase}
.nav{display:grid;gap:3px;padding:4px 12px}
.nav button{display:flex;align-items:center;gap:14px;text-align:left;padding:12px 14px;border-radius:var(--radius-sm);
 font-size:15px;color:#c6b7bd;white-space:nowrap;width:100%;transition:background .16s,color .16s}
.nav button svg{width:20px;height:20px;opacity:.85}
.nav button:hover{background:rgba(255,255,255,.045);color:var(--text)}
.nav button.active{background:linear-gradient(90deg,var(--red-soft),rgba(200,16,46,.03));color:#fff;font-weight:650;
 box-shadow:inset 2.5px 0 0 var(--red)}
.nav button.active svg{color:var(--red);opacity:1}
.sidebar-foot{margin-top:auto;padding:16px 16px 18px 16px;border-top:1px solid var(--line);display:flex;flex-direction:column;align-items:center}
.manifesto{font-size:9.5px;letter-spacing:.34em;color:var(--quiet);line-height:2;font-weight:600;text-align:center;margin-bottom:14px}
.poster-mini{display:flex;flex-direction:column;align-items:center;gap:10px;width:100%;padding:11px 11px 12px;border:1px solid var(--line);
 border-radius:12px;background:rgba(0,0,0,.32);text-align:center;transition:border-color .16s,background .16s,transform .16s}
.poster-mini:hover{border-color:var(--gold-line);background:rgba(233,200,74,.06);transform:translateY(-1px)}
.poster-mini img{display:block;width:100%;max-width:176px;height:auto;border-radius:9px}
.poster-mini .pm-txt{display:block;width:100%}
.poster-mini b{display:block;font-size:13px;font-weight:700;color:var(--text);line-height:1.3}
.poster-mini small{display:block;font-size:11px;color:var(--quiet);margin-top:3px}

/* ============ 主区域 ============ */
.app{margin-left:var(--sidebar);padding:18px 30px 14px;max-width:1680px}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-bottom:16px;border-bottom:1px solid var(--line)}
.topbar .tb-left{display:flex;align-items:center;gap:12px;color:var(--muted);font-size:13px}
.live{display:inline-flex;align-items:center;gap:7px;padding:4px 11px;border-radius:999px;background:var(--red-soft);
 border:1px solid var(--red-line);color:#ffd7de;font-size:11.5px;letter-spacing:.04em}
.live i{width:6px;height:6px;border-radius:50%;background:var(--red);box-shadow:0 0 0 3px rgba(200,16,46,.22)}
.btn{display:inline-flex;gap:8px;align-items:center;justify-content:center;border:1px solid var(--line-2);border-radius:999px;
 padding:8px 16px;color:var(--text);font-size:13.5px;background:rgba(255,255,255,.03);transition:background .16s,border-color .16s}
.btn:hover{background:rgba(255,255,255,.08);border-color:var(--line-2)}
.btn svg{width:17px;height:17px}
.btn.gold{background:linear-gradient(135deg,var(--gold),#cba92c);border-color:transparent;color:#241a03;font-weight:750}
.btn.gold:hover{background:linear-gradient(135deg,#f3d766,#d8b83a)}
.btn.ghost{border-color:var(--line);background:transparent;color:var(--muted)}
.btn.ghost:hover{color:var(--text);border-color:var(--line-2)}
.btn.sm{padding:6px 12px;font-size:12.5px}

/* ============ Hero ============ */
.hero{display:grid;grid-template-columns:1.55fr .95fr;gap:40px;align-items:end;padding:30px 2px 26px}
.hero h1{font-size:clamp(30px,3.4vw,50px);line-height:1.14;font-weight:800;letter-spacing:-.6px;margin:14px 0 12px}
.hero h1 em{font-style:normal;background:linear-gradient(120deg,var(--gold),#c8102e 68%);-webkit-background-clip:text;background-clip:text;color:transparent}
.hero .subtitle{font-size:16.5px;color:var(--muted);max-width:52ch}
.hero-meta{display:flex;flex-wrap:wrap;gap:9px;margin-top:20px}
.chip{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted);padding:6px 12px;border-radius:999px;
 background:rgba(255,255,255,.035);border:1px solid var(--line)}
.chip b{color:var(--gold);font-weight:750}
.hero-note{position:relative;padding:20px 4px 4px 26px;border-left:1px solid var(--line-2);color:var(--muted);font-size:14.5px;line-height:1.9}
.hero-note:before{content:"";position:absolute;left:-1px;top:0;width:2px;height:46px;background:linear-gradient(var(--red),transparent)}

/* ============ 网格 ============ */
.home-grid{display:grid;grid-template-columns:minmax(0,1fr) 336px;gap:18px;align-items:start}
.col-stack{display:grid;gap:18px;align-content:start}
.panel{background:linear-gradient(180deg,var(--surface),var(--bg-soft));border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
.panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 20px;border-bottom:1px solid var(--line)}
.panel-head h2{font-size:17px;font-weight:750;letter-spacing:.01em}
h2{font-size:20px;font-weight:750;margin:0}
h3{font-size:15.5px;font-weight:700;margin:0}

/* 报告卡 */
.report-card{padding:19px 21px;display:flex;flex-direction:column;gap:15px;transition:border-color .18s,transform .18s,background .18s}
.report-card:hover{border-color:var(--line-2);background:linear-gradient(180deg,var(--surface-2),var(--bg-soft))}
.rc-top{display:flex;align-items:center;gap:14px}
.rc-icon{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:var(--red-soft);
 color:#ff8898;border:1px solid var(--red-line);flex:none}
.rc-title{font-size:18px;font-weight:760;letter-spacing:-.2px}
.rc-en{font-size:10.5px;letter-spacing:.22em;color:var(--quiet);text-transform:uppercase;margin-top:4px;font-weight:600}
.rc-desc{color:var(--muted);font-size:13.8px;line-height:1.72}
.rc-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:1px}
.badge{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;padding:4px 11px;border-radius:999px;white-space:nowrap;font-weight:600}
.badge.ok{background:rgba(233,200,74,.13);color:var(--gold);border:1px solid var(--gold-line)}
.badge.no{background:rgba(255,255,255,.04);color:var(--quiet);border:1px solid var(--line)}

/* 历史日报条 */
.history-strip{padding:20px;display:flex;align-items:center;gap:20px;flex-wrap:wrap}
.history-title{font-weight:750;font-size:17px}
.history-value{font-size:32px;line-height:1;font-weight:800;color:var(--gold);padding:0 18px;border-left:1px solid var(--line-2);border-right:1px solid var(--line-2)}
.history-copy{flex:1;min-width:180px;font-size:13px;color:#cdbfc4}
.history-copy small{display:block;margin-top:3px;color:var(--quiet);font-size:11.5px}

/* 右侧栏目 */
.rail-panel{position:relative}
.rail-panel:before{content:"";position:absolute;left:0;top:0;bottom:0;width:2px;background:linear-gradient(var(--gold),transparent 78%)}
.rail-panel .panel-head{padding-left:22px}
.rail-panel .panel-head h2{display:flex;align-items:center;gap:9px}
.rail-panel .panel-head h2 svg{width:18px;height:18px;color:var(--gold)}
.rail-empty{padding:26px 22px;text-align:center;color:var(--muted)}
.rail-empty .re-ic{width:52px;height:52px;margin:0 auto 14px;display:grid;place-items:center;border-radius:14px;
 background:var(--gold-soft);border:1px dashed var(--gold-line);color:var(--gold)}
.rail-empty .re-ic svg{width:26px;height:26px}
.rail-empty b{display:block;color:var(--text);font-size:15px;font-weight:700;margin-bottom:7px}
.rail-empty p{font-size:13px;line-height:1.75}
.rail-list{list-style:none;margin:0;padding:6px 20px 18px}
.rail-list li{display:flex;gap:10px;align-items:flex-start;font-size:13px;color:var(--muted);padding:9px 0;border-bottom:1px dashed var(--line)}
.rail-list li:last-child{border-bottom:0}
.rail-list li span.dot{width:6px;height:6px;border-radius:50%;background:var(--gold);margin-top:7px;flex:none}
.stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);border-top:1px solid var(--line)}
.stat-grid div{background:var(--bg-soft);padding:14px 16px}
.stat-grid b{display:block;font-size:22px;font-weight:800;color:var(--text);line-height:1.2}
.stat-grid small{display:block;color:var(--quiet);font-size:11.5px;margin-top:3px}

/* 视图 */
.view-header{margin:26px 2px 18px}
.view-header h1{font-size:30px;line-height:1.3;margin:10px 0 7px;font-weight:800;letter-spacing:-.4px}
.view-header p{color:var(--muted);font-size:14.5px;max-width:80ch}
/* 视图内的子标签（同一栏目下的多份内容切换，如 市场概览 / 市场扫描） */
.subtabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 2px 14px}
.subtab{padding:8px 18px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.03);
 color:var(--muted);font-size:13.5px;transition:color .16s,border-color .16s,background .16s}
.subtab:hover{color:var(--text);border-color:var(--line-2)}
.subtab.active{background:linear-gradient(135deg,var(--red),#9c0d24);border-color:transparent;color:#fff;font-weight:700}
.subpanel{display:none}
.subpanel.active{display:block}
.panel-iframe{width:100%;height:calc(100vh - 250px);min-height:640px;border:0;display:block;background:#0b0708;border-radius:var(--radius)}
.empty-panel{padding:38px 26px}

/* 历史日报列表 */
.report-list{display:grid;gap:10px;padding:16px 18px}
.report-item{display:flex;align-items:center;gap:18px;border:1px solid var(--line);background:rgba(255,255,255,.018);
 padding:15px 18px;border-radius:var(--radius-sm);transition:border-color .16s,background .16s,transform .16s}
.report-item:hover{border-color:var(--gold-line);background:rgba(233,200,74,.05);transform:translateX(3px)}
.report-item[aria-current=date]{border-color:var(--red-line);background:var(--red-soft)}
.date-badge{font-size:15px;font-weight:800;color:var(--gold);min-width:96px;font-variant-numeric:tabular-nums}
.report-info{flex:1;min-width:0}
.report-title{font-size:16px;font-weight:700}
.report-desc{font-size:12px;color:var(--quiet);margin-top:4px}
.report-item .arrow{color:var(--muted);display:grid;place-items:center}
.report-item:hover .arrow{color:var(--gold)}
.tag{display:inline-block;font-size:10.5px;padding:2px 8px;border-radius:6px;background:var(--red-soft);color:#ffc4cd;border:1px solid var(--red-line);font-weight:600}

.footer{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:20px 2px 6px;margin-top:8px;
 font-size:11.5px;color:var(--quiet);border-top:1px solid var(--line)}
.footer a{color:var(--muted);text-decoration:underline;text-underline-offset:3px}

/* 海报弹窗 */
dialog#poster-modal{border:0;padding:0;background:transparent;max-width:min(560px,92vw)}
dialog#poster-modal::backdrop{background:rgba(6,3,4,.88);backdrop-filter:blur(3px)}
dialog#poster-modal img{display:block;width:100%;height:auto;border-radius:12px;border:1px solid var(--line-2)}
dialog#poster-modal .pm-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;color:var(--muted);font-size:13px}
dialog#poster-modal .pm-bar button{color:var(--gold);font-size:13px;font-weight:600}

@media(max-width:1180px){.home-grid{grid-template-columns:1fr}.rail-panel:before{display:none}.hero{grid-template-columns:1fr;gap:22px}.hero-note{display:none}}
@media(max-width:900px){:root{--sidebar:200px}.app{padding:16px 20px}}
@media(max-width:760px){
 .sidebar{position:relative;width:auto;border-right:0;border-bottom:1px solid var(--line)}
 .brand{padding:18px 18px 10px}.nav{display:flex;overflow:auto;padding:0 12px}
 .nav button{white-space:nowrap;width:auto}
 .sidebar-foot{display:none}
 .app{margin:0;padding:14px 16px}
 .hero h1{font-size:28px}.topbar{flex-wrap:wrap;gap:10px}
 .panel-iframe{height:calc(100vh - 260px)}
 .stat-grid{grid-template-columns:1fr}
}`;

export function dailyReport({ date, panels = {}, archiveLinks = '', assetBase = '', evolutionLinks = '', subPanels = {} }) {
  const navItems = [
    { view: 'home', icon: 'home', label: '今日总览' },
    ...TABS.map(t => ({ view: t.view, icon: t.icon, label: t.label })),
    { view: EVOLUTION_TAB.view, icon: EVOLUTION_TAB.icon, label: EVOLUTION_TAB.label },
    { view: 'archive', icon: 'archive', label: '历史日报' },
  ];
  const nav = navItems.map(n =>
    `<button type="button" data-view="${n.view}" class="${n.view === 'home' ? 'active' : ''}">${ICONS[n.icon]}<span>${esc(n.label)}</span></button>`).join('');

  // 首页卡片覆盖全部内容栏目（含进化专栏），与左侧导航一一对应
  const cards = CARD_ITEMS.map(t => {
    const has = Boolean(panels[t.id]);
    return `<article class="panel report-card"><div class="rc-top"><span class="rc-icon">${ICONS[t.icon]}</span><div><div class="rc-title">${esc(t.label)}</div><div class="rc-en">${esc(t.en)}</div></div></div><p class="rc-desc">${esc(t.desc)}</p><div class="rc-foot"><span class="badge ${has ? 'ok' : 'no'}">${has ? '● 当日已收录' : '○ 当日暂无'}</span><button type="button" class="btn gold" data-view="${t.view}">阅读全文 ${ICONS.arrow}</button></div></article>`;
  }).join('');

  const views = TABS.map(t => {
    const subs = subPanels[t.view];
    let inner;
    if (Array.isArray(subs) && subs.length) {
      // 子标签：同一栏目下的多份内容切换（例：市场概览 / 市场扫描），默认展示第一项。
      const bar = `<div class="subtabs" role="tablist" aria-label="${esc(t.label)}子栏目">${subs
        .map((s, i) => `<button type="button" role="tab" class="subtab${i === 0 ? ' active' : ''}" data-subview="${t.view}" data-subid="${esc(s.id)}" aria-selected="${i === 0}">${esc(s.label)}</button>`)
        .join('')}</div>`;
      const bodies = subs
        .map((s, i) => `<div class="subpanel${i === 0 ? ' active' : ''}" id="sub-${t.view}-${esc(s.id)}"><iframe class="panel-iframe" srcdoc="${s.html}" title="${esc(t.label)} · ${esc(s.label)}" loading="lazy"></iframe></div>`)
        .join('');
      inner = bar + bodies;
    } else {
      const content = panels[t.id];
      inner = content
        ? `<iframe class="panel-iframe" srcdoc="${content}" title="${esc(t.label)}" loading="lazy"></iframe>`
        : `<div class="panel empty-panel"><h2>${esc(t.label)}</h2><p class="muted" style="margin-top:10px">该板块当日暂无有效报告。缺失内容不会被其他日期的数据替代。</p></div>`;
    }
    return `<section class="view" id="view-${t.view}" hidden><header class="view-header"><div class="eyebrow">${esc(t.en)}</div><h1>${esc(t.label)}</h1><p>${esc(t.desc)}</p></header>${inner}</section>`;
  }).join('');

  // 进化专栏：有内容则内嵌，否则给出占位空状态（后续进化任务补充）
  const evolutionContent = panels[EVOLUTION_TAB.id];
  const evolutionBody = evolutionContent
    ? `<iframe class="panel-iframe" srcdoc="${evolutionContent}" title="进化专栏" loading="lazy"></iframe>`
    : `<div class="rail-empty"><div class="re-ic">${ICONS.evolution}</div><b>进化专栏待补充</b><p>本栏目用于汇总 FC27 热门进化卡（来源 FUTBIN /27/popular/evolutions）与进化路线建议，由后续进化任务填充。</p></div>`;

  const evolutionView = `<section class="view" id="view-${EVOLUTION_TAB.view}" hidden><header class="view-header"><div class="eyebrow">${esc(EVOLUTION_TAB.en)}</div><h1>${esc(EVOLUTION_TAB.label)}</h1><p>热门进化卡与进化路线。内容由后续进化任务补充，未就绪时如实显示空状态。</p></header>${evolutionContent ? `<iframe class="panel-iframe" srcdoc="${evolutionContent}" title="进化专栏" loading="lazy"></iframe>` : `<div class="panel empty-panel"><div class="rail-empty"><div class="re-ic">${ICONS.evolution}</div><b>进化专栏待补充</b><p>本栏目用于汇总 FC27 热门进化卡（来源 FUTBIN /27/popular/evolutions）与进化路线建议，由后续进化任务填充。</p></div></div>`}</section>`;

  const poster = `${assetBase}assets/yanzu-banner.jpg`;
  const archiveCount = (archiveLinks.match(/class="report-item"/g) || []).length;
  // 分类计数：内容板块（足球/资讯/市场/进化）= 4；市场栏目内含 2 个视图
  const boardCount = CARD_ITEMS.length;
  const marketViews = (subPanels.market || []).length || 1;
  const evoLinksBlock = evolutionLinks
    ? `<ul class="rail-list">${evolutionLinks}</ul>`
    : `<ul class="rail-list"><li><span class="dot"></span><span>热门进化卡清单（FUTBIN Popular Evolutions）</span></li><li><span class="dot"></span><span>进化路线与前置条件核验</span></li><li><span class="dot"></span><span>费用 / 到期时间 / 位置评分要求</span></li></ul>`;

  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FC27情报台 · ${esc(date)}</title><style>${CSS}</style></head><body>
<aside class="sidebar">
<a class="brand" href="#home" data-view="home"><strong>FC27<b>情报台</b></strong><span>Football × FC27</span></a>
<nav class="nav" id="nav" aria-label="主导航">${nav}</nav>
<div class="sidebar-foot">
<div class="manifesto">MORE THAN A GAME.</div>
<button type="button" class="poster-mini" id="poster-open" aria-label="查看彦祖工作室套餐海报"><img src="${poster}" alt="彦祖工作室" loading="lazy"><span class="pm-txt"><b>彦祖工作室</b><small>FC27 DR 周赛套餐 · 点击看大图</small></span></button>
</div>
</aside>
<main class="app">
<div class="topbar">
 <div class="tb-left"><span class="live"><i></i>${esc(date)} · 北京时间</span><span>足球 × FC27 每日情报</span></div>
 <button type="button" class="btn ghost" id="share">${ICONS.share}分享链接</button>
</div>

<section class="view" id="view-home">
<header class="hero">
 <div><div class="eyebrow">Football Intelligence · Better Decisions</div><h1>先看<em>情报</em>，<br>再做决定。</h1><p class="subtitle">四个板块一站直达：足球动态（三榜齐备）、FC27 资讯、FC27 市场（概览 + 扫描）、进化专栏。</p><div class="hero-meta"><span class="chip">本期板块 <b>${boardCount}</b></span><span class="chip">历史日报 <b>${archiveCount}</b></span><span class="chip">数据日期 <b>${esc(date.slice(5))}</b></span></div></div>
 <div class="hero-note">比赛从不停止，<br>好决定总有依据。</div>
</header>
<div class="home-grid">
 <div class="col-stack">${cards}<article class="panel history-strip"><span class="history-title">历史日报</span><span class="history-value">${archiveCount}</span><span class="history-copy">份日报 · 按日期回看<small>历史日报独立归档，点击即可打开当日完整日报。</small></span><button type="button" class="btn" data-view="archive">浏览归档 ${ICONS.arrow}</button></article></div>
 <aside class="col-stack">
  <article class="panel rail-panel"><div class="panel-head"><h2>${ICONS.evolution}进化专栏</h2><span class="eyebrow">Evolution</span></div><div class="stat-grid"><div><b>${evolutionContent ? '已更新' : '待补充'}</b><small>本期状态</small></div><div><b>每日 03:00</b><small>更新频率</small></div></div>${evolutionBody}${evoLinksBlock}</article>
  <article class="panel"><div class="panel-head"><h2>本期速览</h2><span class="eyebrow">Snapshot</span></div><div class="stat-grid"><div><b>${boardCount}</b><small>内容板块</small></div><div><b>${marketViews}</b><small>市场视图</small></div><div><b>3</b><small>足球三榜</small></div><div><b>${archiveCount}</b><small>历史日报</small></div></div></article>
 </aside>
</div>
</section>

${views}
${evolutionView}

<section class="view" id="view-archive" hidden>
<header class="view-header"><div class="eyebrow">Archive</div><h1>历史日报</h1><p>按日期回看足球、FC27 资讯与市场报告。每份日报均为独立归档文件。</p></header>
<div class="panel"><div class="report-list" id="archive-list">${archiveLinks}</div></div>
</section>

<footer class="footer"><span>${esc(date)} 数据快照 · 足球与 FC27 独立情报页 · 内容仅供研究参考</span><a href="#archive" data-view="archive">历史日报</a></footer>
</main>
<dialog id="poster-modal"><div class="pm-bar"><span>彦祖工作室 · FC27 DR 周赛套餐</span><button type="button" id="poster-close" aria-label="关闭">关闭 ✕</button></div><img src="${poster}" alt="彦祖工作室 · FC27 DR 周赛套餐"></dialog>
<script>
(function(){
  var navBtns=document.querySelectorAll('[data-view]');
  function setView(v){
    var target=document.getElementById('view-'+v);
    if(!target)return;
    document.querySelectorAll('.view').forEach(function(s){s.hidden=s.id!=='view-'+v;});
    document.querySelectorAll('nav .nav button').forEach(function(b){var on=b.dataset.view===v;b.classList.toggle('active',on);b.setAttribute('aria-current',on?'page':'false');});
    window.scrollTo({top:0,behavior:'instant'});
    if(history.replaceState)history.replaceState(null,'','#'+v);
  }
  navBtns.forEach(function(b){b.addEventListener('click',function(e){if(b.tagName==='A')e.preventDefault();setView(b.dataset.view);});});
  // 栏目内子标签切换（如 市场概览 / 市场扫描）
  document.querySelectorAll('.subtab').forEach(function(b){b.addEventListener('click',function(){
    var v=b.dataset.subview,id=b.dataset.subid;
    document.querySelectorAll('.subtab').forEach(function(x){
      if(x.dataset.subview!==v)return;
      var on=(x===b);x.classList.toggle('active',on);x.setAttribute('aria-selected',on?'true':'false');
    });
    document.querySelectorAll('.subpanel').forEach(function(p){
      if(p.id.indexOf('sub-'+v+'-')!==0)return;
      p.classList.toggle('active',p.id==='sub-'+v+'-'+id);
    });
  });});
  var modal=document.getElementById('poster-modal');
  function openPoster(){if(modal&&modal.showModal&&!modal.open)modal.showModal();}
  var po=document.getElementById('poster-open');if(po)po.addEventListener('click',openPoster);
  var close=document.getElementById('poster-close');if(close)close.addEventListener('click',function(){modal.close();});
  if(modal)modal.addEventListener('click',function(e){if(e.target===modal)modal.close();});
  var share=document.getElementById('share');
  if(share)share.addEventListener('click',function(){if(!navigator.clipboard)return;var label=share.innerHTML;navigator.clipboard.writeText(location.href).then(function(){share.textContent='链接已复制';setTimeout(function(){share.innerHTML=label;},1600);}).catch(function(){});});
  var initial=(location.hash||'#home').slice(1);
  setView(document.getElementById('view-'+initial)?initial:'home');
  window.addEventListener('hashchange',function(){var v=(location.hash||'#home').slice(1);if(document.getElementById('view-'+v))setView(v);});
})();
</script></body></html>`;
}
