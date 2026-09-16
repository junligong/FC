#!/usr/bin/env python3
# 作用：枚举本次要同步到 ima 知识库的全部本地文件，并给出入库时使用的可读文件名与 MIME 类型。
# 输入：无参数，范围固定为 3 份 Markdown 合集 + 每日/历史日报 HTML + 研究分析 HTML + 研究 CSV。
# 主要输出：/tmp/fc-kb-manifest.json（条目列表），并在标准输出打印摘要。
import json
import os

ROOT = "/Users/wuyanzu/Desktop/FC"
SYNC = os.path.join(ROOT, ".workbuddy/exports/sync")

REPORT_LABEL = {
    "football.html": "足球日报",
    "news.html": "FC27资讯",
    "market.html": "市场概览",
    "market-scan.html": "市场扫描",
    "evolution.html": "进化专栏",
    "summary.html": "当日汇总",
}

MIME = {
    "md": "text/markdown",
    "html": "text/html",
    "csv": "text/csv",
}

entries = []


def add(relative, upload_name):
    absolute = os.path.join(ROOT, relative)
    ext = upload_name.rsplit(".", 1)[-1].lower()
    entries.append(
        {
            "local": absolute,
            "name": upload_name,
            "ext": ext,
            "content_type": MIME[ext],
            "size": os.path.getsize(absolute),
        }
    )


for name in sorted(os.listdir(SYNC)):
    if name.endswith(".md"):
        add(os.path.join(".workbuddy/exports/sync", name), name)

for date_dir in sorted(os.listdir(os.path.join(ROOT, "reports/daily"))):
    day = os.path.join(ROOT, "reports/daily", date_dir)
    if not os.path.isdir(day):
        continue
    for name in sorted(os.listdir(day)):
        if name in REPORT_LABEL:
            add(
                f"reports/daily/{date_dir}/{name}",
                f"FC日报-{date_dir}-{REPORT_LABEL[name]}.html",
            )

for name in sorted(os.listdir(os.path.join(ROOT, "daily-merged/archive"))):
    if name.endswith(".html"):
        add(f"daily-merged/archive/{name}", f"FC历史日报-{name}")

add("daily-merged/index.html", "FC27每日情报台-固定首页.html")
add(
    "reports/analysis/fc27-investment-analysis-2026-09-15.html",
    "FC27投资分析报告-2026-09-15.html",
)

for dirpath, dirnames, filenames in os.walk(os.path.join(ROOT, "apps/market/engine")):
    if "node_modules" in dirpath:
        continue
    for name in sorted(filenames):
        if name.endswith(".csv"):
            relative = os.path.relpath(os.path.join(dirpath, name), ROOT)
            add(relative, name)

with open("/tmp/fc-kb-manifest.json", "w", encoding="utf-8") as handle:
    json.dump(entries, handle, ensure_ascii=False, indent=1)

total = sum(item["size"] for item in entries)
print(f"entries={len(entries)} total_bytes={total}")
for index, item in enumerate(entries, start=1):
    print(f"{index:02d} {item['ext']:4s} {item['size']:>7d}  {item['name']}")
