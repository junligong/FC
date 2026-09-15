#!/bin/bash
# 作用：为资讯采集配置 DuMate 浏览器命令行环境，复用登录态且不复制凭据。
FC_DUMATE_NODE_BIN="$HOME/Library/Application Support/qianfan-desktop-app/lightsandbox/node/bin"
if [ -x /opt/homebrew/bin/dumate-browser-cli ]; then
  export PATH="/opt/homebrew/bin:$FC_DUMATE_NODE_BIN:$PATH"
fi
if ! command -v dumate-browser-cli >/dev/null; then
  echo 'ERROR: 缺少 dumate-browser-cli，请按 DuMate 安装说明安装。' >&2
  return 1
fi
FC_BROWSER_VERSION="$(dumate-browser-cli --version)" || return 1
if ! node -e 'const v=process.argv[1].trim().split(".").map(Number);process.exit(v.length===3 && v.every(Number.isInteger) && (v[0]>0 || v[1]>2 || (v[1]===2 && v[2]>=6)) ? 0 : 1)' "$FC_BROWSER_VERSION"; then
  echo 'ERROR: 浏览器工具需 0.2.6 或更新版本；旧版无法携带连接认证。' >&2
  return 1
fi
# DuMate supplies XDG_DATA_HOME to scheduled tasks. Keep that account context.
# Interactive shells may lack it; choose only an unambiguous existing DuMate context.
if [ -z "${XDG_DATA_HOME:-}" ]; then
  FC_BROWSER_CONTEXTS=()
  for FC_BROWSER_CANDIDATE in "$HOME/Library/Application Support/qianfan-desktop-app/qianfan_desk_xdg/"*/data; do
    [ ! -f "$FC_BROWSER_CANDIDATE/dumate-browser/.browser-extension-relay-token" ] || FC_BROWSER_CONTEXTS+=("$FC_BROWSER_CANDIDATE")
  done
  if [ "${#FC_BROWSER_CONTEXTS[@]}" -ne 1 ]; then
    echo 'ERROR: 无法唯一确定 DuMate 认证上下文，请在 DuMate 任务内执行。' >&2
    return 1
  fi
  export XDG_DATA_HOME="${FC_BROWSER_CONTEXTS[0]}"
fi
if [ ! -r "$XDG_DATA_HOME/dumate-browser/.browser-extension-relay-token" ]; then
  echo 'ERROR: DuMate 本地连接凭据不可读，请重新打开 DuMate 后重试。' >&2
  return 1
fi
unset FC_DUMATE_NODE_BIN FC_BROWSER_VERSION FC_BROWSER_CONTEXTS FC_BROWSER_CANDIDATE
