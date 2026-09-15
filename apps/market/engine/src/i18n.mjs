/**
 * 作用：提供市场报告统一的中文、英文和双语文案切换。
 *
 * Supports three modes:
 *   'zh'        — Chinese only
 *   'en'        — English only
 *   'bilingual' — Chinese + English (e.g. "第一周 / Week 1")
 *
 * Usage:
 *   import { createI18n, TRANSLATIONS } from './i18n.mjs';
 *   const i18n = createI18n('en');
 *   i18n.t('week1')          // → "Week 1"
 *   i18n.t('week1', 'zh')    // → "第一周"
 *   i18n.t('week1', 'bilingual') // → "第一周 / Week 1"
 */

import { readFileSync } from 'node:fs';

// ═══════════════════════════════════════════════════════════
//  Translation Dictionary
// ═══════════════════════════════════════════════════════════

export const TRANSLATIONS = {

  // ── Week / Period Labels ──
  week1:        { zh: '第一周',    en: 'Week 1' },
  week2:        { zh: '第二周',    en: 'Week 2' },
  week3:        { zh: '第三周',    en: 'Week 3' },
  week4:        { zh: '第四周',    en: 'Week 4' },
  tail:         { zh: '月末两日',  en: 'Month-end (last 2 days)' },

  // ── Trend Labels (three-week analysis) ──
  trend_up3:    { zh: '三周连涨',  en: '3-Week Uptrend' },
  trend_down3:  { zh: '三周连跌',  en: '3-Week Downtrend' },
  trend_rebound:{ zh: '第三周反弹', en: 'Week 3 Rebound' },
  trend_turnDown:{ zh: '第三周转跌', en: 'Week 3 Reversal Down' },
  trend_oscUp:  { zh: '震荡上行',  en: 'Oscillating Up' },
  trend_oscDown:{ zh: '震荡下行',  en: 'Oscillating Down' },
  trend_flat:   { zh: '横盘',     en: 'Sideways' },
  trend_insufficient: { zh: '数据不足', en: 'Insufficient Data' },

  // ── Signal Labels (monthly analysis) ──
  signal_strongUp:   { zh: '强势上行', en: 'Strong Uptrend' },
  signal_rebound:    { zh: '反弹观察', en: 'Rebound Watch' },
  signal_decline:    { zh: '持续下行', en: 'Persistent Decline' },
  signal_lowStable:  { zh: '低位企稳', en: 'Low Consolidation' },
  signal_highVol:    { zh: '高波动',   en: 'High Volatility' },
  signal_range:      { zh: '区间震荡', en: 'Range-bound' },
  signal_insufficient: { zh: '数据不足', en: 'Insufficient Data' },

  // ── Platforms ──
  platform_cross: { zh: 'Cross（PlayStation/Xbox 跨平台）', en: 'Cross (PlayStation/Xbox)' },
  platform_pc:    { zh: 'PC', en: 'PC' },

  // ── Price Tiers ──
  tier_big:        { zh: '大卡',    en: 'Big Card' },
  tier_mid:        { zh: '中卡',    en: 'Mid Card' },
  tier_practical:  { zh: '实用卡',  en: 'Practical Card' },
  tier_hot:        { zh: '热门卡',  en: 'Hot Card' },
  tier_big_desc:        { zh: '100W+',      en: '1M+' },
  tier_mid_desc:        { zh: '30W~100W',   en: '300K~1M' },
  tier_practical_desc:  { zh: '5W~30W',     en: '50K~300K' },
  tier_hot_desc:        { zh: '1W~5W',      en: '10K~50K' },

  // ── Card Types ──
  card_gold:  { zh: '金卡',   en: 'Gold' },
  card_icon:  { zh: '传奇卡', en: 'Icon' },
  card_hero:  { zh: '英雄卡', en: 'Hero' },
  card_totw1: { zh: '周黑1',  en: 'TOTW1' },

  // ── Positions ──
  pos_forward:  { zh: '前锋', en: 'Forward' },
  pos_midfield: { zh: '中场', en: 'Midfield' },
  pos_defender: { zh: '后卫', en: 'Defender' },

  // ── CLI Messages ──
  cli_missingArg:    { zh: '缺少参数',           en: 'missing argument' },
  cli_invalidGroup:  { zh: '--group 只支持 forward、midfield 或 defender', en: '--group only supports forward, midfield, or defender' },
  cli_unknownArg:    { zh: '未知参数',           en: 'unknown argument' },
  cli_dataFormatError: { zh: '球员数据格式错误', en: 'invalid player data format' },
  cli_needPlayersArray: { zh: '需要包含 players 数组的球员数据文档', en: 'expected a player data document with a players array' },
  cli_priceFormatError: { zh: 'FC26 开服首周价格数据格式错误', en: 'invalid FC26 launch week price data format' },

  // ── Report Titles ──
  report_priceAnalysis: { zh: 'FC26 开服首月价格分析报告', en: 'FC26 Launch Month Price Analysis Report' },
  report_iconHero: { zh: 'FC26 Icon & Hero 价格深度分析', en: 'FC26 Icon & Hero Deep Price Analysis' },
  report_evolution: { zh: 'FC26 开服首月进化报告', en: 'FC26 First Month Evolution Report' },
  report_stockpile: { zh: 'FC27 屯卡推荐报告', en: 'FC27 Stockpile Recommendation Report' },

  // ── Report Sections ──
  section_keyFindings: { zh: '关键发现', en: 'Key Findings' },
  section_tierClass:   { zh: '四档分类', en: 'Tier Classification' },
  section_topGainers:  { zh: '涨幅榜 TOP 20', en: 'Top 20 Gainers' },
  section_topLosers:   { zh: '跌幅榜 TOP 20', en: 'Top 20 Losers' },
  section_topVolatility: { zh: '波动最大 TOP 20', en: 'Top 20 Volatility' },
  section_strategy:    { zh: '投资策略总结', en: 'Investment Strategy Summary' },
  section_buyStrategy: { zh: '买卡策略', en: 'Buy Strategy' },
  section_sellStrategy:{ zh: '卖卡策略', en: 'Sell Strategy' },
  section_insights:    { zh: '深度洞察', en: 'Deep Insights' },
  section_actionPlan:  { zh: 'FC27 开服操作计划', en: 'FC27 Launch Action Plan' },
  section_priceTrend:  { zh: '价格走势对比', en: 'Price Trend Comparison' },
  section_dodAnalysis: { zh: '日均涨跌幅分析', en: 'Day-over-Day Change Analysis' },
  section_buySellDist: { zh: '买卖时机分布', en: 'Buy/Sell Timing Distribution' },
  section_tierAnalysis:{ zh: '按评级分层分析', en: 'Tier Analysis by Rating' },
  section_weekly:      { zh: '周内价格规律', en: 'Weekly Price Pattern' },
  section_topProfit:   { zh: 'TOP 20 利润最大化机会', en: 'Top 20 Profit Opportunities' },
  section_bottomProfit:{ zh: 'BOTTOM 20 最差交易标的', en: 'Bottom 20 Worst Trades' },
  section_topCurves:   { zh: 'TOP 10 机会个股价格走势', en: 'Top 10 Opportunity Price Curves' },

  // ── Strategy Names ──
  strategy_sellDay1:  { zh: '开服即卖', en: 'Sell on Day 1' },
  strategy_quickSwing:{ zh: '快速波段', en: 'Quick Swing' },
  strategy_deepBuy:   { zh: '深度抄底', en: 'Deep Buy' },

  // ── Table Headers ──
  th_player:    { zh: '球员',   en: 'Player' },
  th_cardType:  { zh: '卡种',   en: 'Type' },
  th_ovr:       { zh: 'OVR',    en: 'OVR' },
  th_launch:    { zh: '开服价', en: 'Launch Price' },
  th_current:   { zh: '当前价', en: 'Current Price' },
  th_change:    { zh: '涨跌',   en: 'Change' },
  th_min:       { zh: '最低',   en: 'Min' },
  th_max:       { zh: '最高',   en: 'Max' },
  th_amplitude: { zh: '振幅',   en: 'Amplitude' },
  th_buyPrice:  { zh: '买入价', en: 'Buy Price' },
  th_buyDay:    { zh: '买入日', en: 'Buy Day' },
  th_sellPrice: { zh: '卖出价', en: 'Sell Price' },
  th_sellDay:   { zh: '卖出日', en: 'Sell Day' },
  th_holdDays:  { zh: '持有天数', en: 'Hold Days' },
  th_profit:    { zh: '收益率', en: 'Return' },

  // ── Dashboard UI ──
  dash_title:        { zh: 'FC26 开服首月球员交易分析', en: 'FC26 Launch Month Player Trading Analysis' },
  dash_subtitle:     { zh: '152 名 FC26 金卡球员开服后 30 天的每日价格追踪与交易信号', en: 'Daily price tracking and trading signals for 152 FC26 gold players over 30 days' },
  dash_market:       { zh: '市场', en: 'Market' },
  dash_players:      { zh: '球员', en: 'Players' },
  dash_detail:       { zh: '明细', en: 'Detail' },
  dash_opportunities:{ zh: '球员机会清单', en: 'Player Opportunity List' },
  dash_search:       { zh: '搜索球员', en: 'Search player' },
  dash_allSignals:   { zh: '全部信号', en: 'All Signals' },
  dash_opportunityScore: { zh: '机会分', en: 'Opportunity' },
  dash_riskScore:    { zh: '风险分', en: 'Risk' },
  dash_monthChange:  { zh: '首月涨跌', en: 'Month Change' },
  dash_last7d:       { zh: '近7日', en: 'Last 7d' },
  dash_maxDrawdown:  { zh: '最大回撤', en: 'Max Drawdown' },
  dash_support:      { zh: '7日支撑/阻力', en: '7d Support/Resistance' },
  dash_breakEven:    { zh: '税后保本买价', en: 'Break-even Buy (after tax)' },
  dash_validDays:    { zh: '有效日数', en: 'Valid Days' },
  dash_viewDaily:    { zh: '查看 30 天每日价格', en: 'View 30-day daily prices' },
  dash_loading:      { zh: '正在载入价格明细', en: 'Loading price details' },
  dash_forward:      { zh: '前锋', en: 'Forwards' },
  dash_midfield:     { zh: '中场', en: 'Midfielders' },
  dash_defender:     { zh: '后卫', en: 'Defenders' },

  // ── Misc ──
  data_source:   { zh: '数据来源', en: 'Data source' },
  analysis_time: { zh: '分析时间', en: 'Analysis time' },
  for_reference: { zh: '仅供参考，市场有风险，投资需谨慎', en: 'For reference only. Market involves risk.' },
  normalized_index: { zh: '归一化指数', en: 'Normalized Index' },
  launch_day_eq_100: { zh: '开服日=100', en: 'Launch Day = 100' },
};

