// 作用：把FC27与FC26球员页面裁剪并拼接为本地一对一对比图。
import fs from 'fs/promises';
import { chromium } from 'playwright';

// 用法: node make-1v1-local.mjs <fc27File> <fc26File> <outputFile> <playerName> [panelWidth]
const [fc27File, fc26File, outputFile, playerName, panelWidthStr] = process.argv.slice(2);
const panelWidth = parseInt(panelWidthStr, 10) || 1016;
const gap = 16;

const escapeHtml = (s) =>
  String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const [left, right] = await Promise.all([
  fs.readFile(fc27File, 'base64'),
  fs.readFile(fc26File, 'base64'),
]);

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME });
const pairPage = await browser.newPage();
try {
  await pairPage.setViewportSize({ width: panelWidth * 2 + gap, height: 1200 });
  await pairPage.setContent(`<!doctype html>
    <html><head><meta charset="utf-8"><style>
      * { box-sizing: border-box; }
      html, body { margin: 0; background: #171a20; }
      #comparison { display: flex; gap: ${gap}px; width: max-content; background: #171a20; }
      .panel { width: ${panelWidth}px; background: #171a20; }
      .label { height: 64px; display: flex; align-items: center; gap: 28px; padding: 0 24px;
        background: #12151a; font-family: Arial, "PingFang SC", sans-serif; }
      .year { color: #35e6aa; font-size: 30px; font-weight: 700; white-space: nowrap; }
      .name { color: #f5f7fa; font-size: 25px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      img { display: block; width: ${panelWidth}px; height: auto; }
    </style></head><body>
      <div id="comparison">
        <section class="panel"><div class="label"><span class="year">FC 27</span><span class="name">${escapeHtml(playerName)}</span></div><img src="data:image/png;base64,${left}"></section>
        <section class="panel"><div class="label"><span class="year">FC 26</span><span class="name">${escapeHtml(playerName)}</span></div><img src="data:image/png;base64,${right}"></section>
      </div>
    </body></html>`, { waitUntil: 'load' });
  await pairPage.locator('#comparison').screenshot({ path: outputFile, animations: 'disabled' });
  console.log(`saved ${outputFile}`);
} finally {
  await pairPage.close();
  await browser.close();
}
