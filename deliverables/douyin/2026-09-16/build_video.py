#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FC27 每日情报台 · 抖音竖版速报视频渲染器
日期：2026-09-16
素材来源（全部取自当日任务产物，未做任何推断性填充）：
  - automation/runs/2026-09-16/news/tweets.json          （推文/情报）
  - automation/runs/2026-09-16/market/market.json        （市场概览）
  - automation/runs/2026-09-16/evolution/evolution.json  （进化卡）
  - automation/runs/2026-09-16/icons-heroes/state.json   （传奇台账）
  - reports/daily/2026-09-16/football.html               （足球榜单与头条）
口径：FC27 launchDate=2026-09-25，开服前价格为 listing-estimate 估算口径，不作成交价。
"""
import math
import os

from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920
FPS = 30
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "fc27-daily-2026-09-16-silent.mp4")   # 纯画面无音轨，供剪映配 AI 配音
COVER = os.path.join(HERE, "cover.jpg")

FONT_DIR = "/System/Library/Fonts"

BG_TOP = (7, 10, 18)
BG_BOT = (14, 21, 34)
CYAN = (34, 227, 179)
PURPLE = (139, 108, 255)
BLUE = (86, 156, 255)
AMBER = (255, 189, 89)
TEXT = (245, 248, 255)
MUTED = (150, 163, 186)
DIM = (96, 110, 133)
RED = (255, 98, 89)
GREEN = (78, 192, 138)
LINE = (34, 45, 62)
CARD = (19, 26, 39)

_cache = {}


def hei(size, weight=6):
    key = ("hei", size, weight)
    if key not in _cache:
        idx = 2 if weight >= 6 else 0
        _cache[key] = ImageFont.truetype(os.path.join(FONT_DIR, "Hiragino Sans GB.ttc"), size, index=idx)
    return _cache[key]


def num(size, style="bold"):
    key = ("num", size, style)
    if key not in _cache:
        idx = {"bold": 1, "black": 9, "regular": 0}[style]
        _cache[key] = ImageFont.truetype(os.path.join(FONT_DIR, "HelveticaNeue.ttc"), size, index=idx)
    return _cache[key]


def clamp01(x):
    return 0.0 if x < 0 else (1.0 if x > 1 else x)


def ease_out(t):
    t = clamp01(t)
    return 1 - (1 - t) ** 3


def ap(t, start, dur):
    return clamp01((t - start) / dur)


def rgba(c, a):
    return (c[0], c[1], c[2], int(max(0.0, min(1.0, a)) * 255))


def text_w(d, s, font):
    return d.textlength(s, font=font)


def wrap(d, text, font, maxw):
    lines, cur = [], ""
    for ch in text:
        if ch == "\n":
            lines.append(cur)
            cur = ""
            continue
        if d.textlength(cur + ch, font=font) <= maxw:
            cur += ch
        else:
            lines.append(cur)
            cur = ch
    if cur:
        lines.append(cur)
    return lines


def draw_lines(d, xy, lines, font, fill, lh, alpha=1.0):
    x, y = xy
    for ln in lines:
        d.text((x, y), ln, font=font, fill=rgba(fill, alpha))
        y += lh
    return y


# ---------- 背景 ----------
def make_bg():
    col = Image.new("RGB", (1, H))
    cp = col.load()
    for y in range(H):
        t = (y / (H - 1)) ** 0.85
        cp[0, y] = (int(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t),
                    int(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t),
                    int(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t))
    img = col.resize((W, H)).convert("RGBA")
    d = ImageDraw.Draw(img)
    for x in range(0, W + 1, 90):
        d.line([(x, 0), (x, H)], fill=(20, 28, 42, 255), width=1)
    for y in range(0, H + 1, 90):
        d.line([(0, y), (W, y)], fill=(20, 28, 42, 255), width=1)
    return img


def make_glow(color, size=1200, peak=0.14):
    """peak 为 0-1 的 alpha 峰值（注意：ImageDraw 画在 RGBA 上是替换而非混合）。"""
    g = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(g)
    steps = 64
    for i in range(steps, 0, -1):
        r = size / 2 * i / steps
        a = peak * (1 - i / steps) ** 2.4
        d.ellipse([size / 2 - r, size / 2 - r, size / 2 + r, size / 2 + r], fill=rgba(color, a))
    return g


BG = None
GLOW_C = None
GLOW_P = None


def base_canvas(t):
    c = BG.copy()
    c.alpha_composite(GLOW_C, (int(-620 + 40 * math.sin(t * 0.32)), int(-260 + 30 * math.cos(t * 0.27))))
    c.alpha_composite(GLOW_P, (int(480 + 40 * math.cos(t * 0.24)), int(1080 + 30 * math.sin(t * 0.29))))
    return c.convert("RGB")


def pen(canvas):
    return ImageDraw.Draw(canvas, "RGBA")


# ---------- 通用组件 ----------
def fit_font(d, text, size, maxw, kind="hei", weight=6, floor=22):
    """自适应字号：保证单行不溢出。kind=hei(黑体) / num(Helvetica)。"""
    while size > floor:
        f = hei(size, weight) if kind == "hei" else num(size, "black")
        if text_w(d, text, f) <= maxw:
            return f
        size -= 2
    return hei(floor, weight) if kind == "hei" else num(floor, "black")


def chrome(d, g):
    d.text((72, 96), "FC27 每日情报台", font=hei(30, 6), fill=rgba(TEXT, 0.92))
    d.text((72, 140), "EA SPORTS FC 27 · 每日速报", font=hei(24, 3), fill=rgba(DIM, 0.95))
    s = "2026.09.16"
    d.text((W - 72 - text_w(d, s, num(34, "bold")), 96), s, font=num(34, "bold"), fill=rgba(TEXT, 0.92))
    st = "WED · 周三"
    d.text((W - 72 - text_w(d, st, hei(24, 3)), 142), st, font=hei(24, 3), fill=rgba(DIM, 0.95))
    y = 1846
    d.rounded_rectangle([72, y, W - 72, y + 8], radius=4, fill=rgba(LINE, 1.0))
    d.rounded_rectangle([72, y, 72 + (W - 144) * clamp01(g), y + 8], radius=4, fill=rgba(CYAN, 0.92))


def footer(d, text):
    d.text((72, 1740), text, font=hei(22, 3), fill=rgba(DIM, 0.85))


def section_title(d, t, kicker, title, kicker_color=CYAN, top=300):
    a = ease_out(ap(t, 0.0, 0.45))
    y = top + (1 - a) * 26
    fk = hei(26, 6)
    kw = text_w(d, kicker, fk) + 44
    d.rounded_rectangle([72, y, 72 + kw, y + 52], radius=26, fill=rgba(kicker_color, 0.18 * a),
                        outline=rgba(kicker_color, 0.55 * a), width=2)
    d.text((94, y + 12), kicker, font=fk, fill=rgba(kicker_color, a))
    ft = fit_font(d, title, 64, W - 144, "hei", 6, floor=44)
    end = draw_lines(d, (72, y + 84), [title], ft, TEXT, 82, alpha=a)
    return end + 14


ROW_GAP = 26


def row_card(d, t, y, delay, accent, label, lines, value=None, value_color=None, h=None):
    a = ease_out(ap(t, delay, 0.5))
    x0, x1 = 72, W - 72
    lh = 46
    if h is None:
        h = (202 if value is not None else 160) + (len(lines) - 1) * lh
    yy = y + (1 - a) * 34
    d.rounded_rectangle([x0, yy, x1, yy + h], radius=26, fill=rgba(CARD, 0.94 * a),
                        outline=rgba(LINE, a), width=2)
    d.rounded_rectangle([x0, yy, x0 + 8, yy + h], radius=4, fill=rgba(accent, a))
    if value is not None:
        vf = fit_font(d, value, 70, 300, "num", floor=42)
        vw = text_w(d, value, vf)
        d.text((x0 + 46, yy + 28), value, font=vf, fill=rgba(value_color or accent, a))
        lf = fit_font(d, label, 36, x1 - x0 - 116 - vw, "hei", 6, floor=26)
        d.text((x0 + 46 + vw + 22, yy + 64), label, font=lf, fill=rgba(TEXT, a))
        inner_y = yy + 138
    else:
        lf = fit_font(d, label, 38, x1 - x0 - 92, "hei", 6, floor=24)
        d.text((x0 + 46, yy + 34), label, font=lf, fill=rgba(TEXT, a))
        inner_y = yy + 100
    for i, ln in enumerate(lines):
        sf = fit_font(d, ln, 30, x1 - x0 - 92, "hei", 3, floor=22)
        d.text((x0 + 46, inner_y + i * lh), ln, font=sf, fill=rgba(MUTED, a))
    return y + h + ROW_GAP


def chips(d, t, x, y, items, delay, color, font_size=28, gap=18):
    a = ease_out(ap(t, delay, 0.5))
    cx = x
    for it in items:
        w = text_w(d, it, hei(font_size, 6)) + 40
        d.rounded_rectangle([cx, y, cx + w, y + 58], radius=18, fill=rgba(color, 0.16 * a),
                            outline=rgba(color, 0.5 * a), width=2)
        d.text((cx + 20, y + 12), it, font=hei(font_size, 6), fill=rgba(color, a))
        cx += w + gap
    return y + 58


def big_number_center(d, t, cx, cy, value, unit, color, delay=0.0):
    a = ease_out(ap(t, delay, 0.6))
    sc = 0.86 + 0.14 * ease_out(ap(t, delay + 0.05, 0.7))
    f = num(int(300 * sc), "black")
    fu = hei(int(58 * sc), 6)
    vw = text_w(d, value, f)
    uw = text_w(d, unit, fu)
    x = cx - (vw + 18 + uw) / 2
    d.text((x, cy - 170 * sc), value, font=f, fill=rgba(color, a))
    d.text((x + vw + 18, cy + 40), unit, font=fu, fill=rgba(TEXT, a))


# ================= SCENES =================
def s0(d, t):
    a1 = ease_out(ap(t, 0.25, 0.5))
    y = 560 + (1 - a1) * 30
    k = "今日情报速报"
    fk = hei(30, 6)
    kw = text_w(d, k, fk) + 48
    d.rounded_rectangle([W / 2 - kw / 2, y, W / 2 + kw / 2, y + 60], radius=30,
                        fill=rgba(CYAN, 0.16 * a1), outline=rgba(CYAN, 0.55 * a1), width=2)
    d.text((W / 2 - text_w(d, k, fk) / 2, y + 12), k, font=fk, fill=rgba(CYAN, a1))

    a2 = ease_out(ap(t, 0.55, 0.6))
    f1 = hei(58, 3)
    s1 = "距离 FC27 终极版"
    d.text((W / 2 - text_w(d, s1, f1) / 2, 720 + (1 - a2) * 24), s1, font=f1, fill=rgba(MUTED, a2))
    f2 = hei(94, 6)
    s2 = "抢先体验"
    d.text((W / 2 - text_w(d, s2, f2) / 2, 800 + (1 - a2) * 24), s2, font=f2, fill=rgba(TEXT, a2))

    big_number_center(d, t, W / 2, 1150, "2", "天", AMBER, delay=0.95)

    a4 = ease_out(ap(t, 1.5, 0.6))
    sub = "9/18 抢先体验 · 9/25 正式开服"
    d.text((W / 2 - text_w(d, sub, hei(36, 6)) / 2, 1450), sub, font=hei(36, 6), fill=rgba(CYAN, a4))
    a5 = ease_out(ap(t, 1.9, 0.6))
    sub2 = "足球资讯 + FC27 市场 / 进化 / 传奇台账，每日汇总"
    d.text((W / 2 - text_w(d, sub2, hei(28, 3)) / 2, 1524), sub2, font=hei(28, 3), fill=rgba(DIM, a5))


def s1(d, t):
    y = section_title(d, t, "时间线", "本周关键节点", PURPLE)
    rows = [
        (CYAN, "09/16  周三", ["网页版 App 上线", "TOTW1 本周最佳阵容公布"]),
        (BLUE, "09/17  周四", ["官方 24 小时预热活动"]),
        (AMBER, "09/18  周五", ["终极版抢先体验发售", "本周 SBC 同步上线"]),
        (PURPLE, "09/25  周五", ["标准版正式开服 · 价格列才生效"]),
    ]
    for i, (c, lab, ls) in enumerate(rows):
        y = row_card(d, t, y, 0.75 + i * 0.32, c, lab, ls)


def s2(d, t):
    y = section_title(d, t, "卡面情报", "TOTW1 属性公布 + 全息卡首曝", CYAN)
    y = row_card(d, t, y, 0.8, AMBER, "本周最佳阵容 1（TOTW1）",
                 ["官方属性全部公开 · 古利特式卡面"], value="TOTW1", value_color=AMBER)
    y = row_card(d, t, y, 1.15, PURPLE, "全息卡（Holo）",
                 ["首次曝光 · 英雄卡 Holo 效果同步亮相"], value="NEW", value_color=PURPLE)
    y = row_card(d, t, y, 1.5, CYAN, "Ones to Watch 回归",
                 ["赛季通行证可选 · 5★5★ 为 7 场租借，五选一"])
    footer(d, "来源：FUTBIN / Fut Sheriff / FUT Agent 等公开账号（9/16）")


def s3(d, t):
    y = section_title(d, t, "SBC", "本周五 SBC 官方确认", AMBER)
    y = row_card(d, t, y, 0.8, AMBER, "布阿迪 Bouaddi",
                 ["摩洛哥籍中场 · 官方数据已公开"], value="SBC", value_color=AMBER)
    a = ease_out(ap(t, 1.2, 0.5))
    d.text((72, y + 4), "技能与特技", font=hei(32, 6), fill=rgba(TEXT, a))
    chips(d, t, 72, y + 62, ["3★ 技巧", "3★ 逆足"], 1.35, BLUE)
    chips(d, t, 72, y + 142, ["Jockey", "Intercept", "First Touch", "Press Proven"], 1.7, CYAN)
    y = row_card(d, t, y + 232, 2.05, PURPLE, "预购传奇卡：比赛风格官方公布",
                 ["图雷 / 希斯等预购传奇卡详情同步放出"])
    footer(d, "口径：均为官方属性公布，实际卡面以游戏内为准")


def s4(d, t):
    y = section_title(d, t, "进化", "473 张进化卡已上线 FUTBIN", CYAN)
    y = row_card(d, t, y, 0.8, CYAN, "当日收录进化卡总量",
                 ["全部 5 条进化路线均为免费（FREE）"], value="473", value_color=CYAN)
    a = ease_out(ap(t, 1.2, 0.5))
    d.text((72, y + 4), "5 条路线", font=hei(32, 6), fill=rgba(TEXT, a))
    chips(d, t, 72, y + 62, ["Intro to Evolutions", "Repeatable"], 1.35, PURPLE, font_size=26)
    chips(d, t, 72, y + 142, ["Pathway", "Training Camp", "Repeat Delivery"], 1.6, PURPLE, font_size=26)
    y2 = y + 236
    a3 = ease_out(ap(t, 1.9, 0.5))
    d.rounded_rectangle([72, y2, W - 72, y2 + 176], radius=26, fill=rgba(CARD, 0.94 * a3),
                        outline=rgba(LINE, a3), width=2)
    d.rounded_rectangle([72, y2, 80, y2 + 176], radius=4, fill=rgba(AMBER, a3))
    d.text((116, y2 + 34), "当日热度最高", font=hei(28, 3), fill=rgba(MUTED, a3))
    d.text((116, y2 + 80), "Malić  79 RB", font=hei(46, 6), fill=rgba(TEXT, a3))
    hv = "热度 477"
    d.text((W - 116 - text_w(d, hv, num(44, "bold")), y2 + 84), hv,
           font=num(44, "bold"), fill=rgba(AMBER, a3))
    footer(d, "口径：Rating 为进化后 OVR；热度为 FUTBIN 页面使用计数")


def s5(d, t):
    y = section_title(d, t, "避坑", "开服前要先知道的两件事", RED)
    a = ease_out(ap(t, 0.8, 0.5))
    d.rounded_rectangle([72, y, W - 72, y + 240], radius=26, fill=rgba((44, 24, 26), 0.94 * a),
                        outline=rgba(RED, 0.5 * a), width=2)
    d.text((116, y + 32), "1  官方已强化代练与金币交易的处罚提示", font=hei(36, 6), fill=rgba(RED, a))
    draw_lines(d, (116, y + 96), ["玩家首次登录时会看到相关免责声明", "别拿自己的账号去试水"],
               hei(30, 3), MUTED, 46, alpha=a)
    y += 268
    a2 = ease_out(ap(t, 1.25, 0.5))
    d.rounded_rectangle([72, y, W - 72, y + 240], radius=26, fill=rgba((42, 36, 22), 0.94 * a2),
                        outline=rgba(AMBER, 0.5 * a2), width=2)
    d.text((116, y + 32), "2  开服前不存在「成交价」", font=hei(36, 6), fill=rgba(AMBER, a2))
    draw_lines(d, (116, y + 96), ["FUTBIN 两个平台价（Console / PC）均为 0",
                                  "现价属列表估算口径，9/25 前不谈涨跌"],
               hei(30, 3), MUTED, 46, alpha=a2)
    footer(d, "来源：当日市场监控与资讯采集产物（如实空状态，未用旧数据填充）")


def s6(d, t):
    y = section_title(d, t, "足球速览", "今日足坛三件事", GREEN)
    y = row_card(d, t, y, 0.8, CYAN, "梅西入选阿根廷 10/6 告别赛名单",
                 ["布宜诺斯艾利斯纪念碑球场 · 国家队谢幕战"])
    y = row_card(d, t, y, 1.15, RED, "C 罗遭遇加盟沙特以来最大分差失利",
                 ["亚冠精英联赛首轮 0-4 阿尔艾因"])
    y = row_card(d, t, y, 1.5, BLUE, "五大联赛领跑：阿森纳 / 巴萨 / 罗马 / 弗赖堡 / 里尔",
                 ["西甲射手榜 6 球四人并列 · 梅西 MLS 19 球领跑"])
    footer(d, "来源：BBC Sport / ESPN 等（数据截止 2026-09-16）")


def s7(d, t):
    a1 = ease_out(ap(t, 0.3, 0.6))
    f1 = hei(70, 6)
    s1 = "9/25 开服"
    d.text((W / 2 - text_w(d, s1, f1) / 2, 720 + (1 - a1) * 26), s1, font=f1, fill=rgba(AMBER, a1))
    a2 = ease_out(ap(t, 0.7, 0.6))
    f2 = hei(84, 6)
    s2 = "你会先做哪张卡？"
    d.text((W / 2 - text_w(d, s2, f2) / 2, 816 + (1 - a2) * 26), s2, font=f2, fill=rgba(TEXT, a2))
    a3 = ease_out(ap(t, 1.2, 0.6))
    d.rounded_rectangle([W / 2 - 250, 1020, W / 2 + 250, 1120], radius=50,
                        fill=rgba(CYAN, 0.16 * a3), outline=rgba(CYAN, 0.6 * a3), width=3)
    tip = "评论区聊聊"
    d.text((W / 2 - text_w(d, tip, hei(40, 6)) / 2, 1046), tip, font=hei(40, 6), fill=rgba(CYAN, a3))
    a4 = ease_out(ap(t, 1.6, 0.6))
    lines = ["每天更新足球资讯 + FC27 市场 / 进化 / 传奇台账",
             "数据来源：BBC Sport、ESPN、FUTBIN 等公开来源整理"]
    yy = 1250
    for ln in lines:
        d.text((W / 2 - text_w(d, ln, hei(28, 3)) / 2, yy), ln, font=hei(28, 3), fill=rgba(DIM, a4))
        yy += 52
    a5 = ease_out(ap(t, 2.0, 0.6))
    brand = "FC27 每日情报台"
    d.text((W / 2 - text_w(d, brand, hei(34, 6)) / 2, 1440), brand, font=hei(34, 6), fill=rgba(MUTED, a5))


SCENES = [
    ("钩子", s0, 4.2),
    ("时间线", s1, 5.0),
    ("卡面情报", s2, 5.4),
    ("周五SBC", s3, 4.8),
    ("进化", s4, 5.2),
    ("避坑", s5, 4.6),
    ("足球速览", s6, 4.6),
    ("结尾", s7, 4.0),
]


def init():
    global BG, GLOW_C, GLOW_P
    BG = make_bg()
    GLOW_C = make_glow(CYAN, 1200, 0.34)
    GLOW_P = make_glow(PURPLE, 1200, 0.30)


def frame_at(si, lt, g, canvas=None):
    c = canvas if canvas is not None else base_canvas(g * sum(s[2] for s in SCENES))
    d = pen(c)
    chrome(d, g)
    SCENES[si][1](d, lt)
    return c


def main():
    init()
    total_dur = sum(s[2] for s in SCENES)
    total_frames = int(round(total_dur * FPS))
    print("total %.1fs / %d frames" % (total_dur, total_frames), flush=True)

    import imageio_ffmpeg
    writer = imageio_ffmpeg.write_frames(
        OUT, (W, H), fps=FPS, codec="libx264", pix_fmt_in="rgb24", pix_fmt_out="yuv420p",
        macro_block_size=1, ffmpeg_log_level="error",
        output_params=["-crf", "15", "-preset", "slow", "-pix_fmt", "yuv420p",
                       "-movflags", "+faststart"],
    )
    writer.send(None)

    idx = 0
    cover_done = False
    for si, (name, fn, dur) in enumerate(SCENES):
        n = int(round(dur * FPS))
        for k in range(n):
            lt = k / FPS
            g = idx / max(1, total_frames - 1)
            canvas = frame_at(si, lt, g)
            writer.send(canvas.tobytes())
            if not cover_done and idx == int(1.6 * FPS):
                canvas.save(COVER, quality=92)
                cover_done = True
            idx += 1
        print("  scene %d %s done (%d frames)" % (si, name, idx), flush=True)

    writer.close()
    import subprocess
    print("saved:", OUT, os.path.getsize(OUT), flush=True)


if __name__ == "__main__":
    main()
