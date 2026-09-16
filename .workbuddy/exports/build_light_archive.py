#!/usr/bin/env python3
# 作用：把 09-15 归档日报（含 base64 内嵌图片，47.7MB，超过 ima HTML 单文件 10MB 上限）精简为可入库的版本。
# 输入：/Users/wuyanzu/Desktop/FC/daily-merged/archive/2026-09-15.html
# 主要输出：/Users/wuyanzu/Desktop/FC/.workbuddy/exports/sync/FC历史日报-2026-09-15-精简版.html（去除内嵌图片，保留全部文字与结构）
import os
import re

ROOT = "/Users/wuyanzu/Desktop/FC"
SOURCE = f"{ROOT}/daily-merged/archive/2026-09-15.html"
TARGET = f"{ROOT}/.workbuddy/exports/sync/FC历史日报-2026-09-15-精简版.html"

with open(SOURCE, "r", encoding="utf-8") as handle:
    html = handle.read()

original_size = len(html.encode("utf-8"))
placeholder = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
html, image_count = re.subn(r'data:image/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+', placeholder, html)

banner = (
    '<div style="margin:0 0 16px;padding:10px 14px;border-left:4px solid #f0b429;'
    'background:#2a2a1e;color:#f5e9c8;font:13px/1.7 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">'
    "本条为 2026-09-15 归档日报的<strong>精简版</strong>：原始文件含 "
    f"{image_count} 处 base64 内嵌图片，体积 47.7MB，超过 ima 单个 HTML 文件 10MB 上限，"
    "故此处移除内嵌图片、完整保留当日全部文字与板块结构。含图原件见 "
    "<code>daily-merged/archive/2026-09-15.html</code> 与线上 "
    "https://fc27-site.app.workbuddy.host/archive/2026-09-15.html 。</div>"
)

marker = "<body"
index = html.find(marker)
if index != -1:
    close = html.find(">", index)
    html = html[: close + 1] + banner + html[close + 1 :]
else:
    html = banner + html

with open(TARGET, "w", encoding="utf-8") as handle:
    handle.write(html)

new_size = len(html.encode("utf-8"))
print(f"source={original_size} reached={new_size} images_removed={image_count}")
print(f"target={TARGET}")
