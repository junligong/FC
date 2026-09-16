#!/usr/bin/env python3
# 作用：把一批本地文件按 ima create_media 返回的临时 COS 凭证上传到 ima 媒体存储。
# 输入：argv[1]=批次文件（含 local/name/ext/content_type/size），argv[2]=凭证文件（含 name/media_id/cos_key/secret_id/secret_key/token/bucket_name/region）。
# 主要输出：标准输出的逐条上传结果（HTTP 200 为成功）；成功后仍需调用 add_knowledge 才算入库。
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


def put_object(entry: dict, credential: dict) -> str:
    with open(entry["local"], "rb") as handle:
        body = handle.read()

    host = f"{credential['bucket_name']}.cos.{credential['region']}.myqcloud.com"
    uri_path = "/" + credential["cos_key"]
    now = int(time.time())
    key_time = f"{now};{now + 3600}"
    content_type = entry["content_type"]

    sign_key = hmac_sha1(credential["secret_key"].encode("utf-8"), key_time)
    header_list = "content-type;host"
    header_string = (
        "content-type=" + urllib.parse.quote(content_type, safe="")
        + "&host=" + urllib.parse.quote(host, safe="")
    )
    http_string = "put\n" + uri_path + "\n\n" + header_string + "\n"
    string_to_sign = "sha1\n" + key_time + "\n" + hashlib.sha1(http_string.encode("utf-8")).hexdigest() + "\n"
    signature = hmac_sha1(sign_key.encode("utf-8"), string_to_sign)

    authorization = (
        "q-sign-algorithm=sha1"
        f"&q-ak={credential['secret_id']}"
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
            "x-cos-security-token": credential["token"],
            "Content-Type": content_type,
            "Content-Length": str(len(body)),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            return f"HTTP {response.status}"
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:300]
        return f"HTTP {error.code}: {detail}"
    except Exception as error:  # noqa: BLE001
        return f"ERROR: {error}"


def main() -> int:
    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        batch = json.load(handle)
    with open(sys.argv[2], "r", encoding="utf-8") as handle:
        credentials = {item["name"]: item for item in json.load(handle)}

    failures = 0
    for entry in batch:
        credential = credentials.get(entry["name"])
        if not credential:
            print(f"MISSING CREDENTIAL: {entry['name']}")
            failures += 1
            continue
        result = put_object(entry, credential)
        status = "OK" if result == "HTTP 200" else "FAIL"
        if status == "FAIL":
            failures += 1
        print(f"{status} {entry['name']} {entry['size']}B -> {result}")
    print(f"uploaded={len(batch) - failures} failed={failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
