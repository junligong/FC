// 一次性提取脚本（临时工作文件）：从 FUTBIN /27/evolutions 总览页提取 14 条进化路径的
// 名称、详情 URL、类型标签、有效期（UNLOCK/EXPIRES）、费用、可重复性、Player Requirements 与 Total Upgrades 原文。
// 输入：已通过 CDP 打开的 https://www.futbin.com/27/evolutions 页面。
// 输出：JSON 字符串（title/url/count/body[{name,url,tags,unlock,expires,cost,repeatable,requirements[],upgrades[],rawText}]）。
(function () {
  var cards = document.querySelectorAll('div.evolutions-overview-wrapper');
  var out = [];
  function grab(txt, label, nextLabelRe) {
    var m = txt.match(new RegExp(label + '\\n([^\\n]+)'));
    return m ? m[1].trim() : '';
  }
  for (var i = 0; i < cards.length; i++) {
    var c = cards[i];
    var txt = c.innerText || '';
    var href = '';
    var as = c.querySelectorAll('a');
    for (var j = 0; j < as.length; j++) {
      var h = as[j].getAttribute('href') || '';
      if (/^\/27\/evolutions\/\d+\//.test(h)) { href = h; break; }
    }
    // 名称：卡片标题（第一行）
    var lines = txt.split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
    var name = lines[0] || '';
    // 类型标签：出现在名称之后、'NEW' 前后的大写标签（EVOLUTIONS / TRAINING CAMP / PATHWAY EVOLUTIONS）
    var tags = [];
    for (var k = 1; k < Math.min(lines.length, 6); k++) {
      if (/^(EVOLUTIONS|TRAINING CAMP|PATHWAY EVOLUTIONS|NEW)$/.test(lines[k])) tags.push(lines[k]);
    }
    // 有效期与费用区
    var unlock = grab(txt, 'UNLOCK');
    var expires = grab(txt, 'EXPIRES');
    var costM = txt.match(/\n(UNLOCK\n[\s\S]{0,120}?)\n([A-Z0-9 ]{0,24})\n(REPEATABLE|SINGLE USE)/);
    var cost = costM ? costM[2].trim() : '';
    var repeatable = /REPEATABLE/.test(txt) ? 'REPEATABLE' : (/(SINGLE USE|NOT REPEATABLE)/.test(txt) ? 'SINGLE USE' : '');
    // 描述行（Group Reward for ... / 类型说明）
    var desc = (txt.match(/Group Reward for[^\n]*/) || [''])[0];
    // Player Requirements 区块
    var reqM = txt.match(/Player Requirements\n([\s\S]*?)\nTotal Upgrades/);
    var reqBlock = reqM ? reqM[1] : '';
    var requirements = [];
    if (reqBlock) {
      var rl = reqBlock.split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
      requirements = rl;
    }
    // Total Upgrades 区块（到 Votes 或结尾）
    var upM = txt.match(/Total Upgrades\n([\s\S]*?)(\n\d+%\n|$)/);
    var upBlock = upM ? upM[1] : '';
    var upgrades = upBlock.split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
    out.push({
      name: name,
      url: href ? 'https://www.futbin.com' + href : '',
      tags: tags,
      desc: desc,
      unlock: unlock,
      expires: expires,
      cost: cost,
      repeatable: repeatable,
      requirements: requirements,
      upgrades: upgrades,
      rawText: txt
    });
  }
  return JSON.stringify({ title: document.title, url: location.href, count: out.length, body: out });
})()
