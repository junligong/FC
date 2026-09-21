// 一次性提取脚本（临时工作文件）：从 FUTBIN /27/popular/evolutions 页面 DOM 提取榜单卡片结构化数据。
// 输入：已通过 CDP 打开的 https://www.futbin.com/27/popular/evolutions 页面。
// 输出：JSON 字符串（rank/name/rating/pos/altPos/evolutionName/popularity/futbinListValue/stats/url/evoUrl）。
(function () {
  var KEYS = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'];
  // 门将卡的六项是 DIV/HAN/KIC/REF/SPD/POS（实测 LIVAKOVIC 等 GK 卡）。
  // 若不纳入，定位不到数值块，姓名会被误解析成标签（如 'POS'）。
  var KEYS_GK = ['DIV', 'HAN', 'KIC', 'REF', 'SPD', 'POS'];
  var KEYS_ALL = KEYS.concat(KEYS_GK);
  var POS = { GK: 1, RB: 1, LB: 1, CB: 1, CDM: 1, CM: 1, CAM: 1, RM: 1, LM: 1, RW: 1, LW: 1, CF: 1, ST: 1 };
  var cards = document.querySelectorAll('div.popular-cards-wrapper > div.column');
  var out = [];
  for (var i = 0; i < cards.length; i++) {
    var c = cards[i];
    var anchors = c.querySelectorAll('a');
    var playerUrl = '', evoUrl = '';
    for (var a = 0; a < anchors.length; a++) {
      var h = anchors[a].getAttribute('href') || '';
      if (h.indexOf('/player/') > -1) playerUrl = h;
      else if (h.indexOf('/evolutions') > -1) evoUrl = h;
    }
    if (!playerUrl) continue;
    var lines = (c.innerText || '').split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s !== ''; });
    if (lines.length < 4) continue;
    var rating = lines[0], pos = lines[1], i2 = 2;
    if (lines[i2] === '++') i2++;
    var alt = [];
    while (i2 < lines.length && POS[lines[i2]]) { alt.push(lines[i2]); i2++; }
    var foot = lines[i2], skill = lines[i2 + 1], weak = lines[i2 + 2];
    var head = lines.slice(i2 + 3);
    // 在 head 中定位数值块：形如 [值, 'PAC', 值, 'SHO', ...]（门将为 DIV/HAN/...）
    var statStart = -1;
    for (var j = 0; j < head.length - 1; j++) {
      if (KEYS_ALL.indexOf(String(head[j + 1]).toUpperCase()) > -1 && /^\d+$/.test(String(head[j]))) {
        statStart = j;
        break;
      }
    }
    var stats = {}, evol = '', pop = '';
    var name = '', price = '';
    var pre = statStart > -1 ? head.slice(0, statStart) : head;
    if (statStart > -1) {
      for (var k = 0; k < 6 && statStart + 2 * k + 1 < head.length; k++) {
        var key = String(head[statStart + 2 * k + 1]).toUpperCase();
        if (KEYS_ALL.indexOf(key) > -1) stats[key] = String(head[statStart + 2 * k]);
      }
      var rest = head.slice(statStart + 12);
      evol = rest[0] || '';
      pop = rest[1] || '';
    } else {
      // 无六维块的少部分卡片（500 张里 5 张）：innerText 尾部结构为
      // [FUTBIN Rating?, 球员名, 进化名称, 热度计数]，例如
      // 「81 / LM / ++ / CAM / ST / LW / R / 3 / 3 / 84.0 / Stoica / Believe / 328」。
      // 需要按位置解析，不能用「最后一个非数字即姓名」的旧写法（会把进化名称当姓名）。
      var tail = pre.slice();
      if (tail.length && /^\d+$/.test(String(tail[tail.length - 1]))) pop = String(tail.pop());
      evol = tail.length ? String(tail.pop()) : '';
      name = tail.length ? String(tail.pop()) : '';
      for (var t = 0; t < tail.length; t++) {
        if (/^[\d.,]+[KMkm]?$/.test(String(tail[t]))) price = String(tail[t]);
      }
      pre = [];
    }
    // 有六维块时的 pre 结构：[FUTBIN Rating?, 姓名?]；价格为数值口径
    for (var p = 0; p < pre.length; p++) {
      if (/^[\d.,]+[KMkm]?$/.test(pre[p])) price = pre[p];
      else name = pre[p];
    }
    out.push({
      rank: 0,
      name: name,
      rating: rating,
      pos: pos,
      altPos: alt.join(' / '),
      foot: foot,
      skill: skill,
      weak: weak,
      futbinListValue: price,
      evolutionName: evol,
      popularityCount: pop,
      stats: stats,
      url: 'https://www.futbin.com' + playerUrl,
      evoUrl: evoUrl ? 'https://www.futbin.com' + evoUrl : ''
    });
  }
  return JSON.stringify({ title: document.title, url: location.href, count: out.length, body: out });
})()
