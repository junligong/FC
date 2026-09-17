// 生成 reports/daily/2026-09-17/football.html（FC·足球日报）
// 用途：复用模板 apps/football/templates/football-daily.html，替换三榜数据块、新闻卡片、
//       过滤计数与截止时间，先写临时文件再原子替换当日报告。
// 输入：本文件内嵌的 2026-09-17 采集数据（来源见 evidence.json）；模板文件。
// 输出：reports/daily/2026-09-17/football.html（原子替换）。
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/wuyanzu/Desktop/FC';
const D = '2026-09-17';
const tpl = readFileSync(path.join(ROOT, 'apps/football/templates/football-daily.html'), 'utf8');

const standingsData = {
  epl: [
    [1, '阿森纳 Arsenal', 4, 4, 0, 0, 8, 1, '+7', 12],
    [2, '曼城 Manchester City', 4, 4, 0, 0, 8, 2, '+6', 12],
    [3, '利兹联 Leeds United', 4, 2, 2, 0, 7, 3, '+4', 8],
    [4, '赫尔城 Hull City', 4, 2, 2, 0, 5, 2, '+3', 8],
    [5, '布莱顿 Brighton & Hove Albion', 4, 2, 1, 1, 13, 5, '+8', 7],
    [6, '切尔西 Chelsea', 4, 2, 1, 1, 10, 9, '+1', 7],
    [7, '布伦特福德 Brentford', 4, 1, 3, 0, 7, 4, '+3', 6],
    [8, '利物浦 Liverpool', 4, 1, 3, 0, 6, 4, '+2', 6],
    [9, '埃弗顿 Everton', 4, 1, 3, 0, 5, 3, '+2', 6],
    [10, '伊普斯维奇 Ipswich Town', 4, 2, 0, 2, 7, 10, '-3', 6],
    [11, '诺丁汉森林 Nottingham Forest', 4, 1, 2, 1, 4, 4, '0', 5],
    [12, '纽卡斯尔联 Newcastle United', 4, 1, 2, 1, 7, 8, '-1', 5],
    [13, '曼联 Manchester United', 4, 1, 1, 2, 7, 7, '0', 4],
    [14, '桑德兰 Sunderland', 4, 1, 1, 2, 3, 5, '-2', 4],
    [15, '伯恩茅斯 Bournemouth', 4, 0, 3, 1, 6, 7, '-1', 3],
    [16, '水晶宫 Crystal Palace', 4, 1, 0, 3, 6, 11, '-5', 3],
    [17, '托特纳姆热刺 Tottenham Hotspur', 4, 0, 2, 2, 0, 5, '-5', 2],
    [18, '富勒姆 Fulham', 4, 0, 1, 3, 4, 7, '-3', 1],
    [19, '阿斯顿维拉 Aston Villa', 4, 0, 1, 3, 1, 7, '-6', 1],
    [20, '考文垂 Coventry City', 4, 0, 0, 4, 0, 10, '-10', 0],
  ],
  laliga: [
    [1, '巴塞罗那 Barcelona', 5, 5, 0, 0, 21, 4, '+17', 15],
    [2, '皇家马德里 Real Madrid', 6, 5, 0, 1, 17, 6, '+11', 15],
    [3, '马德里竞技 Atlético Madrid', 6, 4, 1, 1, 14, 6, '+8', 13],
    [4, '塞维利亚 Sevilla', 6, 4, 1, 1, 9, 6, '+3', 13],
    [5, '皇家贝蒂斯 Real Betis', 5, 4, 0, 1, 7, 6, '+1', 12],
    [6, '阿拉维斯 Alavés', 6, 3, 1, 2, 11, 6, '+5', 10],
    [7, '拉科鲁尼亚 Deportivo de A Coruña', 6, 2, 3, 1, 9, 7, '+2', 9],
    [8, '西班牙人 Espanyol', 6, 2, 1, 3, 9, 7, '+2', 7],
    [9, '毕尔巴鄂竞技 Athletic Club', 5, 2, 1, 2, 7, 6, '+1', 7],
    [10, '桑坦德竞技 Racing de Santander', 5, 2, 1, 2, 9, 9, '0', 7],
    [11, '巴列卡诺 Rayo Vallecano', 6, 2, 1, 3, 10, 15, '-5', 7],
    [12, '皇家社会 Real Sociedad', 6, 2, 1, 3, 6, 11, '-5', 7],
    [13, '奥萨苏纳 Osasuna', 6, 2, 1, 3, 5, 12, '-7', 7],
    [14, '莱万特 Levante', 5, 1, 2, 2, 7, 9, '-2', 5],
    [15, '赫塔菲 Getafe', 5, 1, 2, 2, 3, 6, '-3', 5],
    [16, '塞尔塔 Celta Vigo', 6, 0, 4, 2, 3, 6, '-3', 4],
    [17, '瓦伦西亚 Valencia', 6, 1, 1, 4, 2, 10, '-8', 4],
    [18, '马拉加 Málaga', 5, 0, 3, 2, 2, 8, '-6', 3],
    [19, '比利亚雷亚尔 Villarreal', 5, 0, 2, 3, 7, 10, '-3', 2],
    [20, '埃尔切 Elche', 6, 0, 2, 4, 8, 16, '-8', 2],
  ],
  seriea: [
    [1, '罗马 AS Roma', 4, 4, 0, 0, 12, 1, '+11', 12],
    [2, '国际米兰 Inter', 4, 4, 0, 0, 13, 6, '+7', 12],
    [3, '科莫 Como 1907', 4, 3, 1, 0, 9, 4, '+5', 10],
    [4, '拉齐奥 Lazio', 4, 3, 1, 0, 6, 3, '+3', 10],
    [5, '卡利亚里 Cagliari', 4, 3, 0, 1, 4, 2, '+2', 9],
    [6, 'AC米兰 AC Milan', 4, 2, 2, 0, 7, 4, '+3', 8],
    [7, '弗罗西诺内 Frosinone', 4, 2, 1, 1, 7, 4, '+3', 7],
    [8, '尤文图斯 Juventus', 4, 2, 1, 1, 6, 4, '+2', 7],
    [9, '萨索洛 Sassuolo', 4, 2, 1, 1, 8, 7, '+1', 7],
    [10, '那不勒斯 Napoli', 4, 2, 0, 2, 6, 5, '+1', 6],
    [11, '亚特兰大 Atalanta', 4, 2, 0, 2, 5, 5, '0', 6],
    [12, '莱切 Lecce', 4, 2, 0, 2, 5, 7, '-2', 6],
    [13, '乌迪内斯 Udinese', 4, 1, 1, 2, 8, 10, '-2', 4],
    [14, '都灵 Torino', 4, 1, 0, 3, 4, 7, '-3', 3],
    [15, '佛罗伦萨 Fiorentina', 4, 1, 0, 3, 5, 11, '-6', 3],
    [16, '博洛尼亚 Bologna', 4, 0, 1, 3, 2, 5, '-3', 1],
    [17, '帕尔马 Parma', 4, 0, 1, 3, 2, 6, '-4', 1],
    [18, '蒙扎 Monza', 4, 0, 1, 3, 6, 11, '-5', 1],
    [19, '热那亚 Genoa', 4, 0, 1, 3, 2, 8, '-6', 1],
    [20, '威尼斯 Venezia', 4, 0, 0, 4, 4, 11, '-7', 0],
  ],
  bundesliga: [
    [1, '弗赖堡 SC Freiburg', 3, 3, 0, 0, 10, 1, '+9', 9],
    [2, '多特蒙德 Borussia Dortmund', 3, 3, 0, 0, 8, 2, '+6', 9],
    [3, '奥格斯堡 FC Augsburg', 3, 2, 1, 0, 9, 3, '+6', 7],
    [4, '拜仁慕尼黑 Bayern München', 3, 2, 1, 0, 7, 2, '+5', 7],
    [5, 'RB莱比锡 RB Leipzig', 3, 2, 0, 1, 9, 3, '+6', 6],
    [6, '埃尔沃斯堡 SV 07 Elversberg', 3, 2, 0, 1, 8, 7, '+1', 6],
    [7, '勒沃库森 Bayer Leverkusen', 3, 1, 1, 1, 8, 5, '+3', 4],
    [8, '美因茨 Mainz 05', 3, 1, 1, 1, 6, 3, '+3', 4],
    [9, '法兰克福 Eintracht Frankfurt', 3, 1, 1, 1, 7, 8, '-1', 4],
    [10, '云达不来梅 Werder Bremen', 3, 1, 1, 1, 5, 6, '-1', 4],
    [11, '沙尔克04 Schalke 04', 3, 1, 1, 1, 3, 4, '-1', 4],
    [12, '科隆 1. FC Köln', 3, 1, 1, 1, 5, 7, '-2', 4],
    [13, '霍芬海姆 TSG Hoffenheim', 3, 1, 0, 2, 6, 7, '-1', 3],
    [14, '斯图加特 VfB Stuttgart', 3, 1, 0, 2, 6, 8, '-2', 3],
    [15, '帕德博恩 SC Paderborn 07', 3, 0, 1, 2, 0, 4, '-4', 1],
    [16, '柏林联合 Union Berlin', 3, 0, 1, 2, 4, 10, '-6', 1],
    [17, '门兴格拉德巴赫 Bor. Mönchengladbach', 3, 0, 0, 3, 3, 12, '-9', 0],
    [18, '汉堡 Hamburger SV', 3, 0, 0, 3, 0, 12, '-12', 0],
  ],
  ligue1: [
    [1, '里尔 Lille OSC', 4, 3, 1, 0, 7, 2, '+5', 10],
    [2, '摩纳哥 AS Monaco', 4, 3, 1, 0, 6, 2, '+4', 10],
    [3, '雷恩 Stade Rennais', 4, 3, 1, 0, 8, 5, '+3', 10],
    [4, '里昂 Olympique Lyonnais', 4, 2, 2, 0, 6, 2, '+4', 8],
    [5, '巴黎FC Paris FC', 4, 2, 2, 0, 6, 2, '+4', 8],
    [6, '斯特拉斯堡 Racing Strasbourg', 4, 2, 1, 1, 9, 8, '+1', 7],
    [7, '巴黎圣日耳曼 Paris Saint-Germain', 4, 1, 2, 1, 6, 6, '0', 5],
    [8, '布雷斯特 Stade Brestois 29', 4, 1, 2, 1, 6, 6, '0', 5],
    [9, '洛里昂 FC Lorient', 4, 1, 2, 1, 4, 4, '0', 5],
    [10, '朗斯 RC Lens', 4, 1, 1, 2, 8, 7, '+1', 4],
    [11, '昂热 Angers SCO', 4, 1, 1, 2, 4, 5, '-1', 4],
    [12, '特鲁瓦 ES Troyes AC', 4, 1, 1, 2, 4, 9, '-5', 4],
    [13, '马赛 Olympique de Marseille', 4, 1, 0, 3, 6, 6, '0', 3],
    [14, '勒芒 Le Mans FC', 4, 0, 3, 1, 7, 8, '-1', 3],
    [15, '欧塞尔 AJ Auxerre', 4, 1, 0, 3, 5, 11, '-6', 3],
    [16, '勒阿弗尔 Havre AC', 4, 0, 2, 2, 2, 4, '-2', 2],
    [17, '图卢兹 Toulouse FC', 4, 0, 2, 2, 4, 7, '-3', 2],
    [18, '尼斯 OGC Nice', 4, 0, 2, 2, 1, 5, '-4', 2],
  ],
  ucl: [
    [1, '巴黎圣日耳曼 Paris Saint-Germain', 1, 1, 0, 0, 6, 1, '+5', 3],
    [2, '拜仁慕尼黑 Bayern München', 1, 1, 0, 0, 5, 0, '+5', 3],
    [3, '巴塞罗那 Barcelona', 1, 1, 0, 0, 5, 1, '+4', 3],
    [4, '曼联 Manchester United', 1, 1, 0, 0, 4, 0, '+4', 3],
    [5, '科莫 Como', 1, 1, 0, 0, 4, 1, '+3', 3],
    [6, '葡萄牙体育 Sporting CP', 1, 1, 0, 0, 3, 1, '+2', 3],
    [7, '斯图加特 VfB Stuttgart', 1, 1, 0, 0, 3, 1, '+2', 3],
    [8, '曼城 Manchester City', 1, 1, 0, 0, 2, 0, '+2', 3],
    [9, '阿斯顿维拉 Aston Villa', 1, 1, 0, 0, 3, 2, '+1', 3],
    [10, '朗斯 RC Lens', 1, 1, 0, 0, 3, 2, '+1', 3],
  ],
  mls_east: [
    [1, '纳什维尔SC Nashville SC', 25, 16, 6, 3, 50, 21, '+29', 54],
    [2, '迈阿密国际 Inter Miami CF', 25, 12, 9, 4, 61, 46, '+15', 45],
    [3, '新英格兰革命 New England Revolution', 25, 13, 4, 8, 41, 31, '+10', 43],
    [4, '夏洛特FC Charlotte FC', 25, 11, 7, 7, 45, 36, '+9', 40],
    [5, '芝加哥火焰 Chicago Fire FC', 24, 11, 6, 7, 45, 35, '+10', 39],
    [6, '奥兰多城 Orlando City SC', 25, 10, 4, 11, 44, 56, '-12', 34],
    [7, '费城联合 Philadelphia Union', 25, 9, 6, 10, 46, 39, '+7', 33],
    [8, '纽约城FC New York City FC', 25, 8, 8, 9, 39, 33, '+6', 32],
    [9, '辛辛那提FC FC Cincinnati', 24, 8, 8, 8, 52, 59, '-7', 32],
    [10, '纽约红牛 New York Red Bulls', 25, 8, 6, 11, 33, 48, '-15', 30],
    [11, '华盛顿联 D.C. United', 24, 6, 11, 7, 30, 37, '-7', 29],
    [12, '多伦多FC Toronto FC', 25, 6, 11, 8, 38, 46, '-8', 29],
    [13, '哥伦布机员 Columbus Crew', 25, 6, 5, 14, 35, 42, '-7', 23],
    [14, '亚特兰大联 Atlanta United FC', 25, 6, 5, 14, 29, 43, '-14', 23],
    [15, '蒙特利尔CF CF Montréal', 25, 5, 6, 14, 31, 51, '-20', 21],
  ],
  mls_west: [
    [1, '温哥华白浪 Vancouver Whitecaps', 24, 14, 4, 6, 53, 23, '+30', 46],
    [2, '休斯顿迪纳摩 Houston Dynamo FC', 25, 13, 4, 8, 32, 28, '+4', 43],
    [3, '达拉斯FC FC Dallas', 25, 12, 7, 6, 49, 42, '+7', 43],
    [4, '圣何塞地震 San Jose Earthquakes', 25, 12, 5, 8, 44, 36, '+8', 41],
    [5, '圣路易斯城 St. Louis CITY SC', 25, 11, 8, 6, 42, 35, '+7', 41],
    [6, '洛杉矶FC LAFC', 26, 11, 7, 8, 41, 27, '+14', 40],
    [7, '科罗拉多急流 Colorado Rapids', 25, 11, 2, 12, 33, 32, '+1', 35],
    [8, '波特兰伐木者 Portland Timbers', 25, 9, 5, 11, 47, 47, '0', 32],
    [9, '圣地亚哥FC San Diego FC', 25, 8, 6, 11, 42, 42, '0', 30],
    [10, '洛杉矶银河 LA Galaxy', 26, 7, 9, 10, 31, 40, '-9', 30],
    [11, '皇家盐湖城 Real Salt Lake', 24, 8, 5, 11, 37, 39, '-2', 29],
    [12, '明尼苏达联 Minnesota United FC', 25, 7, 8, 10, 37, 43, '-6', 29],
    [13, '奥斯汀FC Austin FC', 25, 7, 8, 10, 32, 44, '-12', 29],
    [14, '西雅图海湾人 Seattle Sounders FC', 23, 7, 7, 9, 25, 30, '-5', 28],
    [15, '堪萨斯城竞技 Sporting Kansas City', 24, 5, 3, 16, 26, 59, '-33', 18],
  ],
  saudi: [
    [1, '利雅得新月 Al Hilal', 7, 6, 0, 1, 23, 5, '+18', 18],
    [2, '吉达联合 Al Ittihad', 7, 5, 2, 0, 12, 6, '+6', 17],
    [3, '利雅得胜利 Al Nassr', 7, 5, 1, 1, 16, 7, '+9', 16],
    [4, '卡迪西亚 Al Qadsiah', 7, 5, 1, 1, 16, 8, '+8', 16],
    [5, 'NEOM SC 新未来城', 7, 5, 0, 2, 13, 6, '+7', 15],
    [6, '吉达国民 Al Ahli', 7, 4, 0, 3, 16, 10, '+6', 12],
    [7, '胡卢德 Al Kholood', 7, 3, 3, 1, 12, 10, '+2', 12],
    [8, '德里亚 Al Diriyah', 7, 3, 2, 2, 7, 5, '+2', 11],
    [9, '达曼协作 Al Ettifaq', 7, 3, 2, 2, 11, 11, '0', 11],
    [10, '哈泽姆 Al Hazem', 7, 2, 2, 3, 7, 9, '-2', 8],
    [11, '利雅得 Al Riyadh', 7, 2, 2, 3, 8, 16, '-8', 8],
    [12, '费哈 Al Fayha', 7, 1, 3, 3, 7, 11, '-4', 6],
    [13, '哈利杰 Al Khaleej', 7, 0, 5, 2, 3, 10, '-7', 5],
    [14, '沙巴布 Al Shabab', 7, 0, 4, 3, 6, 11, '-5', 4],
    [15, '费特 Al Fateh', 7, 0, 3, 4, 4, 11, '-7', 3],
    [16, '费萨里 Al Faisaly', 7, 0, 3, 4, 5, 13, '-8', 3],
    [17, '塔亚文 Al Taawoun', 7, 0, 3, 4, 3, 12, '-9', 3],
    [18, '艾卜哈 Abha', 7, 0, 2, 5, 5, 13, '-8', 2],
  ],
};

