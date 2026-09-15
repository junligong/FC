// 作用：验证球员页面裁剪、分页识别和对比图生成逻辑。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { findHeroClip, findNextPage, makePairImage } from '../src/futbin-1v1.mjs';

function pngSize(buffer) {
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('finds the attribute hero and builds a side-by-side PNG', async () => {
  const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'futbin-1v1-test-'));
  const context = await chromium.launchPersistentContext(path.join(temporaryDir, 'profile'), {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1200, height: 720 },
  });

  try {
    const page = context.pages()[0] || await context.newPage();
    await page.setContent(`<!doctype html><style>
      html,body{margin:0;background:#1c2025;color:white;font:22px Arial}
      main{padding:20px 0 0;min-height:620px}
      .hero{height:520px;display:grid;grid-template-columns:360px 1fr;gap:24px}
      .card{margin:15px;width:320px;height:450px;background:#d7b34b;padding:20px;color:#111}
      .attrs{padding:30px;background:#23282e}.row{display:flex;gap:70px;margin-bottom:30px}
      .tabs{height:60px;padding:12px 20px;background:#111}
    </style><main>
      <section class="hero">
        <div class="card"><h2>Alexia Putellas</h2><p>PAC SHO PAS DRI DEF PHY</p></div>
        <div class="attrs"><div class="row"><span>SKILLS 5</span><span>WEAK FOOT 5</span></div>
          <div class="row"><span>HEIGHT 173cm</span><span>FOOT Left</span></div>
          <hr><p>This player has no Playstyles</p><hr><p>This player has no Roles</p></div>
      </section><div class="tabs">Player Stats</div>
    </main>`);

    const clip = await findHeroClip(page, { captureSelector: '', captureClip: null });
    assert.equal(clip.width, 1200);
    assert.ok(clip.height >= 420 && clip.height <= 720, `unexpected clip height ${clip.height}`);

    const fc27 = path.join(temporaryDir, 'fc27.png');
    const fc26 = path.join(temporaryDir, 'fc26.png');
    const pair = path.join(temporaryDir, 'pair.png');
    await page.screenshot({ path: fc27, clip });
    await page.screenshot({ path: fc26, clip });
    await makePairImage(context, fc27, fc26, pair, 'Alexia Putellas Segura', 500);

    const size = pngSize(await fs.readFile(pair));
    assert.equal(size.width, 1016);
    assert.ok(size.height > 300);

    const paginationPage = await context.newPage();
    await paginationPage.route('https://www.futbin.com/**', (route) => route.fulfill({
      contentType: 'text/html',
      body: '<nav class="pagination"><a href="?page=1">1</a><a href="?page=2">2</a><a href="?page=3">3</a></nav>',
    }));
    await paginationPage.goto('https://www.futbin.com/27/players?version=gold_rare');
    assert.match(await findNextPage(paginationPage), /[?&]page=2(?:&|$)/);
    await paginationPage.close();
  } finally {
    await context.close();
    await fs.rm(temporaryDir, { recursive: true, force: true });
  }
});
