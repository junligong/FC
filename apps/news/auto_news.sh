#!/bin/bash
# FC27 每日资讯自动化任务
# 功能：从指定信息源列表（X.com博主）逐个访问主页采集最新24h推文，
#       过滤FC27相关内容，按内容去重，翻译为中文，生成图文 HTML 报告
# 执行时间：每天凌晨 3:00 (Asia/Shanghai)
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$PROJECT_DIR/../../automation/browser-env.sh"
export FC_REPORT_DATE="${FC_REPORT_DATE:-$(TZ=Asia/Shanghai date +%F)}"
for dependency in node python3 dumate-browser-cli; do
  command -v "$dependency" >/dev/null || { echo "ERROR: 缺少依赖 $dependency"; exit 1; }
done
node --input-type=module -e 'const m = await import(process.argv[1]); m.reportDate(process.env.FC_REPORT_DATE);' "$PROJECT_DIR/../../shared/lib/runtime.mjs"
LOCK_DIR="$PROJECT_DIR/.news.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "ERROR: 新闻任务已有运行或遗留锁，请先确认进程状态: $LOCK_DIR"; exit 1
fi
printf "%s\n" "$$" > "$LOCK_DIR/pid"
trap 'rm -f "$LOCK_DIR/pid"; rmdir "$LOCK_DIR"' EXIT
DATA_DIR="$PROJECT_DIR/data"
PROJECT_ROOT="${FC_PROJECT_ROOT:-$(cd "$PROJECT_DIR/../.." && pwd)}"
REPORTS_DIR="$PROJECT_ROOT/reports/daily/$FC_REPORT_DATE"
WORK_ROOT="$PROJECT_ROOT/automation/runs/$FC_REPORT_DATE/news/work"
SEEN_FILE="$DATA_DIR/seen_tweets.json"
RAW_FILE="$DATA_DIR/raw_tweets_latest.json"
FILTERED_FILE="$DATA_DIR/filtered_tweets.json"
SOURCES_FILE="$PROJECT_DIR/sources.txt"

mkdir -p "$DATA_DIR" "$REPORTS_DIR" "$WORK_ROOT"

# 初始化 seen_tweets.json（首次执行）
if [ ! -f "$SEEN_FILE" ]; then
  echo '{"tweets": [], "last_updated": null, "version": "1.0"}' > "$SEEN_FILE"
fi

# 清空原始数据文件；失败恢复副本只保留在本轮工作目录，成功后删除。
RAW_BACKUP="$WORK_ROOT/raw_tweets_latest.json.bak"
[ ! -f "$RAW_FILE" ] || cp "$RAW_FILE" "$RAW_BACKUP"
> "$RAW_FILE"

echo "=== FC27 资讯自动化任务开始 ==="
echo "时间: $(date '+%Y-%m-%d %H:%M:%S')"

# 检查信息源列表文件
if [ ! -f "$SOURCES_FILE" ]; then
  echo "ERROR: 信息源列表文件不存在: $SOURCES_FILE"
  exit 1
fi

# 解析信息源列表，提取 handle
HANDLES=()
while IFS= read -r line; do
  line=$(echo "$line" | tr -d '\r')
  [ -z "$(echo "$line" | tr -d '[:space:]')" ] && continue
  url=$(echo "$line" | grep -o 'https://[^[:space:]]*' | head -1 || true)
  [ -z "$url" ] && continue
  handle=$(echo "$url" | sed 's|.*/||')
  [ -n "$handle" ] && HANDLES+=("$handle")
done < "$SOURCES_FILE"

