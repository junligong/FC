/**
 * 逐日报告资源副本清理 —— 消除 `reports/daily/<D>/assets/` 与 `daily-merged/assets/` 的重复存储。
 *
 * 背景：渲染器把球员头像 / 资讯配图落到**报告目录**的 `assets/` 下（`player-avatar.mjs#avatarSrc`
 *       只认 `assets/` 开头的路径），合并期再由 `merge_daily_report.mjs#ensureAssets` 把它们归并进
 *       站点共享目录 `daily-merged/assets/`。归并完成后，报告目录里那份就是纯粹的第二份拷贝：
 *       2026-09-20 实测 6 天累计 100.35 MB（news 82.2 MB + players 12.87 MB）。
 *
 * 判据（保守，只删「字节确实已经落地」的文件）：共享目录存在**同名且大小一致**的文件才删。
 * 资源命名本身是内容寻址的（`players/<resourceId>.png`、`news/<sha256 前 20 位>.jpg`，同名必同内容，
 * 已核对 4 天 0 例冲突），所以「同名 + 同大小」足以断定是同一份字节。
 *
 * 例外：`assets/data/` 一律保留 —— 逐日 `current.json` 是运行时资源（页面按 cardId 读取），
 *       且 `run-state` 快照校验与 `regression.test.mjs` 都依赖它存在于报告目录。
 *
 * 可恢复性：
 *   - `players/`：可重建。`materializeAvatars()` 会从 `shared/data/fc27/images/` 重新缩放落盘（幂等）。
 *   - `news/`：**不可离线重下**（来自 X 的图片）。字节只存在于 `daily-merged/assets/news/`。
 *     ⚠ 因此本清理的代价是：若 `daily-merged/assets/` 被清空，历史日报的资讯配图将无法再次生成。
 *       站点本身不受影响（页面引用的一直是共享目录）。
 *
 * 用法：`pruneReportAssets({ reportRoot, assetsDir })`。由 `merge_daily_report.mjs`（真实根或隔离根）
 *       与 `coordinate.mjs`（回写共享资源之后）调用。重复调用零成本（已删的自然不存在）。
 */
import { existsSync, readdirSync, rmSync, rmdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** 必须留在报告目录的子目录（运行时资源，不是可归并的静态图）。 */
const KEEP_SUBDIRS = new Set(['data']);

/**
 * 删除报告目录里已经进入共享资源目录的资源副本。
 * @param {{reportRoot: string, assetsDir: string, log?: (msg: string) => void, dryRun?: boolean}} opts
 * @returns {{pruned: number, bytes: number, days: number}}
 */
export function pruneReportAssets({ reportRoot, assetsDir, log = () => {}, dryRun = false } = {}) {
  const result = { pruned: 0, bytes: 0, days: 0 };
  if (!reportRoot || !assetsDir || !existsSync(reportRoot) || !existsSync(assetsDir)) return result;

  for (const day of readdirSync(reportRoot)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const dayAssets = path.join(reportRoot, day, 'assets');
    if (!existsSync(dayAssets)) continue;

    let dayPruned = 0;
    for (const sub of readdirSync(dayAssets, { withFileTypes: true })) {
      if (!sub.isDirectory() || KEEP_SUBDIRS.has(sub.name)) continue;
      const sharedSub = path.join(assetsDir, sub.name);
      if (!existsSync(sharedSub)) continue;

      const srcDir = path.join(dayAssets, sub.name);
      for (const name of readdirSync(srcDir)) {
        const src = path.join(srcDir, name);
        const dst = path.join(sharedSub, name);
        let size;
        try {
          size = statSync(src).size;
        } catch {
          continue;
        }
        let sameBytes = false;
        try {
          sameBytes = existsSync(dst) && statSync(dst).size === size;
        } catch {
          sameBytes = false;
        }
        if (!sameBytes) continue; // 共享目录还没有 / 大小不符 → 这是唯一副本，保留
        if (dryRun) {
          result.pruned++;
          result.bytes += size;
          dayPruned++;
          continue;
        }
        try {
          rmSync(src);
          result.pruned++;
          result.bytes += size;
          dayPruned++;
        } catch {
          /* 单个文件失败不阻断整体清理 */
        }
      }
      try {
        if (!dryRun && readdirSync(srcDir).length === 0) rmdirSync(srcDir);
      } catch {
        /* 目录非空或不可删，忽略 */
      }
    }
    if (dayPruned) result.days++;
  }

  if (result.pruned) {
    log(`逐日资源副本已清理: ${result.pruned} 个文件 / ${(result.bytes / 1048576).toFixed(2)} MB（${result.days} 天）；共享目录 daily-merged/assets 不受影响`);
  }
  return result;
}
