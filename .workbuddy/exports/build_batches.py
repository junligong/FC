#!/usr/bin/env python3
# 作用：把同步清单切分为若干批次文件，供 ima create_media 逐批调用（创建 media 时会返回该文件的 COS 上传凭证）。
# 输入：/tmp/fc-kb-manifest.json（由 build_sync_manifest.py 生成）。
# 主要输出：/tmp/fc-kb-batch-<n>.json（每批 8 条），标准输出打印批次摘要。
import json
import os
import sys

BATCH_SIZE = 8
# 内容一致但体积各约 47.7MB 的重复产物：仅保留归档版，避免知识库出现三份同内容大文件
SKIP_NAMES = {
    "FC日报-2026-09-15-当日汇总.html",
    "FC27每日情报台-固定首页.html",
}

with open("/tmp/fc-kb-manifest.json", "r", encoding="utf-8") as handle:
    manifest = json.load(handle)

selected = []
for item in manifest:
    if item["name"] in SKIP_NAMES:
        continue
    if not os.path.exists(item["local"]):
        print(f"missing local file: {item['local']}", file=sys.stderr)
        continue
    selected.append(item)

skipped = len(manifest) - len(selected)
batches = [selected[i : i + BATCH_SIZE] for i in range(0, len(selected), BATCH_SIZE)]

for number, batch in enumerate(batches, start=1):
    path = f"/tmp/fc-kb-batch-{number}.json"
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(batch, handle, ensure_ascii=False, indent=1)
    total = sum(item["size"] for item in batch)
    print(f"batch {number}: {len(batch)} entries, {total} bytes")

print(f"selected={len(selected)} skipped_duplicates={skipped} batches={len(batches)}")
for number, batch in enumerate(batches, start=1):
    print(f"--- batch {number} ---")
    for item in batch:
        print(f"  {item['name']} ({item['size']} B)")