HANDLE_COUNT=${#HANDLES[@]}
echo "  信息源数量: $HANDLE_COUNT"
echo "  信息源: ${HANDLES[*]}"

if [ "$HANDLE_COUNT" -eq 0 ]; then
  echo "ERROR: 信息源列表为空，任务终止"
  exit 1
fi

# ========== 第1步：浏览器自动化采集推文 ==========
echo "[1/5] 连接浏览器扩展，从 $HANDLE_COUNT 个信息源采集最新24h推文..."

# 初始化浏览器扩展模式（防风控）
dumate-browser-cli init --mode=extension 2>&1 || {
  echo "ERROR: 浏览器扩展连接失败，任务终止"
  exit 1
}

# 推文提取 JS（含24h时间过滤）
EXTRACT_JS='(function(){
  var tweets = [];
  var articles = document.querySelectorAll("article");
  var seen = {};
  var now = Date.now();
  var cutoff = now - 24 * 60 * 60 * 1000;
  for (var i = 0; i < articles.length; i++) {
    var article = articles[i];
    var textEl = article.querySelector("[data-testid=\"tweetText\"]");
    var text = textEl ? textEl.innerText.trim() : "";
    var textEl2 = article.querySelector("[data-testid=\"tweetText\"]");
    if (!text && textEl2) text = textEl2.innerText.trim();
    var linkEls = article.querySelectorAll("a[href*=\"/status/\"]");
    var tweetUrl = "";
    var authorHandle = "";
    for (var j = 0; j < linkEls.length; j++) {
      var href = linkEls[j].getAttribute("href") || "";
      var m = href.match(/^\/([^\/]+)\/status\/(\d+)/);
      if (m && href.indexOf("/analytics") === -1) {
        authorHandle = m[1];
        tweetUrl = "https://x.com" + href;
        break;
      }
    }
    var nameEl = article.querySelector("a[role=\"link\"] span") || article.querySelector("[data-testid=\"UserCell\"] a span");
    var author = nameEl ? nameEl.innerText.trim() : "";
    var timeEl = article.querySelector("time");
    var timestamp = timeEl ? timeEl.getAttribute("datetime") : "";
    var timeText = timeEl ? timeEl.innerText : "";
    if (!timestamp) continue;
    if (timestamp) {
      var ts = new Date(timestamp).getTime();
      if (isNaN(ts) || ts < cutoff || ts > now) continue;
    }
    var imgEls = article.querySelectorAll("img[src*=\"pbs.twimg.com/media\"]");
    var images = [];
    for (var k = 0; k < imgEls.length; k++) {
      var src = imgEls[k].getAttribute("src") || "";
      if (src) images.push(src);
    }
    var videoEl = article.querySelector("video, [data-testid=\"videoPlayer\"], [data-testid=\"videoComponent\"], [data-testid=\"AnimatedGIF\"]");
    if (videoEl) continue;
    var tweetId = "";
    var idMatch = tweetUrl.match(/status\/(\d+)/);
    if (idMatch) tweetId = idMatch[1];
    if (!tweetId || seen[tweetId]) continue;
    seen[tweetId] = true;
    tweets.push({
      id: tweetId, text: text, author: author, handle: authorHandle,
      url: tweetUrl, timestamp: timestamp, timeText: timeText, images: images
    });
  }
  return JSON.stringify({count: tweets.length, tweets: tweets});
})()'