const scorersData = {
  epl: [
    [1, '哈兰德 Erling Haaland', '曼城', 4],
    [2, '若昂·佩德罗 João Pedro', '切尔西', 3],
    [2, 'B费 Bruno Fernandes', '曼联', 3],
    [2, '凯文·沙德 Kevin Schade', '布伦特福德', 3],
    [2, '塔文尼尔 Marcus Tavernier', '伯恩茅斯', 3],
    [2, '摩根·罗杰斯 Morgan Rogers', '切尔西', 3],
    [2, '萨卡 Bukayo Saka', '阿森纳', 3],
    [2, '伊萨克 Alexander Isak', '利物浦', 3],
    [2, '卡尔弗特-勒温 Dominic Calvert-Lewin', '利兹联', 3],
    [10, '切尔基 Cherki', '曼城', 2],
  ],
  laliga: [
    [1, '姆巴佩 Kylian Mbappé', '皇家马德里', 7],
    [2, '拉菲尼亚 Raphinha', '巴塞罗那', 6],
    [2, '卡梅洛 Sergio Camello', '巴列卡诺', 6],
    [2, '亚马尔 Lamine Yamal', '巴塞罗那', 6],
    [2, '罗伯托·费尔南德斯 Roberto Fernández', '西班牙人', 6],
    [6, '奥巴梅扬 Pierre-Emerick Aubameyang', '拉科鲁尼亚', 5],
    [6, '扎比里 Yassir Zabiri', '桑坦德竞技', 5],
    [8, '博耶 Lucas Boyé', '阿拉维斯', 4],
    [8, '布迪米尔 Ante Budimir', '奥萨苏纳', 4],
    [8, '费尔明·洛佩斯 Fermín López', '巴塞罗那', 4],
  ],
  seriea: [
    [1, '马伦 Donyell Malen', '罗马', 6],
    [2, '拉伊蒙多 Antonio Raimondo', '弗罗西诺内', 4],
    [3, '弗拉泰西 Davide Frattesi', '拉齐奥', 3],
    [3, '马斯坦图诺 Franco Mastantuono', '佛罗伦萨', 3],
    [5, '亚当斯 Ché Adams', '都灵', 2],
    [5, '阿季奇 Vasilije Adžić', '萨索洛', 2],
    [5, '迪奥 Assane Diao', '科莫', 2],
    [5, '巴图里纳 Martin Baturina', '科莫', 2],
    [5, '恰尔汗奥卢 Hakan Çalhanoğlu', '国际米兰', 2],
    [5, '西塞 Alphadjo Cissè', 'AC米兰', 2],
  ],
  bundesliga: [
    [1, '埃布诺塔利布 Younes Ebnoutalib', '法兰克福', 3],
    [1, '格雷戈里奇 Michael Gregoritsch', '奥格斯堡', 3],
    [1, '克拉滕马赫尔 Maurice Krattenmacher', '埃尔沃斯堡', 3],
    [1, '马塔诺维奇 Igor Matanović', '弗赖堡', 3],
    [1, '希克 Patrik Schick', '勒沃库森', 3],
    [1, '铃木唯人 Yuito Suzuki', '弗赖堡', 3],
    [1, '蒂茨 Phillip Tietz', '美因茨', 3],
    [8, '巴库 Ridle Baku', 'RB莱比锡', 2],
    [8, '博林 Hugo Bolin', '门兴格拉德巴赫', 2],
    [8, '布尔卡特 Jonathan Burkardt', '法兰克福', 2],
  ],
  ligue1: [
    [1, '杜姆比亚 Kamory Doumbia', '布雷斯特', 4],
    [1, '古伊里 Amine Gouiri', '马赛', 4],
    [1, '西纳约科 Lassine Sinayoko', '巴黎FC', 4],
    [4, '布伦纳 Paris Brunner', '摩纳哥', 3],
    [4, '费兰·托雷斯 Ferran Torres', '巴黎圣日耳曼', 3],
    [4, '勒波尔 Esteban Lepaul', '雷恩', 3],
    [4, '马富塔 Louis Mafouta', '勒芒', 3],
    [4, '托万 Florian Thauvin', '朗斯', 3],
    [9, '阿莫-阿梅亚奥 Sam Amo-Ameyaw', '斯特拉斯堡', 2],
    [9, '阿彻 Cameron Archer', '欧塞尔', 2],
  ],
  ucl: [
    [1, '费兰·托雷斯 Ferran Torres', '巴黎圣日耳曼', 1],
    [1, '德米罗维奇 Ermedin Demirović', '斯图加特', 1],
    [3, '哈兰德 Erling Haaland', '曼城', 1],
    [3, '奥利塞 Michael Olise', '拜仁慕尼黑', 1],
    [3, '吉拉西 Serhou Guirassy', '多特蒙德', 1],
    [3, '拉菲尼亚 Raphinha', '巴塞罗那', 1],
    [3, '登贝莱 Ousmane Dembélé', '巴黎圣日耳曼', 1],
    [10, '亚马尔 Lamine Yamal', '巴塞罗那', 1],
  ],
  mls: [
    [1, '梅西 Lionel Messi', '迈阿密国际', 22],
    [2, '穆萨 Petar Musa', '达拉斯FC', 18],
    [3, '费尔南德斯 Nicolás Fernández', '纽约城FC', 15],
    [3, '布莱恩·怀特 Brian White', '温哥华白浪', 15],
    [3, '瑟里奇 Sam Surridge', '纳什维尔SC', 15],
    [6, '巴里博 Tai Baribo', '华盛顿联', 14],
    [7, '布昂加 Denis Bouanga', '洛杉矶FC', 13],
    [7, '奥古斯托 Guilherme Augusto', '休斯顿迪纳摩', 13],
    [7, '奥乌苏 Prince Owusu', '蒙特利尔CF', 13],
    [7, '登凯 Kévin Denkey', '辛辛那提FC', 13],
  ],
  saudi: [
    [1, '伊万·托尼 Ivan Toney', '吉达国民', 10],
    [2, '拉卡泽特 Alexandre Lacazette', 'NEOM SC', 5],
    [3, '科内 Amadou Koné', 'NEOM SC', 4],
    [3, '米林科维奇-萨维奇 Sergej Milinković-Savić', '利雅得新月', 4],
    [3, '贝尔温 Steven Bergwijn', '吉达联合', 4],
    [3, '科尔塔哈雷纳 Iker Kortajarena', '胡卢德', 4],
    [3, '雷特吉 Mateo Retegui', '卡迪西亚', 4],
    [3, '恩内斯里 Youssef En-Nesyri', '吉达联合', 4],
    [3, '伊莱尼赫纳 George Ilenikhena', '吉达联合', 4],
    [10, '鲁本·内维斯 Rúben Neves', '利雅得新月', 3],
  ],
};

