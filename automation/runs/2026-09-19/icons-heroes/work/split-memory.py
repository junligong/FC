# 一次性维护脚本：把自动化记忆文件中 2026-09-17/09-18 的逐轮记录归档到独立文件，
# 使主文件回落到 Read 工具 256KB 上限之内（无损：归档=移动而非删除）。
import pathlib

D = pathlib.Path('/Users/wuyanzu/Desktop/FC/.workbuddy/memory/automations/7123b0fe-8129-4570-95ce-8e96834f265e')
src = D / 'memory.md'
lines = src.read_text(encoding='utf-8').split('\n')

# 1-based 行号：保留 [1..13] + [88..101]（字段位置备忘 / 已知待决），归档 [14..87] 与 [102..426]
keep_a = lines[0:13]
keep_field = lines[87:101]
keep_rest = lines[426:]
arch_a = lines[13:87]
arch_b = lines[101:426]

header = (
    '# 归档：2026-09-17 / 2026-09-18 逐轮执行记录（自 memory.md 无损移出）\n\n'
    '移出原因：主文件曾达 270,062 B / 718 行，超过 Read 工具的 256KB 上限，'
    '导致「先读记忆」这一步无法完成。此文件为原文逐行移出，内容未改写。\n'
    '当前生效的踩坑与判据已固化在技能 `fc-icons-hourly-verify` 与工作区 `MEMORY.md`，'
    '本文件仅作历史追溯。\n\n'
)
(D / 'memory-archive-2026-09-17_18.md').write_text(header + '\n'.join(arch_a + arch_b), encoding='utf-8')

note = (
    '> **历史轮次已归档**：2026-09-17 与 2026-09-18 的逐轮记录（共 399 行）已无损移出到\n'
    '> 同目录 `memory-archive-2026-09-17_18.md`（原文未改写）。原因：主文件曾超过 Read 工具 256KB 上限。\n'
    '> 需要追溯那两天的轮次时再打开该文件；日常只需本文件。'
)
src.write_text('\n'.join(keep_a + [note] + keep_field + keep_rest), encoding='utf-8')

print('main bytes =', src.stat().st_size, 'lines =', len(src.read_text(encoding='utf-8').split('\n')))
print('archive bytes =', (D / 'memory-archive-2026-09-17_18.md').stat().st_size)
