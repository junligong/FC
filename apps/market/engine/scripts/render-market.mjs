#!/usr/bin/env node
/**
 * FC27 市场报告统一渲染入口
 * 用途：读取一份 market.json，一次性渲染市场栏目的两份产物，保证结构与版式稳定：
 *       - reports/daily/D/market.html      「市场概览」：四段式（活动卡+周黑 / 价格分层Top50 / 传奇英雄 / 热门进化卡）
 *       - reports/daily/D/market-scan.html 「市场扫描」：双维度（价格维度 / 热门球员维度）
 * 输入：automation/runs/D/market/market.json（overview 段 + scan 段；可用 FC_MARKET_JSON 指定其他路径）。
 * 输出：上述两个 HTML 文件，均对缺失数据渲染为如实空状态。
 *
 * 用法：node apps/market/engine/scripts/render-market.mjs [YYYY-MM-DD]
 *   （也可单独运行 render-market-overview.mjs / render-market-report.mjs 只渲染其中之一）
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderOverview } from './render-market-overview.mjs';
import { renderScan, loadMarketData } from './render-market-report.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FC_PROJECT_ROOT || path.resolve(here, '../../../..');

const todayShanghai = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2] || '') ? process.argv[2] : todayShanghai();
const { data, jsonPath, error } = loadMarketData(dateStr);
if (error) console.error(`market.json 解析失败：${error}`);
if (!data) console.error(`未找到 ${jsonPath}，两份产物均将渲染为如实空状态。`);

const outDir = path.join(ROOT, 'reports', 'daily', dateStr);
mkdirSync(outDir, { recursive: true });

const overviewPath = path.join(outDir, 'market.html');
const scanPath = path.join(outDir, 'market-scan.html');
writeFileSync(overviewPath, renderOverview(dateStr, data), 'utf8');
writeFileSync(scanPath, renderScan(dateStr, data), 'utf8');
console.log(`市场概览已渲染: ${overviewPath}`);
console.log(`市场扫描已渲染: ${scanPath}`);