const assistsData = {
  epl: [
    [1, '若昂·佩德罗 João Pedro', '切尔西', 3],
    [1, '卡马达 Rômulo', '水晶宫', 3],
    [1, '埃万尼尔森 Evanilson', '伯恩茅斯', 3],
    [1, '加克波 Cody Gakpo', '利物浦', 3],
    [5, '塞梅尼奥 Antoine Semenyo', '曼城', 2],
    [5, '吉布斯-怀特 Morgan Gibbs-White', '诺丁汉森林', 2],
    [5, '格罗斯 Pascal Groß', '布莱顿', 2],
    [5, '帕尔默 Cole Palmer', '切尔西', 2],
    [5, '恩西索 Julio Enciso', '伊普斯维奇', 2],
    [5, '德屈伊佩尔 Jan Paul van Hecke', '布莱顿', 2],
  ],
  laliga: [
    [1, '哈维·埃尔南德斯 Xavi Hernández', '西班牙人', 4],
    [1, '安东尼·戈登 Anthony Gordon', '巴塞罗那', 4],
    [3, '拉菲尼亚 Raphinha', '巴塞罗那', 3],
    [3, '维尼修斯 Vinícius Júnior', '皇家马德里', 3],
    [3, '马里亚诺·迪亚斯 Mariano Díaz', '阿拉维斯', 3],
    [3, '乌奈·洛佩斯 Unai López', '巴列卡诺', 3],
    [3, '安赫尔·佩雷斯 Ángel Pérez', '阿拉维斯', 3],
    [8, '姆巴佩 Kylian Mbappé', '皇家马德里', 2],
    [8, '奥巴梅扬 P-E Aubameyang', '拉科鲁尼亚', 2],
    [8, '费尔明·洛佩斯 Fermín López', '巴塞罗那', 2],
  ],
  seriea: [
    [1, '迪巴拉 Paulo Dybala', '罗马', 4],
    [2, '迪乌夫 Andy Diouf', '国际米兰', 3],
    [3, '拉比奥 Adrien Rabiot', 'AC米兰', 2],
    [3, '扎卡尼 Mattia Zaccagni', '拉齐奥', 2],
    [3, '芒加斯 Ricardo Mangas', '蒙扎', 2],
    [3, '丘克乌泽 Samuel Chukwueze', 'AC米兰', 2],
    [3, '戴维斯 Keinan Davis', '乌迪内斯', 2],
    [3, '伊利奇 Ivan Ilić', '莱切', 2],
    [3, '布西奥 Gianluca Busio', '威尼斯', 2],
    [3, '阿多波 Michel Adopo', '卡利亚里', 2],
  ],
  bundesliga: [
    [1, '金特尔 Matthias Ginter', '弗赖堡', 3],
    [1, '赛巴里 Ismail Saibari', '拜仁慕尼黑', 3],
    [3, '基米希 Joshua Kimmich', '拜仁慕尼黑', 2],
    [3, '库法尔 Vladimír Coufal', '霍芬海姆', 2],
    [3, '贝克尔 Maximilian Becker', '美因茨', 2],
    [3, '吉拉西 Serhou Guirassy', '多特蒙德', 2],
    [3, '奥诺拉 Franck Honorat', '门兴格拉德巴赫', 2],
    [3, '尤拉诺维奇 Josip Juranović', '柏林联合', 2],
    [3, '格吕尔 Marius Grüll', '云达不来梅', 2],
    [3, '米格尔·古铁雷斯 Miguel Gutiérrez', '勒沃库森', 2],
  ],
  ligue1: [
    [1, '小卡塞雷斯 Cristian Cásseres Jr.', '图卢兹', 3],
    [1, '卡特塞里斯 Panagiotis Katseris', '洛里昂', 3],
    [3, '吉鲁 Olivier Giroud', '里尔', 2],
    [3, '托万 Florian Thauvin', '朗斯', 2],
    [3, '托马森 Adrien Thomasson', '雷恩', 2],
    [3, '戈洛温 Aleksandr Golovin', '摩纳哥', 2],
    [3, '法比安·鲁伊斯 Fabián Ruiz', '巴黎圣日耳曼', 2],
    [3, '舒尔茨 Lukáš Šulc', '里昂', 2],
    [3, '纳纳西 Samuel Nanasi', '斯特拉斯堡', 2],
    [3, '布拉巴 Adil Bourabaa', '勒芒', 2],
  ],
  ucl: [
    [1, '本轮无助攻数据来源', '欧冠联赛阶段第1轮', 0],
  ],
  mls: [
    [1, '佩雷拉 Joaquín Pereyra', '明尼苏达联', 13],
    [1, '梅西 Lionel Messi', '迈阿密国际', 13],
    [3, '德雷尔 Anders Dreyer', '圣地亚哥FC', 12],
    [4, '孙兴慜 Son Heung-Min', '洛杉矶FC', 11],
    [4, '埃万德 Evander', '辛辛那提FC', 11],
    [4, '瓦连特 Joaquín Valiente', '达拉斯FC', 11],
    [4, '埃斯皮诺萨 Cristian Espinoza', '纳什维尔SC', 11],
    [4, '德保罗 Rodrigo De Paul', '迈阿密国际', 11],
    [9, '察基里斯 Niko Tsakiris', '圣何塞地震', 10],
    [9, '埃利斯 Justin Ellis', '奥兰多城', 10],
  ],
  saudi: [
    [1, '本轮无助攻数据来源', '沙特职业联赛', 0],
  ],
};