# 逐个访问博主主页采集推文
FIRST=true
ACCOUNT_IDX=0
for handle in "${HANDLES[@]}"; do
  ACCOUNT_IDX=$((ACCOUNT_IDX + 1))
  echo "  [$ACCOUNT_IDX/$HANDLE_COUNT] @$handle 采集中..."

  dumate-browser-cli open "https://x.com/$handle" 2>&1
  dumate-browser-cli sleep 4 2>&1

  if [ "$FIRST" = true ]; then
    # 首次访问处理弹窗
    dumate-browser-cli dialog-dismiss 2>&1 || true
    dumate-browser-cli sleep 1 2>&1
    # 页面级覆盖 Notification API
    dumate-browser-cli eval '(function(){ try { Object.defineProperty(Notification, "permission", { value: "denied", writable: false, configurable: true }); Notification.requestPermission = function() { return Promise.resolve("denied"); }; if (navigator.permissions && navigator.permissions.query) { var origQuery = navigator.permissions.query.bind(navigator.permissions); navigator.permissions.query = function(desc) { if (desc && desc.name === "notifications") { return Promise.resolve({ state: "denied", onchange: null, addEventListener: function(){}, removeEventListener: function(){} }); } return origQuery(desc); }; } return "notif-overridden: " + Notification.permission; } catch(e) { return "notif-override-err: " + e.message; } })()' --timeout 8000 2>&1 || true
    dumate-browser-cli sleep 1 2>&1
    # 关闭各类 HTML 弹窗
    dumate-browser-cli eval '(function(){ var dismissed = 0; var selectors = ["[data-testid=\"confirmationSheetDialog\"] button", "[data-testid=\"bottomBar\"] button", "[data-testid=\"toast\"] button", "[role=\"dialog\"] button", "[aria-label*=\"Close\"]", "[aria-label*=\"关闭\"]", "[aria-label*=\"Reject\"]", "[aria-label*=\"Refuse\"]", "[aria-label*=\"Block\"]", "[aria-label*=\"Not now\"]", "[aria-label*=\"Don\"]"]; for (var s = 0; s < selectors.length; s++) { var btns = document.querySelectorAll(selectors[s]); for (var i = 0; i < btns.length; i++) { try { var txt = (btns[i].textContent || "").toLowerCase(); var al = (btns[i].getAttribute("aria-label") || "").toLowerCase(); if (txt.indexOf("block") >= 0 || txt.indexOf("reject") >= 0 || txt.indexOf("refuse") >= 0 || txt.indexOf("close") >= 0 || txt.indexOf("not now") >= 0 || txt.indexOf("don") >= 0 || txt.indexOf("拒绝") >= 0 || txt.indexOf("关闭") >= 0 || txt.indexOf("屏蔽") >= 0 || al.indexOf("close") >= 0 || al.indexOf("block") >= 0) { btns[i].click(); dismissed++; } } catch(e){} } } return "dismissed: " + dismissed; })()' --timeout 8000 2>&1 || true
    dumate-browser-cli sleep 2 2>&1
    dumate-browser-cli eval '(function(){ var dismissed = 0; var allBtns = document.querySelectorAll("button, [role=\"button\"]"); for (var i = 0; i < allBtns.length; i++) { try { var al = (allBtns[i].getAttribute("aria-label") || "").toLowerCase(); if (al.indexOf("close") >= 0 || al.indexOf("关闭") >= 0 || al.indexOf("block") >= 0) { allBtns[i].click(); dismissed++; } } catch(e){} } return "second-pass: " + dismissed; })()' --timeout 5000 2>&1 || true
    dumate-browser-cli sleep 1 2>&1
    FIRST=false
  fi

  # 提取推文
  dumate-browser-cli eval "$EXTRACT_JS" --timeout 25000 >> "$RAW_FILE"

  # 滚动加载更多（2次）
  for i in 1 2; do
    dumate-browser-cli eval 'window.scrollTo(0, document.body.scrollHeight)' --timeout 10000 2>&1 >/dev/null
    dumate-browser-cli sleep 2 2>&1 >/dev/null
  done

  # 第二次提取（滚动后更多推文）
  dumate-browser-cli eval "$EXTRACT_JS" --timeout 25000 >> "$RAW_FILE"

  # 账号间间隔（防风控）
  dumate-browser-cli sleep 2 2>&1 >/dev/null
done

echo "[1/5] 推文采集完成"

# ========== 第2步：关闭浏览器 ==========
echo "[2/5] 关闭浏览器会话..."
dumate-browser-cli close 2>&1 || true

# ========== 第3步：过滤、去重、翻译、生成HTML ==========
echo "[3/5] 执行过滤、去重、翻译和报告生成..."
node "$PROJECT_DIR/generate_report.mjs"
echo "[3/5] 报告生成完成"

# ========== 第4步：校验 ==========
REPORT_FILE="$REPORTS_DIR/news.html"
if [ ! -s "$REPORT_FILE" ]; then
  echo "ERROR: 当日 HTML 报告未生成"; exit 1
fi

echo "[4/5] 校验报告: $REPORT_FILE"
CARDS=$(grep -c 'tweet-card" id=' "$REPORT_FILE" || true)
ZH_BLOCKS=$(grep -c 'tweet-body-zh' "$REPORT_FILE" || true)
SOURCES=$(grep -c '来源：X / @' "$REPORT_FILE" || true)
echo "  推文卡片: $CARDS"
echo "  中文翻译块: $ZH_BLOCKS"
echo "  来源标注: $SOURCES"

if [ "$CARDS" -eq 0 ]; then
  echo "WARNING: 本次未采集到新推文，可能24h内无新内容"
fi

# ========== 第5步：完成 ==========
echo "[5/5] 任务完成"
echo "报告路径: $REPORT_FILE"
echo "去重数据: $SEEN_FILE ($(python3 -c "import json; d=json.load(open('$SEEN_FILE')); print(len(d['tweets']))") 条历史记录)"
rm -f "$RAW_BACKUP"
rmdir "$WORK_ROOT" 2>/dev/null || true
echo "=== FC27 资讯自动化任务结束 ==="

# 合并由 automation/coordinate.mjs 独占执行。
