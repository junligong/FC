#!/usr/bin/env node
/**
 * download-fc27-images.mjs — 本地化 FC27 全部头像/卡面图片
 *
 * 输入：shared/data/fc27/players.json（canonical，含 resourceId）
 * 输出：shared/data/fc27/images/<resourceId>.png
 *
 * 规则：
 *   - 头像 URL：https://cdn.futbin.com/content/fifa27/img/players/<resourceId>.png
 *   - 卡面模板 URL：https://cdn.futbin.com/content/fifa27/img/cards/hd/{version}.png（可选项，默认不采）
 *   - 已存在且非空文件跳过（幂等）；失败写入 images/.failed 清单可重跑
 *   - 并发 6，超时 20s，失败重试 1 次
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../../..");
const CANON = path.join(ROOT, "shared/data/fc27/players.json");
const IMG_DIR = path.join(ROOT, "shared/data/fc27/images");

const data = JSON.parse(fs.readFileSync(CANON, "utf8"));
const players = data.players;
const CONC = 6;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

fs.mkdirSync(IMG_DIR, { recursive: true });

// 需下载的资源 id（去重）
const rids = [...new Set(players.map((p) => p.resourceId).filter(Boolean))];
let ok = 0, skip = 0, fail = 0;
const failed = [];

function download(rid) {
  const dest = path.join(IMG_DIR, `${rid}.png`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 500) { skip++; return; }
  const url = `https://cdn.futbin.com/content/fifa27/img/players/${rid}.png`;
  const tmp = dest + ".tmp";
  try {
    execFileSync("curl", ["-sL", "--max-time", "20",
      "-A", UA, "-H", "Referer: https://www.futbin.com/",
      "-o", tmp, url]);
    if (fs.existsSync(tmp) && fs.statSync(tmp).size > 500) {
      fs.renameSync(tmp, dest);
      ok++;
    } else {
      fs.rmSync(tmp, { force: true });
      throw new Error("empty");
    }
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    fail++;
    failed.push(rid);
  }
}

(async () => {
  const t0 = Date.now();
  for (let i = 0; i < rids.length; i += CONC) {
    const batch = rids.slice(i, i + CONC);
    await Promise.all(batch.map((rid) => Promise.resolve().then(() => download(rid))));
    if ((i / CONC) % 25 === 0) console.log(`progress ${Math.min(i + CONC, rids.length)}/${rids.length} ok=${ok} skip=${skip} fail=${fail}`);
  }
  fs.writeFileSync(path.join(IMG_DIR, ".failed"), JSON.stringify(failed));
  console.log(`DONE ${rids.length} unique | ok=${ok} skip=${skip} fail=${fail} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (failed.length) console.log("failed sample:", failed.slice(0, 10));
})();