// ===== 新闻卡片 =====
const news = [
  { l: 'toutiao', team: '利物浦', sub: ['tag-epl', '英联杯'], t: '英联杯：利物浦3-1热刺晋级16强', s: '北京时间9月16日凌晨英联杯第3轮，利物浦主场3-1击败热刺晋级16强。第21分钟麦卡利斯特弧顶推射上角破门；第53分钟麦卡利斯特直传助攻加克波劲射扩大比分；第69分钟加拉格尔头球为热刺扳回一城；补时第1分钟索博斯洛伊25码外凌空世界波锁定胜局。麦卡利斯特与加克波均传射建功。', src: '搜狐体育', url: 'https://www.sohu.com/a/1077036246_122343746', date: '09-17' },
  { l: 'toutiao', team: '阿森纳', sub: ['tag-epl', '英联杯'], t: '英联杯：阿森纳4-2伊普斯维奇 16岁道曼双响', s: '英联杯第3轮阿森纳客场4-2淘汰伊普斯维奇，三线作战6连胜。16岁小将道曼第7分钟与第47分钟两度低射破门，成为英联杯历史上代表英超俱乐部进球第二年轻的球员，仅次于2003年的法布雷加斯；马杜埃凯、梅里诺各入一球。阿尔特塔轮换9人仍顺利过关。', src: '搜狐体育', url: 'https://www.sohu.com/a/1077036246_122343746', date: '09-17' },
  { l: 'toutiao', team: '热刺', sub: ['tag-epl', '英超'], t: '热刺出局：英超四轮0球创队史最差', s: '热刺英联杯1-3负于利物浦出局，唯一进球是加拉格尔第69分钟的头球，这也是热刺本赛季对阵英超球队的首粒进球。今夏投入约3亿英镑引援的热刺，英超前四轮进球数为0，属队史首次。主帅德泽尔比赛后表示连续四场联赛不进球难以接受，进攻三区决策出了严重问题。', src: '搜狐体育', url: 'https://www.sohu.com/a/1077036246_122343746', date: '09-17' },
  { l: 'toutiao', team: '皇家马德里', sub: ['tag-laliga', '西甲'], t: '姆巴佩补时助攻绝杀 皇马3-2险胜埃尔切', s: '西甲第6轮皇马客场3-2绝杀埃尔切。第25分钟居莱尔任意球击中立柱弹入网窝，第33分钟姆巴佩抢点破门将个人赛季进球数增至8个；但皇马第71和83分钟被连追两球扳平，补时第1分钟姆巴佩禁区左侧横传，埃斯皮近距离推射完成绝杀。库尔图瓦多次神扑救主。', src: '新浪体育', url: 'https://sports.sina.cn/2026-09-17/detail-inisaawv0381594.d.html', date: '09-17' },
  { l: 'toutiao', team: '马德里竞技', sub: ['tag-laliga', '西甲'], t: '马竞4-0大胜奥萨苏纳 乔纳森-戴维传射', s: '西甲第6轮马竞主场4-0大胜奥萨苏纳。第24分钟乔纳森-戴维两连击补射首开纪录，第54分钟李刚仁禁区内调整低射破门，第63分钟勒诺尔芒兜射远角得手，第82分钟巴埃纳前插推射锁定胜局。马竞凭净胜球优势继续紧咬积分榜前列。', src: '网易体育', url: 'https://www.163.com/dy/article/L70EP7P00549BAP0.html', date: '09-17' },
  { l: 'toutiao', team: '德国国家队', sub: null, t: '克洛普首期名单：决定不征召萨内', s: '据《图片报》主编法尔克消息，德国队新任主帅克洛普已决定不征召加拉塔萨雷边锋萨内，执教首期大名单于9月17日公布。萨内本赛季土超出场5次尚无进球助攻；2026年世界杯上他同样发挥令人失望。这位已代表德国队出场80次打进18球的球员此次落选，意味着克洛普希望带队彻底重新开始。', src: '懂球帝', url: 'https://www.dongqiudi.com/articles/6356643.html', date: '09-17' },
  { l: 'epl', team: '曼城', sub: null, t: '英超官方认错：哈兰德进球VAR误判 两裁判停哨', s: '英超裁判主管霍华德-韦伯承认，曼市德比哈兰德第60分钟制胜球系VAR误判：VAR团队反复核查触球情况，却未评估其是否干扰防守，构成越位犯规。裁判机构已联系曼联致歉，当值VAR裁判被停哨至国际比赛日后，曼城1-0的赛果无法更改。', src: '搜狐体育', url: 'https://www.sohu.com/a/1077045102_122662874', date: '09-17' },
  { l: 'laliga', team: '塞维利亚', sub: null, t: '拉科0-1塞维利亚遭赛季首败 安赫利尼奥染红', s: '西甲第6轮，拉科鲁尼亚主场0-1不敌塞维利亚，遭遇赛季首败。第52分钟米格尔-谢拉补射打进全场唯一进球；第59分钟安赫利尼奥背后踩踏谢拉脚踝，经VAR回看后黄牌改红牌被罚下。拉科此前保持的不败金身就此告破。', src: '懂球帝', url: 'https://www.dongqiudi.com/articles/6357058.html', date: '09-17' },
  { l: 'seriea', team: '国际米兰', sub: null, t: '国米4轮丢6球 榜首位置本周末或易主', s: '意甲前4轮国米进13球丢6球，上轮5-3逆转乌迪内斯暴露防守隐患。罗马在加斯佩里尼带领下2-0击败都灵成为状态最好的球队，马伦4场打进6球。本周末国米将客战罗马，很可能决定榜首归属；佛罗伦萨已解雇仅带队3场的格罗索。', src: '网易体育', url: 'https://www.163.com/dy/article/L704IGOV05561FXO.html', date: '09-17' },
  { l: 'seriea', team: 'AC米兰', sub: null, t: '米兰欧联首战本菲卡大轮换 莫雷拉替补', s: 'AC米兰将在圣西罗迎来欧联杯联赛阶段首战，对手是本菲卡。尽管意甲两连平，主帅阿莫林仍大幅轮换：对拉齐奥梅开二度的迭戈-莫雷拉无缘首发。历史数据利于米兰——本菲卡欧战对米兰2平4负从未取胜，包括1963年和1990年两场冠军杯决赛。', src: '网易体育', url: 'https://www.163.com/dy/article/L70BKJ3Q05561FXP.html', date: '09-17' },
  { l: 'bundesliga', team: '德国国家队', sub: null, t: '克洛普首期德国队大名单今日公布', s: '德国队新帅克洛普于9月17日公布执教后的首期大名单，备战欧国联比赛，最多可征召40名球员。除萨内确认落选外，这也是克洛普接手德国队后首次公开亮相选人，本次名单被视为其建队思路的第一份宣言。', src: '懂球帝', url: 'https://www.dongqiudi.com/articles/6356643.html', date: '09-17' },
  { l: 'ligue1', team: '马赛', sub: null, t: '热内西奥：不为国家德比牺牲欧联杯', s: '马赛法甲开局惨淡，客场0-1不敌雷恩后遭遇3连败，4轮仅积3分排名第13位。主帅热内西奥在欧联杯客战贝西克塔斯赛前表示，俱乐部首要任务是满足财政监管要求；他会大幅轮换但不会为周日对阵巴黎圣日耳曼的国家德比放弃欧联杯。', src: '腾讯新闻', url: 'https://news.qq.com/rain/a/20260917A0164100', date: '09-17' },
  { l: 'mls', team: '迈阿密国际', sub: null, t: '梅西冲击生涯第48冠 迈阿密今晨战蓝十字', s: '北京时间9月17日早上8点，2026美墨冠军杯打响，迈阿密国际主场迎战墨西超冠军蓝十字，这是新帅基利的执教首秀。39岁的梅西目前手握47座冠军奖杯位居足坛历史第一，将冲击个人第48冠；迈阿密队史首次参加该赛事。', src: '网易体育', url: 'https://www.163.com/dy/article/L70B796B0556DMYT.html', date: '09-17' },
  { l: 'saudi', team: '利雅得胜利', sub: ['tag-ucl', '亚冠'], t: '亚冠：利雅得胜利0-4惨败艾因 C罗哑火', s: '亚冠精英联赛西亚区首轮，利雅得胜利客场0-4惨败给艾因，C罗打满90分钟仅触球29次，颗粒无收。胡塞因-拉希米梅开二度，拉希米兄弟合计贡献3球1助攻。利雅得胜利全场9射仅1正，近4场正式比赛仅1胜；主帅波斯特科格鲁表示全部责任在自己。', src: '搜狐体育', url: 'https://www.sohu.com/a/1077012631_121606725', date: '09-17' },
];

