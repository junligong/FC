#!/usr/bin/env python3
# 作用：基于同步清单，剔除已完成条目与空壳归档页，把剩余文件切成多个分片文件，供并行子任务逐片上传入库。
# 输入：/tmp/fc-kb-manifest.json。
# 主要输出：/tmp/fc-kb-chunk-<n>.json，以及标准输出的分片摘要。
import json
import os

DONE = {
    "FC27投资分析文章.md",
    "FC模块与引擎说明合集.md",
    "FC项目约定与任务契约合集.md",
    "FC日报-2026-09-11-足球日报.html",
    "FC日报-2026-09-11-FC27资讯.html",
    "FC日报-2026-09-11-当日汇总.html",
    "FC日报-2026-09-12-足球日报.html",
    "FC日报-2026-09-12-FC27资讯.html",
}

# 内容一致但体积各约 47.7MB 的重复产物，仅保留归档版
SKIP_NAMES = {
    "FC日报-2026-09-15-当日汇总.html",
    "FC27每日情报台-固定首页.html",
    # 933 字节的空壳归档页（无任何卡片内容），不单独入库
    "FC历史日报-2026-09-03.html",
    "FC历史日报-2026-09-04.html",
    "FC历史日报-2026-09-06.html",
    "FC历史日报-2026-09-07.html",
    "FC历史日报-2026-09-09.html",
    "FC历史日报-2026-09-10.html",
}

CHUNKS = 5

with open("/tmp/fc-kb-manifest.json", "r", encoding="utf-8") as handle:
    manifest = json.load(handle)

remaining = [
    item
    for item in manifest
    if item["name"] not in DONE and item["name"] not in SKIP_NAMES and os.path.exists(item["local"])
]

size = -(-len(remaining) // CHUNKS)
for number in range(CHUNKS):
    chunk = remaining[number * size : (number + 1) * size]
    if not chunk:
        continue
    path = f"/tmp/fc-kb-chunk-{number + 1}.json"
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(chunk, handle, ensure_ascii=False, indent=1)
    print(f"chunk {number + 1}: {len(chunk)} entries, {sum(i['size'] for i in chunk)} bytes")
    for item in chunk:
        print(f"   {item['name']} ({item['size']}B) {item['content_type']}")
print(f"remaining={len(remaining)}")
