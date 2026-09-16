#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""作用：把一篇公众号 HTML 正文（含图片）发布到微信公众号。

流程：读取 .env 凭证 → 稳定 token → 上传正文内嵌图（uploadimg 得到微信 CDN URL）、
上传封面为永久素材（add_material）→ 创建草稿（draft/add）→ 发布（freepublish/submit）。

输入：
  --html   正文 HTML 文件（gzh-design 产出的 <section> 片段），图片用本地路径占位 __IMG__xxx
  --title  文章标题
  --images 可选：JSON 文件，{"占位名": "本地图片路径"}，上传后把占位替换为微信 URL
  --cover  可选：封面图本地路径（默认取第一张正文图）
  --dry-run  只打印计划，不调用微信接口
  --no-publish  只创建草稿，不发布
输出：草稿 media_id、发布 publish_id（发布时为任务 id）
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
ENV_FILE = ROOT / ".env"


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in ENV_FILE.read_text(encoding="utf-8").splitlines():
        if "=" not in raw or raw.lstrip().startswith("#"):
            continue
        key, value = raw.split("=", 1)
        values[key.strip()] = value.strip()
    for key in ("WECHAT_APP_ID", "WECHAT_APP_SECRET"):
        if not values.get(key):
            raise RuntimeError(f"{key} 未在 {ENV_FILE} 配置")
    return values


def post_json(url: str, payload: dict, params: dict | None = None, timeout: int = 90) -> dict:
    if params:
        url += "?" + urlencode(params)
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(url, data=body, headers={"Content-Type": "application/json"})
    return json.loads(urlopen(request, timeout=timeout).read())


def post_file(url: str, token: str, path: Path, extra_params: dict | None = None) -> dict:
    params = {"access_token": token}
    if extra_params:
        params.update(extra_params)
    boundary = "----CodexWechat" + uuid.uuid4().hex
    payload = path.read_bytes()
    head = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="media"; filename="{path.name}"\r\n'
        "Content-Type: image/jpeg\r\n\r\n"
    ).encode("utf-8")
    body = head + payload + f"\r\n--{boundary}--\r\n".encode("ascii")
    request = Request(
        url + "?" + urlencode(params),
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    return json.loads(urlopen(request, timeout=60).read())


def get_token(cfg: dict[str, str]) -> str:
    data = post_json(
        "https://api.weixin.qq.com/cgi-bin/stable_token",
        {
            "grant_type": "client_credential",
            "appid": cfg["WECHAT_APP_ID"],
            "secret": cfg["WECHAT_APP_SECRET"],
            "force_refresh": False,
        },
    )
    token = data.get("access_token")
    if not token:
        raise RuntimeError(f"token 获取失败 {data.get('errcode')}: {data.get('errmsg')}")
    return token


def upload_inline_image(token: str, path: Path) -> str:
    """上传图文消息内的图片，返回可外链的微信 URL（不占用素材库配额）。"""
    data = post_file("https://api.weixin.qq.com/cgi-bin/media/uploadimg", token, path)
    if not data.get("url"):
        raise RuntimeError(f"uploadimg 失败 {data.get('errcode')}: {data.get('errmsg')}")
    return data["url"]


def upload_cover(token: str, path: Path) -> str:
    """上传永久图片素材作为封面，返回 thumb_media_id。"""
    data = post_file(
        "https://api.weixin.qq.com/cgi-bin/material/add_material",
        token,
        path,
        {"type": "image"},
    )
    if not data.get("media_id"):
        raise RuntimeError(f"封面素材上传失败 {data.get('errcode')}: {data.get('errmsg')}")
    return data["media_id"]


def create_draft(token: str, cover_media_id: str, title: str, content: str, author: str, digest: str) -> str:
    payload = {
        "articles": [
            {
                "article_type": "news",
                "title": title,
                "author": author,
                "digest": digest,
                "content": content,
                "content_source_url": "",
                "thumb_media_id": cover_media_id,
                "need_open_comment": 0,
                "only_fans_can_comment": 0,
                "show_cover_pic": 0,
            }
        ]
    }
    data = post_json("https://api.weixin.qq.com/cgi-bin/draft/add", payload, {"access_token": token})
    if not data.get("media_id"):
        raise RuntimeError(f"草稿创建失败 {data.get('errcode')}: {data.get('errmsg')}")
    return data["media_id"]


def publish_draft(token: str, draft_media_id: str) -> str:
    """发布草稿（freepublish），返回 publish_id。"""
    data = post_json(
        "https://api.weixin.qq.com/cgi-bin/freepublish/submit",
        {"media_id": draft_media_id},
        {"access_token": token},
    )
    if data.get("errcode") != 0:
        raise RuntimeError(f"发布失败 {data.get('errcode')}: {data.get('errmsg')}")
    return data.get("publish_id", "")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--html", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--author", default="朝阳吴彦祖")
    parser.add_argument("--digest", default="")
    parser.add_argument("--images", help="JSON: {占位名: 本地路径}")
    parser.add_argument("--cover", help="封面图本地路径")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-publish", action="store_true")
    args = parser.parse_args()

    html = Path(args.html).read_text(encoding="utf-8")
    images: dict[str, str] = {}
    if args.images:
        images = json.loads(Path(args.images).read_text(encoding="utf-8"))

    print(f"HTML 长度={len(html)} 图片占位={len(images)}", flush=True)

    if args.dry_run:
        for key, path in images.items():
            print(f"  [dry] 将上传 {key} <- {path}", flush=True)
        print("  [dry] 跳过微信接口调用", flush=True)
        return 0

    cfg = load_env()
    token = get_token(cfg)
    print("token OK", flush=True)

    # 上传正文内嵌图并替换占位
    for key, path in images.items():
        url = upload_inline_image(token, Path(path))
        html = html.replace(key, url)
        print(f"  上传 {key} -> {url[:60]}...", flush=True)

    # 封面：优先显式指定，否则用第一张正文图
    cover_path = Path(args.cover) if args.cover else (Path(next(iter(images.values()))) if images else None)
    if cover_path is None:
        raise RuntimeError("缺少封面图")
    cover_media_id = upload_cover(token, cover_path)
    print(f"封面素材 OK media_id={cover_media_id[:20]}...", flush=True)

    draft_id = create_draft(token, cover_media_id, args.title, html, args.author, args.digest)
    print(f"DRAFT_CREATED media_id={draft_id}", flush=True)

    if args.no_publish:
        print("已跳过发布（--no-publish）", flush=True)
        return 0

    publish_id = publish_draft(token, draft_id)
    print(f"PUBLISHED publish_id={publish_id}", flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR {exc}", file=sys.stderr, flush=True)
        raise
