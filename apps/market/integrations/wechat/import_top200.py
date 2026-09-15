#!/usr/bin/env python3
"""作用：把FC27 Top 200文章及原图上传到微信公众号草稿箱。

The script is resumable: uploaded image URLs and the permanent cover media id are
stored under .wechat_upload/state.json. It never publishes the resulting draft.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import io
import json
import os
import re
import sys
import uuid
import zipfile
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from PIL import Image
from docx import Document


ROOT = Path(__file__).resolve().parent
ENV_FILE = ROOT / ".env"
WORK_DIR = ROOT / "runtime"
IMAGE_DIR = WORK_DIR / "images_hq"
STATE_FILE = WORK_DIR / "state.json"
SOURCE_DOCX = ROOT / "source" / "original.docx"
TEXT_DOCX = ROOT / "source" / "article.docx"
MAX_IMAGE_BYTES = 950_000
MAX_ARTICLE_CHARS = 19_700
MAX_ARTICLES = 8


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in ENV_FILE.read_text(encoding="utf-8").splitlines():
        if "=" not in raw or raw.lstrip().startswith("#"):
            continue
        key, value = raw.split("=", 1)
        values[key.strip()] = value.strip()
    for key in ("WECHAT_APP_ID", "WECHAT_APP_SECRET"):
        if not values.get(key):
            raise RuntimeError(f"{key} is not configured in {ENV_FILE}")
    return values


def read_state() -> dict:
    if not STATE_FILE.exists():
        return {"image_urls": {}}
    return json.loads(STATE_FILE.read_text(encoding="utf-8"))


def write_state(state: dict) -> None:
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, STATE_FILE)


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
        raise RuntimeError(f"token error {data.get('errcode')}: {data.get('errmsg')}")
    return token


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


def compress_image(raw: bytes, destination: Path) -> None:
    with Image.open(io.BytesIO(raw)) as source:
        source.load()
        if source.mode not in ("RGB", "L"):
            background = Image.new("RGB", source.size, "white")
            if "A" in source.getbands():
                background.paste(source, mask=source.getchannel("A"))
            else:
                background.paste(source)
            image = background
        else:
            image = source.convert("RGB")
        # Preserve the source pixel dimensions. WeChat limits inline-image uploads
        # to less than 1 MB, so lower JPEG quality only when required.
        quality = 95
        while True:
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=quality, optimize=True, progressive=True)
            payload = buffer.getvalue()
            if len(payload) <= MAX_IMAGE_BYTES or quality <= 55:
                destination.write_bytes(payload)
                return
            quality -= 5


def prepare_images() -> list[Path]:
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    existing = sorted(IMAGE_DIR.glob("image[0-9][0-9][0-9].jpg"))
    if len(existing) == 148 and all(path.stat().st_size < 1_000_000 for path in existing):
        return existing
    if not SOURCE_DOCX.exists():
        raise RuntimeError(f"prepared images are incomplete and source document is unavailable: {SOURCE_DOCX}")
    with zipfile.ZipFile(SOURCE_DOCX) as archive:
        names = [name for name in archive.namelist() if name.startswith("word/media/image")]
        names.sort(key=lambda name: int(re.search(r"image(\d+)", name).group(1)))
        if len(names) != 148:
            raise RuntimeError(f"expected 148 source images, found {len(names)}")
        outputs = []
        for index, name in enumerate(names, 1):
            destination = IMAGE_DIR / f"image{index:03d}.jpg"
            if not destination.exists() or destination.stat().st_size >= 1_000_000:
                compress_image(archive.read(name), destination)
            outputs.append(destination)
    return outputs


def parse_document() -> tuple[list[str], list[tuple[str, list[str]]]]:
    document = Document(TEXT_DOCX)
    paragraphs = [(p.style.name, p.text.strip()) for p in document.paragraphs if p.text.strip()]
    intro: list[str] = []
    players: list[tuple[str, list[str]]] = []
    heading = None
    body: list[str] = []
    for style, text in paragraphs:
        if style == "Heading 1":
            if heading is not None:
                players.append((heading, body))
            heading, body = text, []
        elif heading is None:
            intro.append(text)
        else:
            body.append(text)
    if heading is not None:
        players.append((heading, body))
    if len(players) != 148:
        raise RuntimeError(f"expected 148 player sections, found {len(players)}")
    return intro, players


def upload_inline_image(token: str, path: Path) -> str:
    data = post_file("https://api.weixin.qq.com/cgi-bin/media/uploadimg", token, path)
    if not data.get("url"):
        raise RuntimeError(f"uploadimg error {data.get('errcode')}: {data.get('errmsg')}")
    return data["url"]


def upload_cover(token: str, path: Path) -> str:
    data = post_file(
        "https://api.weixin.qq.com/cgi-bin/material/add_material",
        token,
        path,
        {"type": "image"},
    )
    if not data.get("media_id"):
        raise RuntimeError(f"cover error {data.get('errcode')}: {data.get('errmsg')}")
    return data["media_id"]


def esc(text: str) -> str:
    return html.escape(text, quote=False)


def paragraph_html(text: str) -> str:
    if text.startswith("【图片"):
        return ""
    if text.startswith("FC27 预测"):
        return f'<p style="color:#ff2d6f;font-weight:bold">{esc(text)}</p>'
    if text == "FC26 开服首月价格走势":
        return f'<p style="font-weight:bold">{esc(text)}</p>'
    if text.startswith("▲ "):
        return f'<p style="color:#888;font-size:12px;text-align:center">{esc(text[2:])}</p>'
    if text.startswith("⏳ 建议"):
        text = text.replace("⏳ 建议：观望：观望。", "建议：观望。")
        return f'<p style="color:#ff2d6f;font-weight:bold;background:#242424;padding:10px">{esc(text)}</p>'
    if text.startswith("市场价格："):
        return ""
    if text == "阶段  ｜  价格  ｜  涨跌":
        return f'<p style="color:#999;font-size:13px">{esc(text)}</p>'
    return f"<p>{esc(text)}</p>"


def player_html(number: int, heading: str, body: list[str], image_url: str) -> str:
    content = []
    inserted = False
    for text in body:
        if text.startswith("【图片"):
            content.append(
                f'<p><img src="{html.escape(image_url, quote=True)}" '
                'style="width:100%;height:auto"/></p>'
            )
            inserted = True
        else:
            content.append(paragraph_html(text))
    if not inserted:
        raise RuntimeError(f"missing image placeholder in section {number}")
    return (
        '<section style="font-size:15px;line-height:1.8;color:#d8d8d8;margin-bottom:34px">'
        f'<h2 style="font-size:20px;color:#a0a0a0">— {esc(heading)}</h2>'
        + "".join(content)
        + "</section>"
    )


def intro_html(intro: list[str]) -> str:
    parts = [
        '<section style="font-size:15px;line-height:1.9;color:#d8d8d8;margin:0 0 30px">',
        '<h1 style="font-size:24px;line-height:1.4;color:#a0a0a0">— FC27 开服金卡价格预测</h1>',
        '<p style="font-size:18px;line-height:1.8;color:#ff2d6f;font-weight:bold">148 张金卡逐张拆解：什么价能买、什么时候最容易被套、哪些卡值得重点盯。</p>',
    ]
    for i, text in enumerate(intro[1:], 1):
        if text == "阅读说明":
            parts.append('<p style="font-weight:bold;color:#ff2d6f">阅读说明</p>')
        elif i == 1:
            parts.append(f'<p style="color:#999">{esc(text)}</p>')
        else:
            parts.append(f"<p>{esc(text)}</p>")
    parts.append("</section>")
    return "".join(parts)


def build_articles(intro: list[str], players: list[tuple[str, list[str]]], urls: dict[str, str]) -> list[dict]:
    blocks = []
    for index, (heading, body) in enumerate(players, 1):
        key = f"image{index:03d}.jpg"
        if key not in urls:
            raise RuntimeError(f"missing uploaded URL for {key}")
        blocks.append(player_html(index, heading, body, urls[key]))

    chunks: list[str] = []
    current = intro_html(intro)
    for block in blocks:
        if len(current) + len(block) > MAX_ARTICLE_CHARS and current:
            chunks.append('<section style="background:#171717;padding:20px 16px">' + current + "</section>")
            current = block
        else:
            current += block
    if current:
        chunks.append('<section style="background:#171717;padding:20px 16px">' + current + "</section>")
    if len(chunks) > MAX_ARTICLES:
        raise RuntimeError(f"generated {len(chunks)} articles; API maximum is {MAX_ARTICLES}")

    articles = []
    total = len(chunks)
    for index, content in enumerate(chunks, 1):
        title = "FC27开服金卡怎么买？148张价格全拆" if index == 1 else f"FC27金卡价格地图 {index}/{total}"
        articles.append({"title": title, "content": content, "chars": len(content)})
    return articles


def create_draft(token: str, cover_media_id: str, articles: list[dict]) -> str:
    payload = {"articles": []}
    for item in articles:
        payload["articles"].append(
            {
                "article_type": "news",
                "title": item["title"],
                "author": "朝阳吴彦祖",
                "digest": "",
                "content": item["content"],
                "content_source_url": "",
                "thumb_media_id": cover_media_id,
                "need_open_comment": 0,
                "only_fans_can_comment": 0,
                "show_cover_pic": 0,
            }
        )
    data = post_json(
        "https://api.weixin.qq.com/cgi-bin/draft/add",
        payload,
        {"access_token": token},
    )
    if not data.get("media_id"):
        raise RuntimeError(f"draft error {data.get('errcode')}: {data.get('errmsg')}")
    return data["media_id"]


def update_draft(token: str, draft_media_id: str, cover_media_id: str, articles: list[dict]) -> None:
    for index, item in enumerate(articles):
        article = {
            "article_type": "news",
            "title": item["title"],
            "author": "朝阳吴彦祖",
            "digest": "",
            "content": item["content"],
            "content_source_url": "",
            "thumb_media_id": cover_media_id,
            "need_open_comment": 0,
            "only_fans_can_comment": 0,
            "show_cover_pic": 0,
        }
        data = post_json(
            "https://api.weixin.qq.com/cgi-bin/draft/update",
            {"media_id": draft_media_id, "index": index, "articles": article},
            {"access_token": token},
        )
        if data.get("errcode") != 0:
            raise RuntimeError(f"draft update {index} error {data.get('errcode')}: {data.get('errmsg')}")
        print(f"UPDATED {index + 1}/{len(articles)}", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--update-existing", action="store_true")
    parser.add_argument("--lead-image", type=Path)
    args = parser.parse_args()

    cfg = load_env()
    images = prepare_images()
    intro, players = parse_document()
    print(f"PREPARED images={len(images)} players={len(players)}", flush=True)
    print(
        f"IMAGE_BYTES min={min(p.stat().st_size for p in images)} "
        f"max={max(p.stat().st_size for p in images)}",
        flush=True,
    )
    if args.prepare_only:
        return 0

    token = get_token(cfg)
    state = read_state()
    urls = state.setdefault("image_urls_hq", {})
    for index, path in enumerate(images, 1):
        if path.name not in urls:
            urls[path.name] = upload_inline_image(token, path)
            write_state(state)
        print(f"IMAGE {index}/148", flush=True)

    if not state.get("cover_media_id"):
        state["cover_media_id"] = upload_cover(token, images[0])
        write_state(state)
    print("COVER uploaded", flush=True)

    articles = build_articles(intro, players, urls)
    if args.lead_image:
        source = args.lead_image.expanduser().resolve()
        if not source.exists():
            raise RuntimeError(f"lead image not found: {source}")
        source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
        lead_path = WORK_DIR / "lead-image.jpg"
        if state.get("lead_image_sha256") != source_hash or not state.get("lead_image_url"):
            compress_image(source.read_bytes(), lead_path)
            state["lead_image_url"] = upload_inline_image(token, lead_path)
            state["lead_image_sha256"] = source_hash
            write_state(state)
        lead = (
            '<section style="background:#171717;padding:0 0 18px">'
            f'<img src="{html.escape(state["lead_image_url"], quote=True)}" '
            'style="width:100%;height:auto"/></section>'
        )
        articles[0]["content"] = lead + articles[0]["content"]
        articles[0]["chars"] = len(articles[0]["content"])
        print(f"LEAD_IMAGE bytes={lead_path.stat().st_size}", flush=True)
    for index, item in enumerate(articles, 1):
        print(f"ARTICLE {index}/{len(articles)} chars={item['chars']}", flush=True)
    manifest = {"articles": [{"title": a["title"], "chars": a["chars"]} for a in articles]}
    (WORK_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    if args.update_existing:
        if not state.get("draft_media_id"):
            raise RuntimeError("no existing draft media id in state")
        update_draft(token, state["draft_media_id"], state["cover_media_id"], articles)
        print("DRAFT updated", flush=True)
        return 0
    if state.get("draft_media_id"):
        print("DRAFT already created; use --update-existing", flush=True)
        return 0
    state["draft_media_id"] = create_draft(token, state["cover_media_id"], articles)
    write_state(state)
    print("DRAFT created", flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR {exc}", file=sys.stderr, flush=True)
        raise