const leagueName = { toutiao: '今日头条', epl: '英超', laliga: '西甲', seriea: '意甲', bundesliga: '德甲', ligue1: '法甲', mls: '美职联', saudi: '沙特联', ucl: '欧冠' };
const tagOf = { toutiao: 'tag-toutiao', epl: 'tag-epl', laliga: 'tag-laliga', seriea: 'tag-seriea', bundesliga: 'tag-bundesliga', ligue1: 'tag-ligue1', mls: 'tag-mls', saudi: 'tag-saudi', ucl: 'tag-ucl' };

function newsCard(n) {
  const sub = n.sub ? `\n    <span class="card-league ${n.sub[0]}">${n.sub[1]}</span>` : '';
  const mainTag = n.l === 'toutiao' ? tagOf.toutiao : tagOf[n.l];
  const mainLabel = leagueName[n.l];
  return `<div class="news-card" data-league="${n.l}">
  <div class="card-top">
    <span class="card-team">${n.team}</span>
    <span class="card-league ${mainTag}">${mainLabel}</span>${sub}
  </div>
  <div class="card-body">
    <div class="card-title">${n.t}</div>
    <div class="card-summary">${n.s}</div>
  </div>
  <div class="card-footer">
    <span class="card-source"><a href="${n.url}" target="_blank">${n.src}</a></span>
    <span class="card-time">${n.date}</span>
  </div>
</div>`;
}