// ═══════════════════════════════════════════════════════════
//  i18n Factory
// ═══════════════════════════════════════════════════════════

/**
 * Create an i18n instance with the specified default language.
 * @param {'zh'|'en'|'bilingual'} defaultLang
 */
export function createI18n(defaultLang = 'zh') {
  /**
   * Translate a key.
   * @param {string} key - Translation key from TRANSLATIONS
   * @param {'zh'|'en'|'bilingual'} [lang] - Override language; defaults to instance lang
   * @returns {string}
   */
  function t(key, lang) {
    const mode = lang || defaultLang;
    const entry = TRANSLATIONS[key];
    if (!entry) return key;
    if (mode === 'zh') return entry.zh;
    if (mode === 'en') return entry.en;
    // bilingual: "中文 / English"
    return `${entry.zh} / ${entry.en}`;
  }

  /**
   * Get all labels for a list of keys, in the specified language.
   * Useful for batch-rendering tables and charts.
   */
  function labels(keys, lang) {
    return keys.map((k) => t(k, lang));
  }

  return { t, labels, lang: defaultLang };
}

/**
 * Quick translate without creating an instance.
 */
export function t(key, lang = 'zh') {
  const entry = TRANSLATIONS[key];
  if (!entry) return key;
  if (lang === 'zh') return entry.zh;
  if (lang === 'en') return entry.en;
  return `${entry.zh} / ${entry.en}`;
}

/**
 * Read language from config.json, with fallback to 'zh'.
 */
export function readLanguageFromConfig(configPath = 'config.json') {
  try {
    const raw = readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);
    return config.language || 'zh';
  } catch {
    return 'zh';
  }
}
