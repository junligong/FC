#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FC27 情报台 → 抖音素材截图器

把线上站点 https://fc27-site.app.workbuddy.host/ 的各个栏目（足球动态 / FC27 资讯 /
FC27 市场 / 进化专栏 / 传奇英雄专栏）逐栏目展开、滚动、截图、拼接成整栏分析长图，
供后续写视频讲解文字、放进剪映使用。

原理
----
站点每个栏目内容都挂在 `iframe.panel-iframe[srcdoc]` 里，且 iframe 高度是固定的
`calc(100vh - 250px)` —— 直接截屏只能拿到视口那一屏。所以流程是：

  1. 点左侧 `nav#nav button[data-view=X]` 切栏目（必要时再点 `.subtab[data-subid=Y]`）
  2. 用 /eval 把 iframe 高度撑成内容真实高度，并解除内部 position:sticky/fixed
     （否则滚动拼接时固定表头会在长图上重复出现）
  3. 用 /eval 做绝对滚动 + /screenshot 逐屏截图（截图是 dpr=2 的高清图）
  4. Pillow 按实际 scrollY 拼接成长图，再裁掉父页面导航只留栏目内容

依赖
----
- 浏览器通道：web-access 技能的 CDP Proxy（默认 http://localhost:3456）
  自检：node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs（退出码 0 才可用）
- Pillow：/Users/wuyanzu/.workbuddy/binaries/python/envs/fc-video/bin/python

用法
----
  <venv>/bin/python apps/douyin/capture-shots.py                 # 输出到 deliverables/douyin/<站点日期>/shots/
  <venv>/bin/python apps/douyin/capture-shots.py --date 2026-09-16
  <venv>/bin/python apps/douyin/capture-shots.py --only football,market
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
PROXY = os.environ.get("FC_CDP_PROXY", "http://localhost:3456")
SITE = os.environ.get("FC_SITE_URL", "https://fc27-site.app.workbuddy.host/index.html")

# (栏目 key, view, 输出名, 子标签 subid, 最大截取高度 CSS px)
# 注：资讯 / 进化 / 扫描 / 传奇 是超长流（实测 6k~57k px），必须限高，否则拼图会爆内存；
#     home 是双栏布局、右栏「进化专栏」极长会把 section 撑到 10 万 px，所以单独压到 1400。
COLUMNS = [
    ("home",       "home",       "00-今日总览",       None,       1400),
    ("football",   "football",   "01-足球动态",       None,       6000),
    ("news",       "news",       "02-FC27资讯",       None,       7000),
    ("market-ov",  "market",     "03-市场概览",       "overview", 6500),
    ("market-sc",  "market",     "04-市场扫描",       "scan",     7000),
    ("evolution",  "evolution",  "05-进化专栏",       None,       7000),
    ("legend-mo",  "legend",     "06-传奇英雄监控",   "monitor",  7000),
    ("legend-re",  "legend",     "07-传奇卡研究",     "research", 7000),
]

WAIT_VIEW = 2.2       # 切栏目后等待渲染
WAIT_SUBTAB = 2.6     # 切子标签后等待 iframe 加载
WAIT_SCROLL = 0.45    # 每次滚动后等待重绘

EXPAND_JS = """
(async () => {
  const sec = document.querySelector('#view-__VIEW__');
  if (!sec) return JSON.stringify({err: 'no section'});
  const panels = Array.from(sec.querySelectorAll('.subpanel'));
  let ifr = null;
  if (panels.length) {
    const act = panels.find(p => p.classList.contains('active')) || panels[0];
    ifr = act.querySelector('iframe.panel-iframe');
  } else {
    ifr = sec.querySelector('iframe.panel-iframe');
  }
  if (!ifr) return JSON.stringify({err: 'no iframe'});
  if (!ifr.contentDocument) return JSON.stringify({err: 'iframe doc not ready'});
  const d = ifr.contentDocument;
  if (!d.head) return JSON.stringify({err: 'iframe head not ready'});
  const h = Math.max(d.documentElement.scrollHeight, d.body ? d.body.scrollHeight : 0);
  ifr.style.height = h + 'px';
  if (!d.getElementById('__shot_css')) {
    const st = d.createElement('style');
    st.id = '__shot_css';
    st.textContent = '*{position:static !important;overflow:visible !important;' +
                     'animation:none !important;transition:none !important}';
    d.head.appendChild(st);
  }
  await new Promise(r => setTimeout(r, 700));
  const sr = sec.getBoundingClientRect();
  return JSON.stringify({
    contentH: h,
    top: Math.round(sr.top + window.scrollY),
    bottom: Math.round(sr.top + window.scrollY + sr.height),
    left: Math.round(sr.left),
    width: Math.round(sr.width),
    dpr: devicePixelRatio,
    innerH: innerHeight,
    innerW: innerWidth,
    docH: document.documentElement.scrollHeight
  });
})()
"""

