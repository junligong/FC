#!/usr/bin/env python3
# 作用：用 ima 返回的临时 COS 凭证，把本地 Markdown 文档 PUT 上传到 ima-media 存储桶。
# 输入：命令行参数 <本地文件路径> <凭证JSON路径>；凭证 JSON 含 cos_key/secret_id/secret_key/token/bucket/region。
# 主要输出：HTTP 状态码（200 表示上传成功，可继续调用 add_knowledge 入库）。
import hashlib
import hmac
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


def hmac_sha1(key: bytes, msg: str) -> str:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha1).hexdigest()


def main() -> int:
    local_path, credential_path = sys.argv[1:3]
    with open(credential_path, "rb") as fh:
        credential = json.load(fh)
    with open(local_path, "rb") as fh:
        body = fh.read()

    cos_key = credential["cos_key"]
    secret_id = credential["secret_id"]
    secret_key = credential["secret_key"]
    token = credential["token"]
    bucket = credential["bucket_name"]
    region = credential["region"]

    host = f"{bucket}.cos.{region}.myqcloud.com"
    uri_path = "/" + cos_key
    now = int(time.time())
    key_time = f"{now};{now + 3600}"

    sign_key = hmac_sha1(secret_key.encode("utf-8"), key_time)
    header_list = "content-type;host"
    header_string = (
        "content-type=" + urllib.parse.quote("text/markdown", safe="")
        + "&host=" + urllib.parse.quote(host, safe="")
    )
    http_string = "put\n" + uri_path + "\n\n" + header_string + "\n"
    string_to_sign = "sha1\n" + key_time + "\n" + hashlib.sha1(http_string.encode("utf-8")).hexdigest() + "\n"
    signature = hmac_sha1(sign_key.encode("utf-8"), string_to_sign)

    authorization = (
        "q-sign-algorithm=sha1"
        f"&q-ak={secret_id}"
        f"&q-sign-time={key_time}"
        f"&q-key-time={key_time}"
        f"&q-header-list={header_list}"
        "&q-url-param-list="
        f"&q-signature={signature}"
    )

    request = urllib.request.Request(
        f"https://{host}{uri_path}",
        data=body,
        method="PUT",
        headers={
            "Authorization": authorization,
            "x-cos-security-token": token,
            "Content-Type": "text/markdown",
            "Content-Length": str(len(body)),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            print(f"{local_path} -> HTTP {response.status}")
            return 0
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:500]
        print(f"{local_path} -> HTTP {error.code}: {detail}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
