#!/bin/bash
# 作用：本轮 news 重跑的第 1 步（DOM 时间线抽取）。
# 输入：apps/news/sources.txt 中的账号主页 URL、apps/news/extract-timeline.js。
# 主要输出：automation/runs/2026-09-16/news/work/dom/<handle>.json（抽到的推文 JSON）与 opened.tsv（打开时间台账）。
set -u
cd /Users/wuyanzu/Desktop/FC
PROXY=http://localhost:3456
WORK=automation/runs/2026-09-16/news/work
mkdir -p "$WORK/dom"
: > "$WORK/opened.tsv"

EXTRACT="$WORK/extract-body.js"
# 去掉文件开头的注释块，只保留可求值表达式
sed '1,10d' apps/news/extract-timeline.js > "$EXTRACT"

n=0
while read -r url; do
  [ -z "$url" ] && continue
  handle=$(basename "$url")
  n=$((n+1))
  resp=$(curl -s -X POST --data-raw "$url" "$PROXY/new")
  tid=$(echo "$resp" | sed -n 's/.*"targetId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  if [ -z "$tid" ]; then
    echo "FAIL new $handle $resp" >&2
    printf '%s\t%s\t%s\tFAIL_NEW\n' "$handle" "$url" "" >> "$WORK/opened.tsv"
    continue
  fi
  opened=$(date +%Y-%m-%dT%H:%M:%S%z | sed 's/\(..\)$/:\1/')
  sleep 5
  out=$(curl -s -X POST "$PROXY/eval?target=$tid" --data-binary "@$EXTRACT")
  count=$(printf '%s' "$out" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const v=JSON.parse(JSON.parse(s).value);console.log(v.count)}catch(e){console.log(-1)}})")
  if [ "$count" = "0" ] || [ "$count" = "-1" ]; then
    sleep 5
    out=$(curl -s -X POST "$PROXY/eval?target=$tid" --data-binary "@$EXTRACT")
    count=$(printf '%s' "$out" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const v=JSON.parse(JSON.parse(s).value);console.log(v.count)}catch(e){console.log(-1)}})")
  fi
  printf '%s' "$out" > "$WORK/dom/$handle.raw"
  printf '%s' "$out" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const f=process.argv[1];try{const v=JSON.parse(JSON.parse(s).value);require('fs').writeFileSync(f,JSON.stringify(v,null,2))}catch(e){require('fs').writeFileSync(f,JSON.stringify({count:0,tweets:[],error:String(e).slice(0,200)}))}})" "$WORK/dom/$handle.json"
  printf '%s\t%s\t%s\t%s\n' "$handle" "$url" "$opened" "$count" >> "$WORK/opened.tsv"
  echo "[$n] $handle count=$count"
  curl -s "$PROXY/close?target=$tid" > /dev/null
done < <(grep -o 'https://x.com/[^[:space:]]*' apps/news/sources.txt)
echo "DONE accounts=$n"