KILL_SMOOTH_JS = """
(() => {
  let st = document.getElementById('__shot_parent_css');
  if (!st) {
    st = document.createElement('style');
    st.id = '__shot_parent_css';
    st.textContent = 'html{scroll-behavior:auto !important}';
    document.head.appendChild(st);
  }
  return 'ok';
})()
"""


def api(method, path, body=None, timeout=180):
    url = PROXY + path
    data = body.encode("utf-8") if isinstance(body, str) else body
    req = urllib.request.Request(url, data=data, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read().decode("utf-8", "replace")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"raw": raw}


def ev(tid, js, timeout=180):
    res = api("POST", "/eval?target=%s" % tid, js, timeout)
    if "error" in res:
        raise RuntimeError("eval error: %s" % res["error"])
    return res.get("value")


def shot(tid, path, timeout=180):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    res = api("GET", "/screenshot?target=%s&file=%s" % (tid, urllib.parse.quote(path)), timeout=timeout)
    if not os.path.exists(path):
        raise RuntimeError("screenshot not saved: %s (%s)" % (path, res))
    return path


def open_site():
    res = api("POST", "/new", SITE, timeout=240)
    tid = res.get("targetId")
    if not tid:
        raise RuntimeError("无法新建标签页: %s" % res)
    return tid


def site_date(tid):
    title = ev(tid, "document.title")
    m = re.search(r"(\d{4}-\d{2}-\d{2})", title or "")
    return m.group(1) if m else time.strftime("%Y-%m-%d")


def trim_bottom(img, tol=8, pad=40):
    """裁掉底部连续纯色空白行。

    父页面 section 常被隐藏内容撑高（首页实测 107399px），整栏截取后尾部会拖一大片
    纯色空白，直接给剪映很难用。这里从底部往上找最后一行"有内容"的行。
    """
    import numpy as np
    g = np.asarray(img.convert("L")).astype(np.int16)
    row_range = g.max(axis=1) - g.min(axis=1)
    rows = np.nonzero(row_range > tol)[0]
    if len(rows) == 0:
        return img
    bottom = min(img.size[1], int(rows[-1]) + pad)
    if bottom >= img.size[1] - 4:
        return img
    return img.crop((0, 0, img.size[0], bottom))


