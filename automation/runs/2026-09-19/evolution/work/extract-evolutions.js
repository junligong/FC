// 一次性提取脚本（临时工作文件）：从 FUTBIN /27/evolutions 总览页提取全部进化路径的
// 名称、详情 URL、类型标签、赛季通行证等级、有效期（UNLOCK/EXPIRES）、费用、可重复性、
// Player Requirements 与 Total Upgrades 原文。
// 输入：已通过 CDP 打开的 https://www.futbin.com/27/evolutions 页面。
// 输出：JSON 字符串（title/url/count/body[{name,url,tags,seasonName,seasonLevel,foundAt,unlock,expires,cost,repeatable,requirements[],upgrades[],rawText}]）。
// 2026-09-19 变更：站点把部分路径的第 2 行由类型标签（PATHWAY EVOLUTIONS 等）换成了
// 「SEASON 1 LEVEL: N」，解锁来源改为「Found at Level N of the Premium Season Pass」。
// 旧版会因标签正则不匹配而把这类路径默认成 EVOLUTIONS（类型标注失真），故显式提取赛季字段。
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
    // 赛季通行证等级：第 2 行形如「SEASON 1 LEVEL: 28」（2026-09-19 起替代部分路径的类型标签）
    var seasonName = '', seasonLevel = '';
    for (var sl = 1; sl < Math.min(lines.length, 6); sl++) {
      var sm = lines[sl].match(/^SEASON\s+(\d+)\s+LEVEL:\s*(\d+)$/i);
      if (sm) { seasonName = 'Season ' + sm[1]; seasonLevel = sm[2]; break; }
    }
    // 解锁来源说明（如「Found at Level 28 of the Premium Season Pass」「Found in the Pep's Domination Objective」）
    var foundAt = (txt.match(/Found at Level[^\n]*/) || [''])[0];
    if (!foundAt) foundAt = (txt.match(/Found in the [^\n]*/) || [''])[0];
    // 来源标签（卡片第 2 行）：EVOLUTIONS / TRAINING CAMP / PATHWAY EVOLUTIONS / REWARDS / SEASON 1 LEVEL: N。
    // 2026-09-19 站点把部分路径由类型标签改为 REWARDS 或赛季等级行，故统一取「名称后的首个来源标识」。
    var originLabel = '';
    for (var ol = 1; ol < Math.min(lines.length, 6); ol++) {
      if (/^(EVOLUTIONS|TRAINING CAMP|PATHWAY EVOLUTIONS|REWARDS|NEW)$/.test(lines[ol])) {
        if (lines[ol] !== 'NEW') { originLabel = lines[ol]; break; }
      } else if (/^SEASON\s+\d+\s+LEVEL:\s*\d+$/i.test(lines[ol])) {
        originLabel = lines[ol]; break;
      }
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
      originLabel: originLabel,
      seasonName: seasonName,
      seasonLevel: seasonLevel,
      foundAt: foundAt,
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
