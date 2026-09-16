#!/usr/bin/env python3
# 作用：把项目内零散的 Markdown 约定文档按主题合并为少数几份"合集"，便于写入 ima 知识库后检索。
# 输入：无参数，按固定分组读取 /Users/wuyanzu/Desktop/FC 下的 AGENTS.md / README.md / prompts。
# 主要输出：/Users/wuyanzu/Desktop/FC/.workbuddy/exports/sync/ 下 3 份 Markdown 合集。
import os
from datetime import datetime

ROOT = "/Users/wuyanzu/Desktop/FC"
OUT = os.path.join(ROOT, ".workbuddy/exports/sync")

GROUPS = {
    "FC项目约定与任务契约合集.md": [
        "AGENTS.md",
        "apps/AGENTS.md",
        "apps/football/AGENTS.md",
        "apps/news/AGENTS.md",
        "apps/market/AGENTS.md",
        "apps/portal/AGENTS.md",
        "automation/AGENTS.md",
        "shared/AGENTS.md",
        "reports/AGENTS.md",
        "daily-merged/AGENTS.md",
        "automation/prompts/README.md",
        "automation/prompts/daily.md",
        "automation/prompts/football.md",
        "automation/prompts/news.md",
        "automation/prompts/market.md",
        "automation/prompts/evolution.md",
        "automation/prompts/publish.md",
    ],
    "FC模块与引擎说明合集.md": [
        "README.md",
        "apps/football/README.md",
        "apps/news/README.md",
        "apps/portal/README.md",
        "automation/README.md",
        "shared/README.md",
        "apps/market/engine/README.md",
        "apps/market/engine/data/players/README.md",
        "apps/market/engine/data/players/database/README.md",
        "apps/market/engine/evolution/README.md",
        "apps/market/engine/gold/README.md",
        "apps/market/engine/modules/evolutions/README.md",
        "apps/market/engine/modules/icons-heroes/README.md",
        "apps/market/engine/modules/price-tiers/README.md",
        "apps/market/engine/modules/weekly-cards/README.md",
    ],
    "FC27投资分析文章.md": [
        "apps/market/integrations/wechat/articles/fc27-investment/article.md",
    ],
}

TITLES = {
    "FC项目约定与任务契约合集.md": "FC 项目约定与任务契约合集",
    "FC模块与引擎说明合集.md": "FC 模块与引擎说明合集",
    "FC27投资分析文章.md": "FC27 投资分析文章",
}

os.makedirs(OUT, exist_ok=True)
today = datetime.now().strftime("%Y-%m-%d %H:%M")

for name, files in GROUPS.items():
    parts = [
        f"# {TITLES[name]}",
        "",
        "> 文档类型：项目知识库条目（由项目内 Markdown 文档按主题合并）",
        f"> 生成日期：{today}",
        f"> 来源项目：{ROOT}",
        "",
        "本合集收录以下原始文件，按顺序完整保留原文；每个文件之间以 `---` 分隔。",
        "",
    ]
    for index, relative in enumerate(files, start=1):
        parts.append(f"{index}. `{relative}`")
    parts.append("")
    parts.append("---")
    parts.append("")

    for index, relative in enumerate(files, start=1):
        absolute = os.path.join(ROOT, relative)
        with open(absolute, "r", encoding="utf-8") as handle:
            body = handle.read().rstrip()
        parts.append(f"## 附录 {index}：`{relative}`")
        parts.append("")
        parts.append(body)
        parts.append("")
        parts.append("---")
        parts.append("")

    content = "\n".join(parts).rstrip() + "\n"
    target = os.path.join(OUT, name)
    with open(target, "w", encoding="utf-8") as handle:
        handle.write(content)
    print(f"{name}: {len(content.encode('utf-8'))} bytes, {len(files)} sources")