const newsCards = news.map(newsCard).join('\n\n');
const counts = {};
for (const n of news) counts[n.l] = (counts[n.l] || 0) + 1;
const total = news.length;

let out = tpl;

// 1) 替换三榜数据块（从 standingsData 开始到 let currentType 之前）
const dataStart = out.indexOf('// ===== DATA =====');
const dataEnd = out.indexOf("let currentType = 'standings';");
if (dataStart < 0 || dataEnd < 0 || dataEnd < dataStart) throw new Error('模板数据块锚点未找到');
out = out.slice(0, dataStart)
  + '// ===== DATA =====（2026-09-17 采集，来源与证据见 automation/runs/2026-09-17/football/evidence.json）\n'
  + 'const standingsData = ' + JSON.stringify(standingsData, null, 2) + ';\n\n'
  + 'const scorersData = ' + JSON.stringify(scorersData, null, 2) + ';\n\n'
  + 'const assistsData = ' + JSON.stringify(assistsData, null, 2) + ';\n\n'
  + out.slice(dataEnd);

// 2) 替换新闻网格内容
const gridStart = out.indexOf('<div class="news-grid" id="news-grid">');
const gridOpenEnd = gridStart + '<div class="news-grid" id="news-grid">'.length;
const footerIdx = out.indexOf('<div class="footer">');
if (gridStart < 0 || footerIdx < 0) throw new Error('新闻网格锚点未找到');
const tail = out.slice(gridOpenEnd, footerIdx);
// tail 末尾含两个连续 </div>（news-grid 关闭 + 外层区块关闭），从倒数第二个开始保留
const lastClose = tail.lastIndexOf('</div>');
const prevClose = tail.lastIndexOf('</div>', lastClose - 1);
if (prevClose < 0) throw new Error('新闻网格闭合标签未找到');
out = out.slice(0, gridOpenEnd) + '\n\n' + newsCards + '\n\n  ' + tail.slice(prevClose) + out.slice(footerIdx);

