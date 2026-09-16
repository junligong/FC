#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成剪映可直接导入的 SRT 字幕文件（8 段，时间轴与 silent 成片严格对齐）。
剪映流程：导入 silent.mp4 → 导入本 SRT → 选中文本轨「朗读」→ 生成 AI 配音 → 隐藏字幕轨 → 加音乐 → 导出。

口播词已按「剪映 AI 配音约 4 字/秒」的语速配比段落长度，不需要二次变速。
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRT = os.path.join(HERE, "fc27-daily-2026-09-16.srt")
SCRIPT_TXT = os.path.join(HERE, "口播稿.txt")
FPS = 30
SCENE_FRAMES = [126, 150, 162, 144, 156, 138, 138, 120]

# (段内起声偏移, 段内收声偏移, 口播文本)
# 起声留 0.3s、收声留 0.1s，避免紧贴段落切换；文本按「剪映 AI 配音约 4 字/秒」配比段落长度
SEGMENTS = [
    (0.30, -0.10, "抢先体验只剩两天"),
    (0.30, -0.10, "周五终极版发售，二十五号正式开服"),
    (0.30, -0.10, "最佳阵容属性公开，全息卡首次曝光"),
    (0.30, -0.10, "周五挑战布阿迪，三星技巧三星逆足"),
    (0.30, -0.10, "进化卡上线四百七十三张，路线全免费"),
    (0.30, -0.10, "官方严查代练，开服前价格非成交价"),
    (0.30, -0.10, "梅西入选告别赛，C 罗零比四惨败"),
    (0.30, -0.10, "开服后先做哪张卡？评论区聊"),
]


def scene_bounds(i):
    start = sum(SCENE_FRAMES[:i]) / FPS
    end = start + SCENE_FRAMES[i] / FPS
    return start, end


def ts(sec):
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    ms = int(round((sec - int(sec)) * 1000))
    if ms == 1000:
        s, ms = s + 1, 0
    return "%02d:%02d:%02d,%03d" % (h, m, s, ms)


def main():
    blocks, rows = [], []
    for i, (pad_in, pad_out, text) in enumerate(SEGMENTS):
        s0, s1 = scene_bounds(i)
        a = s0 + pad_in
        b = s1 + pad_out
        blocks.append("%d\n%s --> %s\n%s\n" % (i + 1, ts(a), ts(b), text))
        rows.append((i + 1, a, b, b - a, round(len(text) / 4.0, 2), text))

    with open(SRT, "w", encoding="utf-8", newline="\r\n") as f:
        f.write("\n".join(blocks))

    # 逐条口播稿：剪映里手动「新建文本 → 粘贴 → 朗读」时按行复制
    with open(SCRIPT_TXT, "w", encoding="utf-8") as f:
        f.write("FC27 日报速报 · 口播稿（2026-09-16）\n")
        f.write("用法：剪映编辑器 →「文本」→ 新建文本 → 每行复制一条 → 右键「朗读」\n")
        f.write("顺序即时间顺序，括号内为建议入点。\n\n")
        for i, (pad_in, _, text) in enumerate(SEGMENTS):
            start = scene_bounds(i)[0] + pad_in
            f.write("%d. [%s]  %s\n" % (i + 1, ts(start).split(",")[0][3:], text))

    print("SRT:", SRT)
    print("口播稿:", SCRIPT_TXT)
    print()
    print("%-3s %-9s %-9s %-7s %-9s %s" % ("#", "起", "收", "字幕时长", "预估配音", "口播文本"))
    for n, a, b, dur, est, text in rows:
        warn = "" if est <= dur else "  <-- 可能放不下"
        print("%-3d %-9.2f %-9.2f %-7.2f %-9.2f %s%s" % (n, a, b, dur, est, text, warn))
    total = sum(r[4] for r in rows)
    print("\n口播总时长预估 %.1fs / 视频 %.1fs" % (total, sum(SCENE_FRAMES) / FPS))


if __name__ == "__main__":
    main()