def capture(tid, view, name, subid, max_h, outdir, tmpdir):
    ev(tid, KILL_SMOOTH_JS)
    ev(tid, 'document.querySelector(\'nav#nav button[data-view="%s"]\').click(); "ok"' % view)
    time.sleep(WAIT_VIEW)

    if subid:
        clicked = ev(
            tid,
            '(function(){var b=document.querySelector(\'#view-%s .subtab[data-subid="%s"]\');'
            'if(!b)return "missing";b.click();return "ok";})()' % (view, subid),
        )
        if clicked != "ok":
            return {"status": "missing_subtab", "subid": subid}
        time.sleep(WAIT_SUBTAB)

    info = json.loads(ev(tid, EXPAND_JS.replace("__VIEW__", view)))
    if "err" in info:
        return {"status": "error", "reason": info["err"]}

    dpr = info["dpr"]
    inner_h = info["innerH"]
    top, left, width = info["top"], info["left"], info["width"]
    # 截整栏（含父页面里的栏目标题），必要时限高
    content_h = min(info["bottom"] - top, max_h)
    end = top + content_h

    # 逐屏滚动截图（按实际 scrollY 记录，避免 smooth scroll / 边界 clamp 造成错位）
    tmp_shots = []
    y = 0
    guard = 0
    while y < end and guard < 40:
        actual = json.loads(ev(tid, "window.scrollTo(0,%d); JSON.stringify({y:window.scrollY})" % y))["y"]
        time.sleep(WAIT_SCROLL)
        p = os.path.join(tmpdir, "%s_%02d.png" % (name, len(tmp_shots)))
        shot(tid, p)
        tmp_shots.append((int(actual), p))
        if actual + inner_h >= end:
            break
        y += inner_h
        guard += 1

    # 若最后一屏没覆盖到 end，再补一屏贴底
    if tmp_shots and tmp_shots[-1][0] + inner_h < end:
        actual = json.loads(ev(tid, "window.scrollTo(0, 999999); JSON.stringify({y:window.scrollY})"))["y"]
        time.sleep(WAIT_SCROLL)
        p = os.path.join(tmpdir, "%s_last.png" % name)
        shot(tid, p)
        tmp_shots.append((int(actual), p))

    # 拼接（文档坐标 → 物理像素）
    first = Image.open(tmp_shots[0][1])
    canvas = Image.new("RGB", (first.size[0], int(info["docH"] * dpr)), (0, 0, 0))
    for actual, p in tmp_shots:
        canvas.paste(Image.open(p), (0, int(actual * dpr)))

    box = (int(left * dpr), int(top * dpr), int((left + width) * dpr), int(end * dpr))
    crop = trim_bottom(canvas.crop(box))
    out = os.path.join(outdir, "%s.png" % name)
    crop.save(out)

    # 1080 宽预览（给人和模型看，原图留给剪映）
    pw = 1080
    ph = int(crop.size[1] * pw / crop.size[0])
    pv = os.path.join(outdir, "preview")
    os.makedirs(pv, exist_ok=True)
    crop.resize((pw, ph), Image.LANCZOS).save(os.path.join(pv, "%s.png" % name))

    full_h = info["bottom"] - top
    return {
        "status": "ok",
        "file": os.path.relpath(out, PROJECT_ROOT),
        "preview": os.path.relpath(os.path.join(pv, "%s.png" % name), PROJECT_ROOT),
        "full_h": full_h,
        "captured_h": content_h,
        "truncated": full_h > max_h,
        "size": list(crop.size),
        "screens": len(tmp_shots),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", help="覆盖日期（默认从站点标题解析）")
    ap.add_argument("--only", help="只截指定 key，逗号分隔")
    ap.add_argument("--out", help="输出目录")
    args = ap.parse_args()

    try:
        api("GET", "/health", timeout=15)
    except Exception as e:
        print("浏览器通道不可用（CDP Proxy %s）: %s" % (PROXY, e), flush=True)
        print("请先运行: node ~/.workbuddy/skills/web-access/scripts/check-deps.mjs", flush=True)
        return 2

    only = set(args.only.split(",")) if args.only else None

    print("打开站点 %s" % SITE, flush=True)
    tid = open_site()
    date = args.date or site_date(tid)
    outdir = args.out or os.path.join(PROJECT_ROOT, "deliverables", "douyin", date, "shots")
    # 逐屏原图放系统临时区：不进项目目录，也避免脚本内批量删除
    tmpdir = os.path.join("/tmp/fc-shots", date)
    os.makedirs(tmpdir, exist_ok=True)
    # 输出目录必须先建好：capture() 是先把拼好的长图存进 outdir，preview/ 才在之后创建
    os.makedirs(outdir, exist_ok=True)
    print("日期 %s → %s" % (date, outdir), flush=True)

    manifest = {"date": date, "site": SITE, "capturedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "columns": {}}
    try:
        for key, view, name, subid, max_h in COLUMNS:
            if only and key not in only:
                continue
            print("· %s (%s) …" % (name, view), end="", flush=True)
            try:
                r = capture(tid, view, name, subid, max_h, outdir, tmpdir)
            except Exception as e:
                r = {"status": "error", "reason": str(e)}
            manifest["columns"][key] = r
            if r.get("status") == "ok":
                print(" ok  %dx%d（%d 屏%s）" % (r["size"][0], r["size"][1], r["screens"],
                                                "，已截断" if r["truncated"] else ""), flush=True)
            else:
                print(" %s %s" % (r.get("status"), r.get("reason", r.get("subid", ""))), flush=True)
    finally:
        try:
            api("GET", "/close?target=%s" % tid, timeout=20)
        except Exception:
            pass

    mpath = os.path.join(outdir, "manifest.json")
    with open(mpath, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    ok = sum(1 for c in manifest["columns"].values() if c.get("status") == "ok")
    print("\n完成：%d/%d 个栏目截图成功 → %s" % (ok, len(manifest["columns"]), mpath), flush=True)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