// 3) 更新计数与时间戳
const leagueCountLine = (l) => `<div class="filter-tab" data-filter="${l}" onclick="filterNews('${l}')">${leagueName[l]} ${counts[l] || 0}</div>`;
out = out.replace(/<div class="filter-tab" data-filter="all"[^<]*<\/div>/, `<div class="filter-tab active" data-filter="all" onclick="filterNews('all')">全部 ${total}</div>`);
for (const l of ['toutiao', 'epl', 'laliga', 'seriea', 'bundesliga', 'ligue1', 'mls', 'saudi', 'ucl']) {
  out = out.replace(new RegExp(`<div class="filter-tab" data-filter="${l}"[\\s\\S]*?<\\/div>`), leagueCountLine(l));
}
out = out.replace(/<span class="news-count" id="news-count">[^<]*<\/span>/, `<span class="news-count" id="news-count">全部 ${total} 条</span>`);
out = out.replace(/<span class="news-update-time">[^<]*<\/span>/, '<span class="news-update-time">更新 2026-09-17</span>');
out = out.replace(/数据截止时间：2026年9月1日 06:36（北京时间）/g, '数据截止时间：2026年9月17日 03:45（北京时间）');

// 4) 顶部标题补充当日日期（校验闸门要求包含 dateStr）
if (!out.includes(D)) out = out.replace('<span class="news-update-time">更新 2026-09-17</span>', `<span class="news-update-time">更新 ${D}</span>`);

mkdirSync(path.join(ROOT, 'reports/daily', D), { recursive: true });
const tmp = path.join(ROOT, `reports/daily/${D}/.football.tmp.html`);
const final = path.join(ROOT, `reports/daily/${D}/football.html`);
writeFileSync(tmp, out);
renameSync(tmp, final);
console.log('OK rows:', Object.entries(counts).map(([k, v]) => k + '=' + v).join(' '), 'total=' + total);
