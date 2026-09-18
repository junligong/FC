// 一次性提取脚本（临时工作文件）：从 FUTBIN /27/popular/evolutions 页面 DOM 提取榜单卡片结构化数据。
// 输入：已通过 CDP 打开的 https://www.futbin.com/27/popular/evolutions 页面。
// 输出：JSON 字符串（rank/name/rating/pos/altPos/evolutionName/popularity/futbinListValue/stats/url/evoUrl）。
(function () {
  var KEYS = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'];
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
    // 在 head 中定位数值块：形如 [值, 'PAC', 值, 'SHO', ...]
    var statStart = -1;
    for (var j = 0; j < head.length - 1; j++) {
      if (KEYS.indexOf(String(head[j + 1]).toUpperCase()) > -1 && /^\d+$/.test(String(head[j]))) {
        statStart = j;
        break;
      }
    }
    var stats = {}, evol = '', pop = '';
    var pre = statStart > -1 ? head.slice(0, statStart) : head;
    if (statStart > -1) {
      for (var k = 0; k < 6 && statStart + 2 * k + 1 < head.length; k++) {
        var key = String(head[statStart + 2 * k + 1]).toUpperCase();
        if (KEYS.indexOf(key) > -1) stats[key] = String(head[statStart + 2 * k]);
      }
      var rest = head.slice(statStart + 12);
      evol = rest[0] || '';
      pop = rest[1] || '';
    } else {
      evol = pre[pre.length - 1] || '';
      pop = '';
      pre = pre.slice(0, -1);
    }
    // pre 结构：[价格?, 姓名?]；价格为纯数字/带 K 的数值口径
    var name = '', price = '';
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
