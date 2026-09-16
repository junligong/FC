#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
为 fc27-daily-2026-09-16.mp4 添加音轨：
  1) 中文旁白（macOS say / Tingting，逐段自适应语速对齐画面）
  2) 程序化合成的氛围垫乐（numpy 正弦叠加，无版权素材）
输出：带旁白+BGM 版、纯旁白版
"""
import os
import subprocess
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
VIDEO = os.path.join(HERE, "fc27-daily-2026-09-16.mp4")
TMP = os.path.join(HERE, ".audio_tmp")
SR = 44100
FPS = 30

# 与 build_video.py 的 SCENES 严格对应：帧数 → 起始时间 / 段长
SCENE_FRAMES = [126, 150, 162, 144, 156, 138, 138, 120]
TOTAL_FRAMES = sum(SCENE_FRAMES)
TOTAL_SEC = TOTAL_FRAMES / FPS

# 每段口播词（避免英文缩写被逐字母念出；数字用汉字以保证读音）
NARRATION = [
    "FC 二十七情报速报，距终极版抢先体验只剩两天",
    "周三网页版上线，周五终极版发售，二十五号正式开服",
    "本周最佳阵容属性公开，全息卡也首次曝光了",
    "周五挑战是布阿迪，三星技巧三星逆足",
    "进化卡一口气上线四百七十三张，五条路线全部免费",
    "提醒两点：官方严查代练，开服前价格不等于成交价",
    "足球方面，梅西入选告别赛名单，C 罗零比四惨败",
    "开服后你先做哪张卡？评论区聊聊",
]

# 每段的垫乐和弦（A 小调进行，低音铺底）
CHORDS = [
    [110.00, 164.81, 220.00, 329.63],
    [87.31, 130.81, 174.61, 261.63],
    [130.81, 196.00, 261.63, 392.00],
    [98.00, 146.83, 196.00, 293.66],
    [110.00, 164.81, 220.00, 329.63],
    [87.31, 130.81, 174.61, 261.63],
    [130.81, 196.00, 261.63, 392.00],
    [98.00, 146.83, 196.00, 293.66],
]


def scene_start(i):
    return sum(SCENE_FRAMES[:i]) / FPS


def say(text, rate, out):
    subprocess.run(
        ["say", "-v", "Tingting", "-r", str(rate), "-o", out,
         "--data-format=LEI16@22050", text],
        check=True,
    )


def read_wav(path):
    w = wave.open(path, "rb")
    n, sr, ch = w.getnframes(), w.getframerate(), w.getnchannels()
    a = np.frombuffer(w.readframes(n), dtype="<i2").astype(np.float32) / 32768.0
    if ch > 1:
        a = a.reshape(-1, ch).mean(axis=1)
    return a, sr


def resample(a, sr, target=SR):
    if sr == target:
        return a.astype(np.float32)
    t_in = np.arange(len(a)) / sr
    n_out = int(len(a) * target / sr)
    return np.interp(np.arange(n_out) / target, t_in, a).astype(np.float32)


def fade(a, fin=0.015, fout=0.05):
    a = a.copy()
    ni = min(int(fin * SR), len(a) // 2)
    no = min(int(fout * SR), len(a) // 2)
    if ni:
        a[:ni] *= np.linspace(0, 1, ni)
    if no:
        a[-no:] *= np.linspace(1, 0, no)
    return a


def pad(freqs, dur):
    """无版权氛围垫乐：正弦叠加 + 泛音 + 缓慢 LFO。"""
    t = np.arange(int(dur * SR)) / SR
    y = np.zeros_like(t)
    for i, f in enumerate(freqs):
        g = 1.0 / (i + 2)
        y += g * np.sin(2 * np.pi * f * (1 + 0.0015 * i) * t)
        y += 0.22 * g * np.sin(2 * np.pi * f * 2 * t)
    y /= (np.abs(y).max() + 1e-9)
    return y * (0.82 + 0.18 * np.sin(2 * np.pi * 0.11 * t))


def build_voice_track():
    """逐段合成并按时间轴摆放，超长则提升语速重合成。"""
    os.makedirs(TMP, exist_ok=True)
    track = np.zeros(int(TOTAL_SEC * SR) + SR, dtype=np.float32)
    report = []
    for i, text in enumerate(NARRATION):
        start = scene_start(i)
        slot = SCENE_FRAMES[i] / FPS
        budget = slot - 0.25
        best = None
        for rate in (185, 205, 225, 245, 265):
            out = os.path.join(TMP, "seg%d_%d.wav" % (i, rate))
            say(text, rate, out)
            a, sr = read_wav(out)
            a = resample(a, sr)
            a = fade(a)
            dur = len(a) / SR
            if best is None or dur < best[1]:
                best = (a, dur, rate)
            if dur <= budget:
                break
        a, dur, rate = best
        s = int(start * SR)
        track[s:s + len(a)] += a
        report.append((i, text, round(dur, 2), round(slot, 2), rate))
    return track, report


def build_bgm_track():
    track = np.zeros(int(TOTAL_SEC * SR) + SR, dtype=np.float32)
    for i, ch in enumerate(CHORDS):
        start = scene_start(i)
        slot = SCENE_FRAMES[i] / FPS
        seg = pad(ch, slot + 0.6)                                # 多生成一点供交叠
        seg = fade(seg, fin=min(0.6, slot / 3), fout=min(0.6, slot / 3))[:int((slot + 0.5) * SR)]
        s = int(max(0, start - 0.25) * SR)
        track[s:s + len(seg)] += seg
    track /= (np.abs(track).max() + 1e-9)
    return track * 0.11                                          # 压到很低的氛围层


def write_wav(path, mono):
    data = np.clip(mono, -1.0, 1.0)
    pcm = (data * 32767).astype("<i2")
    stereo = np.repeat(pcm[:, None], 2, axis=1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(stereo.tobytes())


def ffmpeg_exe():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def make_silent():
    """每次运行都从当前成片重新剥出纯视频轨，避免音轨叠加。"""
    silent = os.path.join(TMP, "silent.mp4")
    subprocess.run(
        [ffmpeg_exe(), "-y", "-loglevel", "error", "-i", VIDEO,
         "-an", "-c:v", "copy", silent],
        check=True,
    )
    return silent


def mux(silent, audio, out_video):
    """显式映射：视频取输入 0 的视频轨，音频只取输入 1 的音轨；响度归一到 -14 LUFS。"""
    tmp = out_video + ".muxing.mp4"
    subprocess.run(
        [ffmpeg_exe(), "-y", "-loglevel", "error",
         "-i", silent, "-i", audio,
         "-map", "0:v:0", "-map", "1:a:0",
         "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
         "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
         "-shortest", "-movflags", "+faststart", tmp],
        check=True,
    )
    os.replace(tmp, out_video)


def main():
    os.makedirs(TMP, exist_ok=True)
    silent = make_silent()

    voice, report = build_voice_track()
    bgm = build_bgm_track()
    print("%-4s %-8s %-8s %-6s %s" % ("seg", "语音时长", "画面段长", "语速", "文本"))
    ok = True
    for i, text, dur, slot, rate in report:
        flag = "" if dur <= slot else "  <-- 超长!"
        if dur > slot:
            ok = False
        print("%-4d %-8.2f %-8.2f %-6d %s%s" % (i, dur, slot, rate, text, flag))
    print("全部段落语音均落在画面段内:", ok)

    voice_path = os.path.join(TMP, "voice.wav")
    mix_path = os.path.join(TMP, "mix.wav")
    bgm_path = os.path.join(TMP, "bgm.wav")
    write_wav(voice_path, voice * 0.92)
    write_wav(mix_path, voice * 0.92 + bgm)
    write_wav(bgm_path, bgm * 3.0)          # 纯音乐版：垫乐单独听需要抬回来

    outs = [
        (mix_path, VIDEO),
        (voice_path, os.path.join(HERE, "fc27-daily-2026-09-16-voice-only.mp4")),
        (bgm_path, os.path.join(HERE, "fc27-daily-2026-09-16-bgm-only.mp4")),
    ]
    for audio, out in outs:
        mux(silent, audio, out)
        print("输出:", os.path.basename(out))


if __name__ == "__main__":
    main()
