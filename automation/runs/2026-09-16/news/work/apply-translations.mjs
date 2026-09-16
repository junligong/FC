/* 作用：把本轮由执行 AI 完成的中文翻译写回当日快照（一次性脚本，位于 work 目录）。
 * 输入：apps/news/data/tweets-2026-09-16.json 中缺失 translation 的条目。
 * 输出：原地原子更新该快照的 translation 字段；不触碰 seen_tweets.json。
 */
import fs from 'node:fs';

const SNAPSHOT = '/Users/wuyanzu/Desktop/FC/apps/news/data/tweets-2026-09-16.json';

const T = {
  '2099964692995195088': 'SZOBOSZLAI（索博斯洛伊）这也太离谱了吧\nhttps://x.com/kalfa5/status/2099964302539051039/video/1…',
  '2099961218056298889': '🚨 周五 SBC 是 Bouaddi（布阿迪）🇲🇦 👀🔥\n\n官方数据 ✅\n\n你会做完他吗？#FC27',
  '2099956474717905009': '看来他们并不是 5/5 ⭐️ ❌',
  '2099955739569582304': '🚨 5🌟5🌟 球员卡是 7 场租借 ✅\n\n在以下球员中选择：\n• Gvardiol（格瓦迪奥尔）\n• Nico（尼科）\n• Davies（戴维斯）\n• Shaw（肖）\n• Endrick（恩德里克）\n\n你会选谁？',
  '2099955372521885942': '在这里查看 FUT Gallery！\nhttps://futbin.com/27/gallery\n\n*术语标签尚未最终确定，我们正在实时更新 😅',
  '2099953774194233582': '第一场正式比赛里就已经出现这种情况，真是没想到 #FC27',
  '2099946507793248703': '哦…… 🤣',
  '2099933325913645356': '🚨 Cole Palmer（科尔·帕尔默）在 FC 27 里已经有这套阵容了 😳😭\n#FC27',
  '2099917944096526415': '🚨 想把你的 FC Points 转移到 FC 27 Web App 吗？\n\n@FUTDeepview 目前正接受 PS 端的订单 ✅\n\n价格：60 欧元\n私信 @FUTDeepview',
  '2099901009958994239': '🚨 EA FC 27 全息（Holographics）球员卡详解',
  '2099898275658691030': '🚨 FC 27 第一周最佳阵容（TOTW 1）🔥',
  '2099893901377016187': '🚨 FC 27 第一周最佳阵容完整名单 ✅️\n\n🇪🇸 Yamal（亚马尔）\n🇪🇸 Raya（拉亚）\n🇭🇹 Dumornay（迪莫奈）\n🏴󠁧󠁢󠁥󠁮󠁧󠁿 Bronze（布龙泽）\n🇳🇱 Brugts（布鲁赫茨）\n🇫🇷 Thuram（图拉姆）\n🇩🇪 Nmecha（恩梅查）\n🇷🇺 Safonov（萨福诺夫）\n🇽🇰 Memeti（梅梅蒂）\n🇧🇷 Martinelli（马丁内利）\n🇪🇸 Carreras（卡雷拉斯）\n🇧🇷 Amanda Gutierres（阿曼达·古铁雷斯）\n🇦🇷 Mastantuono（马斯塔努奥诺）\n🇵🇹 Tiago Santos（蒂亚戈·桑托斯）',
  '2099890929184182283': '🚨 Cole Palmer（科尔·帕尔默）因提前直播 FC 27 已被 Twitch 封禁！😳',
  '2099889335684210863': '🚨 更新：EA 官方已进入 Cole Palmer（科尔·帕尔默）的 FC 27 直播聊天室 🤣',
  '2099887774199378044': '是的（法语 oui）',
  '2099887197998420227': '💣 TOTW 最低评分为 80\n🔥 TIAGO SANTOS（蒂亚戈·桑托斯）TOTW 官方卡\n你的球员是谁？',
  '2099885737864826901': '🚨 Cole Palmer（科尔·帕尔默）谈自己的 FC 27 评分被下调：\n\n「我得找 EA 好好谈谈，我有 10 个月都只有一条腿能用，他妈的，你还想让我怎样？」🤣🤣\n\n来源：Cole Palmer 的 Twitch 直播',
  '2099881116421267456': 'Cole Palmer（科尔·帕尔默）刚刚让直播间观众在聊天里刷「W」以留在直播中并开 FC 27 卡包，这人真是绝了 🤣',
  '2099847509174542446': '💻 FC 27 首批观赛奖励（Viewership Rewards）来了！\n\n✅ 小型 Electrum 球员包\n✅ 2,500 金币（另有 5,000 比赛奖金）\n✅ 小型黄金球员包',
  '2099829085203575161': '🚨 FC 27 今天开启\n\n• ✅ 主播 = 今天\n• ✅ Web App = 明天\n• ✅ 终极版 = 3 天后\n• ✅ 标准版 = 10 天后\n\n老实说，你买的是哪个版本？',
  '2099800394994000312': '你投票让谁进入 TOTW 1？🌟',
  '2099783220573192572': '这就是我去年赚到巨额利润的东西……\n\n这帮人绝对是业内最强的，遥遥领先\n\n\nhttps://Patreon.com/roryxrobos',
  '2099834469326770266': '👀 独家消息：Squad Battles 奖励✨\n\n准备好肝了吗？😅',
  '2099802635221991466': '重要提醒：请先获取你的备用验证码🖊️\n\n第一步 - 进入你的 EA 账户\n打开 https://myaccount.ea.com 并登录你的 EA 账户。\n\n第二步 - 安全与隐私\n在菜单中选择「安全与隐私」。\n\n第三步 - 两步验证\n进行设置。',
  '2099952098133553586': '🚨 LACROIX（拉夸）🇫🇷 已确认的球风（PlayStyles）：\n\n• ✅ 拦截 Intercept\n• ✅ 卡位 Jockey\n• ✅ 空中堡垒 Aerial Fortress\n• ✅ 长传 Long Ball\n\n太强了 🥶🥶🥶',
  '2099937765127274959': '金球奖最大热门即将打进 3 球，锁定 31.7 万美元的赔付 💰🥶',
  '2099933566935150737': '🚨 Cole Palmer（科尔·帕尔默）在 FC 27 中的阵容 ✅\n\n他是懂球的。队徽来自世界上最好的球队。🇧🇷 😉',
  '2099928135559000150': '🚨 FC27 欢迎回归卡包（WELCOME BACK PACKS）已确认 🔥\n\n• ✅ 混合球员包（可交易）\n• ✅ 3 名球员 78–85（可交易）\n\n关注 @FutSheriff #FC27',
  '2099924982562173298': '#FC27 中的低平射 + 弧线射门组合',
  '2099850957328683420': '🚨 免费 FC 27 卡包提醒 🚨',
  '2099837979309035839': '🚨 EA FC 27 Squad Battles 奖励 ✅\n\nℹ️ 来源 @fifa_romania\n\n你怎么看？👇🏻',
  '2099826350332825719': '🚨 本周关于 FC 27，你最期待的一件事是什么？\n\n我先来：用一套便宜英超阵容打 Division Rivals 的头几场比赛 🤩',
  '2099763953630872018': '💣 FC27 进化（EVOLUTION）💣\n评分 79\n位置 ST\n\n比赛改变者球风（Gamechanger PlayStyle）\n数据提升\n\n把你想要进化的卡发给我，我告诉你他能不能用',
  '2099757113950048695': '💣 FC27 进化（EVOLUTION）💣\n评分 81\n位置 LW\n\n迅捷球风（Rapid PlayStyle）\n数据提升\n\n把你想要进化的卡发给我，我告诉你他能不能用',
  '2100117643386638809': '🚨 如何轻松免费拿到 15K 金币\n\n• ✅ 买 50 张卡\n• ✅ 卖 50 张卡\n\n选需求旺盛的铜卡使用 🤝',
  '2099879931463245999': '🚨 Cole Palmer（科尔·帕尔默）正在 Twitch 上直播 EA FC 27 🤣',
  '2099872154556764231': '🚨 已确认：主播可在今晚英国/印度时间 21:00 起直播 EA FC 27 的 Ultimate Team。',
  '2099856302918799853': '🚨 EA FC 27 转会市场上目前有 400 件物品。\n\n看来已经有不少人拿到游戏了 👀',
};

const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
let applied = 0;
for (const tweet of snapshot.tweets) {
  if (T[tweet.id] && (!tweet.translation || !tweet.translation.trim())) {
    tweet.translation = T[tweet.id];
    applied += 1;
  }
}
const stillMissing = snapshot.tweets.filter((t) => !t.translation || !t.translation.trim()).length;
const tmp = `${SNAPSHOT}.tmp-${process.pid}`;
fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 1));
fs.renameSync(tmp, SNAPSHOT);
console.log(`写入翻译 ${applied} 条；仍缺翻译 ${stillMissing} 条`);
