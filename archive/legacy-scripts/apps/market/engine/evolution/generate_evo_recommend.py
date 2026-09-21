#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
作用：生成FC27热门低价球员的进化推荐卡长图。
暗色主题，按位置分组，价格降序
"""

import json
import os
from PIL import Image, ImageDraw, ImageFont

# ========================== 配置 ==========================
OUTPUT_PATH = "/Users/wuyanzu/Desktop/FC/apps/market/engine/evolution/data/fc27/popular-le82-evolution-recommend.png"
DATA_PATH = "/tmp/futbin_low82_full.json"
PLAYSTYLES_PATH = "/tmp/easysbc_playstyles.json"
CARDS_DIR = "/tmp/easysbc_cards"

WIDTH = 1200
MARGIN = 20
CARD_COLS = 3  # 每行卡片数
CARD_GAP_X = 16
CARD_GAP_Y = 16
CARD_WIDTH = (WIDTH - MARGIN * 2 - CARD_GAP_X * (CARD_COLS - 1)) // CARD_COLS  # ~370
CARD_HEIGHT = 136

# 颜色
BG_TOP = "#1a1a2e"
BG_BOTTOM = "#16213e"
HEADER_BG = "#0f3460"
SECTION_BG = "#1a1a2e"
CARD_BG = "#252a40"
CARD_BORDER = "#3a4566"
TEXT_WHITE = "#ffffff"
TEXT_GRAY = "#b0b8d1"
TEXT_GOLD = "#ffd700"
TEXT_SILVER = "#c0c0c0"
BADGE_GOLD_BG = "#b8860b"
BADGE_SILVER_BG = "#708090"
PLACEHOLDER_BG = "#2a2a3e"
POS_BG = "#4a5568"

# 字体路径（macOS 系统字体）
FONT_PATH = "/System/Library/Fonts/Hiragino Sans GB.ttc"
FONT_PATH_FALLBACK = "/System/Library/Fonts/STHeiti Medium.ttc"


def load_font(size):
    """加载字体，带降级"""
    for fp in [FONT_PATH, FONT_PATH_FALLBACK]:
        try:
            return ImageFont.truetype(fp, size)
        except Exception:
            continue
    return ImageFont.load_default()


# 加载数据
with open(DATA_PATH, "r", encoding="utf-8") as f:
    players = json.load(f)

with open(PLAYSTYLES_PATH, "r", encoding="utf-8") as f:
    playstyles_map = json.load(f)

# 按 group 分组，组内按 price 降序
groups = {"GK": [], "DEF": [], "MID": [], "ATT": []}
for p in players:
    g = p.get("group", "")
    if g in groups:
        groups[g].append(p)

for g in groups:
    groups[g].sort(key=lambda x: x.get("price", 0), reverse=True)

# ========================== 辅助函数 ==========================

def hex_to_rgb(hex_color):
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


def draw_gradient_bg(draw, width, height):
    """绘制垂直渐变背景"""
    top = hex_to_rgb(BG_TOP)
    bottom = hex_to_rgb(BG_BOTTOM)
    for y in range(height):
        ratio = y / height
        r = int(top[0] + (bottom[0] - top[0]) * ratio)
        g = int(top[1] + (bottom[1] - top[1]) * ratio)
        b = int(top[2] + (bottom[2] - top[2]) * ratio)
        draw.line([(0, y), (width, y)], fill=(r, g, b))


def get_card_image(player_id):
    """获取球员卡图，缺失返回 None"""
    path = os.path.join(CARDS_DIR, f"{player_id}.png")
    if os.path.exists(path):
        try:
            img = Image.open(path).convert("RGBA")
            return img.resize((120, 120), Image.LANCZOS)
        except Exception:
            pass
    return None


def draw_rounded_rect(draw, xy, radius, fill, outline=None, width=1):
    """绘制圆角矩形"""
    x1, y1, x2, y2 = xy
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def shorten_name(name, max_len=14):
    """缩写过长名字"""
    if len(name) <= max_len:
        return name
    parts = name.split()
    if len(parts) > 2:
        # 取首字母缩写中间名
        short = f"{parts[0]} {' '.join([p[0]+'.' for p in parts[1:-1]])} {parts[-1]}"
        if len(short) > max_len + 3:
            return name[:max_len] + "..."
        return short
    return name[:max_len] + "..."


# ========================== 字体 ==========================
font_title = load_font(32)
font_subtitle = load_font(18)
font_ovr = load_font(36)
font_name = load_font(20)
font_pos = load_font(14)
font_price = load_font(18)
font_stats = load_font(13)
font_badge = load_font(11)
font_placeholder = load_font(16)
font_section = load_font(26)
font_source = load_font(14)

# ========================== 计算图片高度 ==========================
header_height = 100
section_gap = 30
group_title_height = 50

total_height = header_height
for group_name in ["GK", "DEF", "MID", "ATT"]:
    count = len(groups[group_name])
    rows = (count + CARD_COLS - 1) // CARD_COLS
    if count > 0:
        total_height += group_title_height
        total_height += rows * (CARD_HEIGHT + CARD_GAP_Y) + section_gap

# 底部留白
total_height += 40

# ========================== 创建画布 ==========================
img = Image.new("RGB", (WIDTH, total_height), hex_to_rgb(BG_TOP))
draw = ImageDraw.Draw(img)
draw_gradient_bg(draw, WIDTH, total_height)

# ========================== 绘制顶部标题栏 ==========================
y_cursor = 0
# 标题栏背景
draw.rectangle([0, 0, WIDTH, header_height], fill=hex_to_rgb(HEADER_BG))

# 标题文字
title_text = "FC27 热门低价球员进化推荐卡"
draw.text((WIDTH // 2, 30), title_text, font=font_title, fill=hex_to_rgb(TEXT_GOLD), anchor="mm")

subtitle = "≤82分低价潜力股  |  按位置分组  |  组内按价格降序  |  数据来源: FUTBIN / EasySBC"
draw.text((WIDTH // 2, 70), subtitle, font=font_subtitle, fill=hex_to_rgb(TEXT_GRAY), anchor="mm")

y_cursor = header_height + section_gap // 2

# ========================== 绘制每个位置组 ==========================
stat_labels = ["速", "射", "传", "盘", "防", "身"]
stat_keys = ["Pac", "Sho", "Pas", "Dri", "Def", "Phy"]

for group_name in ["GK", "DEF", "MID", "ATT"]:
    group_players = groups[group_name]
    if not group_players:
        continue

    # 组标题背景条
    draw.rectangle([MARGIN, y_cursor, WIDTH - MARGIN, y_cursor + group_title_height],
                   fill=hex_to_rgb("#1f2b47"))
    # 组标题文字
    group_labels = {"GK": "门将 GK", "DEF": "后卫 DEF", "MID": "中场 MID", "ATT": "前锋 ATT"}
    g_text = f"{group_labels[group_name]}  —  共 {len(group_players)} 人"
    draw.text((MARGIN + 15, y_cursor + group_title_height // 2),
              g_text, font=font_section, fill=hex_to_rgb(TEXT_WHITE), anchor="lm")
    y_cursor += group_title_height + CARD_GAP_Y

    # 绘制卡片网格
    rows = (len(group_players) + CARD_COLS - 1) // CARD_COLS
    for idx, player in enumerate(group_players):
        row = idx // CARD_COLS
        col = idx % CARD_COLS
        x = MARGIN + col * (CARD_WIDTH + CARD_GAP_X)
        y = y_cursor + row * (CARD_HEIGHT + CARD_GAP_Y)

        # 卡片背景
        draw_rounded_rect(draw, [x, y, x + CARD_WIDTH, y + CARD_HEIGHT],
                          radius=8, fill=hex_to_rgb(CARD_BG), outline=hex_to_rgb(CARD_BORDER), width=1)

        # 左侧卡图区域
        card_img = get_card_image(player.get("id"))
        if card_img:
            img.paste(card_img, (x + 8, y + 8), card_img)
        else:
            # 灰色占位
            draw.rectangle([x + 8, y + 8, x + 8 + 120, y + 8 + 120],
                           fill=hex_to_rgb(PLACEHOLDER_BG), outline=hex_to_rgb("#444466"), width=1)
            draw.text((x + 8 + 60, y + 8 + 60), "无图", font=font_placeholder,
                      fill=hex_to_rgb(TEXT_GRAY), anchor="mm")

        # 右侧信息区域起点
        rx = x + 8 + 120 + 10  # right x
        ry = y + 8  # right y
        info_w = CARD_WIDTH - (8 + 120 + 10 + 8)

        # 评分 + 位置 + 名字（第一行）
        rating = player.get("rating", 0)
        position = player.get("position", "")
        name = player.get("name", "Unknown")

        # OVR 大字
        draw.text((rx, ry), str(rating), font=font_ovr, fill=hex_to_rgb(TEXT_WHITE))
        ovr_w = draw.textlength(str(rating), font=font_ovr)

        # POS 小标签
        pos_x = rx + ovr_w + 8
        pos_y = ry + 10
        pos_w = max(36, draw.textlength(position, font=font_pos) + 10)
        draw.rounded_rectangle([pos_x, pos_y, pos_x + pos_w, pos_y + 22],
                               radius=4, fill=hex_to_rgb(POS_BG))
        draw.text((pos_x + pos_w // 2, pos_y + 11), position, font=font_pos,
                  fill=hex_to_rgb(TEXT_WHITE), anchor="mm")

        # 球员名（放在POS右侧，更多空间）
        name_x = pos_x + pos_w + 8
        name_y = ry + 4
        # 可用宽度
        name_avail_w = (x + CARD_WIDTH - 8) - name_x
        short_name = shorten_name(name, max_len=18)
        # 如果名字太长，截断显示
        name_bbox = draw.textbbox((0, 0), short_name, font=font_name)
        name_w = name_bbox[2] - name_bbox[0]
        if name_w > name_avail_w:
            # 再缩短
            for cutoff in range(len(short_name), 3, -1):
                test = short_name[:cutoff] + "..."
                tw = draw.textbbox((0, 0), test, font=font_name)
                if (tw[2] - tw[0]) <= name_avail_w:
                    short_name = test
                    break
        draw.text((name_x, name_y), short_name, font=font_name, fill=hex_to_rgb(TEXT_WHITE))

        # 第二行：价格
        price = player.get("price", 0)
        price_str = f"{price:,} 金币"
        draw.text((rx, ry + 44), price_str, font=font_price, fill=hex_to_rgb(TEXT_GOLD))

        # 第三行：六维属性
        stats = player.get("stats", {})
        stats_y = ry + 72
        stat_box_w = info_w // 6
        for i, (label, key) in enumerate(zip(stat_labels, stat_keys)):
            sx = rx + i * stat_box_w
            val = stats.get(key, 0)
            # 属性值颜色：高值用亮白，低值用灰
            val_color = TEXT_WHITE if val >= 80 else TEXT_GRAY
            draw.text((sx + stat_box_w // 2, stats_y), f"{label}", font=font_stats,
                      fill=hex_to_rgb(TEXT_GRAY), anchor="mt")
            draw.text((sx + stat_box_w // 2, stats_y + 16), str(val), font=font_stats,
                      fill=hex_to_rgb(val_color), anchor="mt")

        # 第四行：PlayStyles 徽章
        badges_y = ry + 108
        ps = player.get("playStyles", [])
        ps_plus = player.get("playStylesPlus", [])

        badge_x = rx
        badge_h = 20
        for pid in ps_plus:
            ps_name = playstyles_map.get(str(pid), {}).get("name", "")
            if not ps_name:
                continue
            bw = max(40, draw.textlength(ps_name, font=font_badge) + 10)
            if badge_x + bw > rx + info_w:
                break  # 超出宽度则停止
            draw.rounded_rectangle([badge_x, badges_y, badge_x + bw, badges_y + badge_h],
                                   radius=3, fill=hex_to_rgb(BADGE_GOLD_BG))
            draw.text((badge_x + bw // 2, badges_y + badge_h // 2), ps_name[:10],
                      font=font_badge, fill=hex_to_rgb(TEXT_WHITE), anchor="mm")
            badge_x += bw + 4

        for pid in ps:
            if pid in ps_plus:
                continue  # 已在 plus 中显示
            ps_name = playstyles_map.get(str(pid), {}).get("name", "")
            if not ps_name:
                continue
            bw = max(40, draw.textlength(ps_name, font=font_badge) + 10)
            if badge_x + bw > rx + info_w:
                break
            draw.rounded_rectangle([badge_x, badges_y, badge_x + bw, badges_y + badge_h],
                                   radius=3, fill=hex_to_rgb(BADGE_SILVER_BG))
            draw.text((badge_x + bw // 2, badges_y + badge_h // 2), ps_name[:10],
                      font=font_badge, fill=hex_to_rgb(TEXT_WHITE), anchor="mm")
            badge_x += bw + 4

    y_cursor += rows * (CARD_HEIGHT + CARD_GAP_Y) + section_gap

# ========================== 底部来源说明 ==========================
footer_y = total_height - 30
draw.text((WIDTH // 2, footer_y),
          "数据更新时间: 2026-09-14  |  价格单位: 游戏金币  |  推荐仅供参考，投资有风险",
          font=font_source, fill=hex_to_rgb(TEXT_GRAY), anchor="mm")

# ========================== 保存 ==========================
img.save(OUTPUT_PATH, "PNG", quality=95)
print(f"图片已保存: {OUTPUT_PATH}")
print(f"尺寸: {WIDTH} x {total_height}")
print(f"球员统计: GK={len(groups['GK'])}, DEF={len(groups['DEF'])}, MID={len(groups['MID'])}, ATT={len(groups['ATT'])}")
