// 作用：把本轮抓取的原始榜单数据与已核验资讯渲染为当日足球日报。
//       保留 apps/football/templates/football-daily.html 的既有版式与交互，仅替换
//       standingsData / scorersData / assistsData 三个数据块、资讯卡片与头部时间。
// 输入：automation/runs/2026-09-16/football/work/raw.json、news-raw.json、模板文件。
// 输出：reports/daily/2026-09-16/football.html（先写临时文件再原子替换）。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/wuyanzu/Desktop/FC';
const D = '2026-09-16';
const WORK = path.join(ROOT, 'automation/runs', D, 'football/work');
const raw = JSON.parse(fs.readFileSync(path.join(WORK, 'raw.json'), 'utf8'));
const news = JSON.parse(fs.readFileSync(path.join(WORK, 'news-raw.json'), 'utf8'));
const tpl = fs.readFileSync(path.join(ROOT, 'apps/football/templates/football-daily.html'), 'utf8');

const TEAM = {
  'Arsenal': '阿森纳', 'Manchester City': '曼城', 'Leeds United': '利兹联', 'Hull City': '赫尔城',
  'Brighton & Hove Albion': '布莱顿', 'Chelsea': '切尔西', 'Brentford': '布伦特福德', 'Liverpool': '利物浦',
  'Everton': '埃弗顿', 'Ipswich Town': '伊普斯维奇', 'Nottingham Forest': '诺丁汉森林', 'Newcastle United': '纽卡斯尔联',
  'Manchester United': '曼联', 'Sunderland': '桑德兰', 'AFC Bournemouth': '伯恩茅斯', 'Crystal Palace': '水晶宫',
  'Tottenham Hotspur': '托特纳姆热刺', 'Fulham': '富勒姆', 'Aston Villa': '阿斯顿维拉', 'Coventry City': '考文垂',
  'Barcelona': '巴塞罗那', 'Real Madrid': '皇家马德里', 'Real Betis': '皇家贝蒂斯', 'Alavés': '阿拉维斯',
  'Atlético Madrid': '马德里竞技', 'Sevilla': '塞维利亚', 'Deportivo': '拉科鲁尼亚', 'Espanyol': '西班牙人',
  'Athletic Club': '毕尔巴鄂竞技', 'Racing Santander': '桑坦德竞技', 'Osasuna': '奥萨苏纳', 'Rayo Vallecano': '巴列卡诺',
  'Real Sociedad': '皇家社会', 'Levante': '莱万特', 'Getafe': '赫塔菲', 'Celta Vigo': '塞尔塔', 'Valencia': '瓦伦西亚',
  'Málaga': '马拉加', 'Villarreal': '比利亚雷亚尔', 'Elche': '埃尔切',
  'AS Roma': '罗马', 'Internazionale': '国际米兰', 'Como': '科莫', 'Lazio': '拉齐奥', 'Cagliari': '卡利亚里',
  'AC Milan': 'AC米兰', 'Frosinone': '弗罗西诺内', 'Juventus': '尤文图斯', 'Sassuolo': '萨索洛', 'Napoli': '那不勒斯',
  'Atalanta': '亚特兰大', 'Lecce': '莱切', 'Udinese': '乌迪内斯', 'Torino': '都灵', 'Fiorentina': '佛罗伦萨',
  'Bologna': '博洛尼亚', 'Parma': '帕尔马', 'Monza': '蒙扎', 'Genoa': '热那亚', 'Venezia': '威尼斯',
  'SC Freiburg': '弗赖堡', 'Borussia Dortmund': '多特蒙德', 'FC Augsburg': '奥格斯堡', 'Bayern Munich': '拜仁慕尼黑',
  'RB Leipzig': '莱比锡红牛', 'SV Elversberg': '埃尔弗斯贝格', 'Bayer Leverkusen': '勒沃库森', 'Mainz': '美因茨',
  'Eintracht Frankfurt': '法兰克福', 'Werder Bremen': '云达不莱梅', 'Schalke 04': '沙尔克04', 'FC Cologne': '科隆',
  'TSG Hoffenheim': '霍芬海姆', 'VfB Stuttgart': '斯图加特', 'SC Paderborn 07': '帕德博恩', '1. FC Union Berlin': '柏林联合',
  'Borussia Mönchengladbach': '门兴格拉德巴赫', 'Hamburg SV': '汉堡',
  'Lille': '里尔', 'AS Monaco': '摩纳哥', 'Stade Rennais': '雷恩', 'Lyon': '里昂', 'Paris FC': '巴黎FC',
  'Strasbourg': '斯特拉斯堡', 'Brest': '布雷斯特', 'Paris Saint-Germain': '巴黎圣日耳曼', 'Lorient': '洛里昂',
  'Lens': '朗斯', 'Angers': '昂热', 'Troyes': '特鲁瓦', 'Marseille': '马赛', 'Le Mans': '勒芒',
  'AJ Auxerre': '欧塞尔', 'Le Havre AC': '勒阿弗尔', 'Toulouse': '图卢兹', 'Nice': '尼斯',
  'Nashville SC': '纳什维尔SC', 'Inter Miami CF': '迈阿密国际', 'New England Revolution': '新英格兰革命',
  'Charlotte FC': '夏洛特FC', 'Chicago Fire FC': '芝加哥火焰', 'Orlando City SC': '奥兰多城', 'Philadelphia Union': '费城联合',
  'New York City FC': '纽约城FC', 'FC Cincinnati': '辛辛那提FC', 'Red Bull New York': '纽约红牛', 'D.C. United': '华盛顿特区联',
  'Toronto FC': '多伦多FC', 'Columbus Crew': '哥伦布机员', 'Atlanta United FC': '亚特兰大联', 'CF Montréal': '蒙特利尔冲击',
  'Vancouver Whitecaps': '温哥华白浪', 'Houston Dynamo FC': '休斯顿迪纳摩', 'FC Dallas': '达拉斯FC',
  'San Jose Earthquakes': '圣何塞地震', 'St. Louis CITY SC': '圣路易斯城', 'LAFC': '洛杉矶FC',
  'Colorado Rapids': '科罗拉多急流', 'Portland Timbers': '波特兰伐木工', 'San Diego FC': '圣迭戈FC', 'LA Galaxy': '洛杉矶银河',
  'Real Salt Lake': '皇家盐湖城', 'Minnesota United FC': '明尼苏达联', 'Austin FC': '奥斯汀FC',
  'Seattle Sounders FC': '西雅图海湾人', 'Sporting Kansas City': '堪萨斯城竞技',
  'Al Hilal': '利雅得新月', 'Al Ittihad': '吉达联合', 'Al Nassr': '利雅得胜利', 'Al Qadsiah': '胡拜尔库迪西亚',
  'Neom SC': '新未来城SC', 'Al Ahli': '吉达国民', 'Al Kholood': '卡赫利德', 'Al Diriyah': '迪里耶',
  'Al Ettifaq': '达曼协作', 'Al Hazem': '哈兹姆', 'Al Riyadh': '利雅得体育', 'Al Fayha': '费哈',
  'Al Khaleej': '萨伊哈特', 'Al Shabab': '利雅得青年', 'Al Fateh': '法塔赫', 'Al Faisaly': '哈萨征服',
  'Al Taawoun': '布赖代合作', 'Abha': '阿布哈',
  'Sporting CP': '葡萄牙体育', 'AEK Athens': '雅典AEK', 'Shakhtar Donetsk': '顿涅茨克矿工',
  'Fenerbahce': '费内巴切', 'PSV Eindhoven': '埃因霍温', 'Club Brugge': '布鲁日', 'Slavia Prague': '布拉格斯拉维亚',
  'LASK Linz': '林茨', 'Galatasaray': '加拉塔萨雷', 'Viking FK': '维京', 'FC Porto': '波尔图',
  'Feyenoord Rotterdam': '费耶诺德', 'Sabah FK': '萨巴巴', 'Slovan Bratislava': '布拉迪斯拉发斯洛万', 'Bodo/Glimt': '博多闪耀',
};

const PLAYER = {
  'Erling Haaland': '哈兰德', 'João Pedro': '若昂·佩德罗', 'Bruno Fernandes': 'B费', 'Kevin Schade': '凯文·沙德',
  'Marcus Tavernier': '马库斯·塔弗尼埃', 'Morgan Rogers': '摩根·罗杰斯', 'Bukayo Saka': '萨卡',
  'Alexander Isak': '伊萨克', 'Leif Davis': '莱夫·戴维斯', 'Bryan Mbeumo': '姆贝乌莫',
  'Daichi Kamada': '镰田大地', 'Evanilson': '埃瓦尼尔森', 'Cody Gakpo': '加克波', 'Antoine Semenyo': '塞梅尼奥',
  'Morgan Gibbs-White': '吉布斯-怀特', 'Pascal Gross': '帕斯卡尔·格罗斯', 'Cole Palmer': '帕尔默',
  'Julio Enciso': '胡利奥·恩西索', 'Maxim De Cuyper': '德凯佩尔',
  'Kylian Mbappé': '姆巴佩', 'Raphinha': '拉菲尼亚', 'Lamine Yamal': '亚马尔', 'Sergio Camello': '卡梅略',
  'Pierre-Emerick Aubameyang': '奥巴梅扬', 'Roberto Fernández': '罗伯托·费尔南德斯', 'Yassir Zabiri': '扎比里',
  'Ante Budimir': '布迪米尔', 'Fermín López': '费尔明·洛佩斯', 'Lucas Boyé': '博耶',
  'Anthony Gordon': '安东尼·戈登', 'Vinícius Júnior': '维尼修斯', 'Unai López': '乌奈·洛佩斯',
  'Javi Hernandez': '哈维·埃尔南德斯', 'Ángel Pérez': '安赫尔·佩雷斯', 'Mariano Díaz': '马里亚诺',
  'Mikel Oyarzabal': '奥亚萨瓦尔', 'Dávid Hancko': '汉茨科',
  'Donyell Malen': '马伦', 'Antonio Raimondo': '安东尼奥·雷蒙多', 'Davide Frattesi': '弗拉泰西',
  'Franco Mastantuono': '马斯塔努托', 'Lassana Coulibaly': '库利巴利', 'Hassane Kamara': '卡马拉',
  'Giorgi Kvernadze': '克韦尔纳泽', 'Jurgen Ekkelenkamp': '埃克伦坎普', 'Daniel Maldini': '丹尼尔·马尔蒂尼',
  'Rasmus Højlund': '霍伊伦', 'Paulo Dybala': '迪巴拉', 'Andy Diouf': '迪乌夫', 'Michel Adopo': '阿多波',
  'Mattia Zaccagni': '扎卡尼', 'Ricardo Mangas': '曼加斯', 'Gianluca Busio': '布西奥',
  'Samuel Chukwueze': '丘库埃泽', 'Adrien Rabiot': '拉比奥', 'Keinan Davis': '戴维斯', 'Ivan Ilic': '伊利奇',
  'Phillip Tietz': '蒂茨', 'Igor Matanovic': '马塔诺维奇', 'Yuito Suzuki': '铃木唯人',
  'Michael Gregoritsch': '格雷戈里奇', 'Younes Ebnoutalib': '埃布努塔利布', 'Patrik Schick': '希克',
  'Maurice Krattenmacher': '克拉滕马赫', 'Maximilian Eggestein': '埃格施泰因', 'Serhou Guirassy': '吉拉西',
  'Yannick Engelhardt': '恩格尔哈特', 'Matthias Ginter': '金特尔', 'Adam Daghim': '达吉姆',
  'Marco Grüll': '格吕尔', 'Fabian Rieder': '里德尔', 'Miguel Gutiérrez': '米格尔·古铁雷斯',
  'Josip Juranovic': '尤拉诺维奇', 'Antonio Nusa': '努萨', 'Vladimír Coufal': '曹法尔', 'Sheraldo Becker': '贝克尔',
  'Amine Gouiri': '古伊里', 'Lassine Sinayoko': '西纳约科', 'Kamory Doumbia': '敦比亚',
  'Florian Thauvin': '托万', 'Esteban Lepaul': '勒波尔', 'Louis Mafouta': '马福塔', 'Paris Brunner': '布鲁纳',
  'Ferran Torres': '费兰·托雷斯', 'Tiago Santos': '蒂亚戈·桑托斯', 'Marquinhos': '马尔基尼奥斯',
  'Cristian Cásseres Jr.': '卡塞雷斯', 'Panos Katseris': '卡特塞里斯', 'Aleksandr Golovin': '戈洛温',
  'Adil Bourabaa': '布拉巴', 'Sebastian Nanasi': '纳纳西', 'Adrien Thomasson': '托马松', 'Fabián Ruiz': '法比安·鲁伊斯',
  'Olivier Giroud': '吉鲁', 'Pavel Sulc': '苏尔茨', 'Ousmane Camara': '卡马拉',
  'Lionel Messi': '梅西', 'Petar Musa': '穆萨', 'Nicolás Fernández': '尼古拉斯·费尔南德斯',
  'Brian White': '布赖恩·怀特', 'Sam Surridge': '萨里奇', 'Tai Baribo': '巴里博', 'Denis Bouanga': '布安加',
  'Guilherme Augusto': '吉列尔梅', 'Prince Owusu': '奥乌苏', 'Kévin Denkey': '登凯',
  'Joaquín Pereyra': '佩雷拉', 'Anders Dreyer': '德雷尔', 'Son Heung-Min': '孙兴慜', 'Evander': '埃万德',
  'Joaquín Valiente': '瓦连特', 'Cristian Espinoza': '埃斯皮诺萨', 'Rodrigo De Paul': '德保罗',
  'Niko Tsakiris': '察基里斯', 'Justin Ellis': '埃利斯',
  'Ivan Toney': '托尼', 'Alexandre Lacazette': '拉卡泽特', 'Amadou Koné': '科内',
  'Sergej Milinkovic-Savic': '米林科维奇-萨维奇', 'Steven Bergwijn': '贝尔温', 'Iker Kortajarena': '科尔塔哈雷纳',
  'Mateo Retegui': '雷特吉', 'Youssef En-Nesyri': '恩内斯里', 'George Ilenikhena': '伊莱尼凯纳',
  'Rúben Neves': '鲁本·内维斯', 'Crysencio Summerville': '萨默维尔', 'Álvaro Medrán': '梅德兰',
  'Óscar Rodríguez': '奥斯卡·罗德里格斯', 'Josh Brownhill': '布朗希尔', 'Coba da Costa': '达科斯塔',
  'Sadio Mané': '马内', 'Eduard Spertsyan': '斯佩尔茨扬', 'Francisco Trincão': '特林康', 'Julien Domingues': '多明格斯',
  'Ermedin Demirovic': '德米罗维奇', 'Danijel Sturm': '什图尔姆', 'Michael Olise': '奥利塞',
  'Marc Bartra': '巴尔特拉', 'Ousmane Dembélé': '登贝莱', 'Nico Paz': '尼科·帕斯', 'Deniz Undav': '温达夫',
  'Pau Torres': '保·托雷斯', 'Maghnes Akliouche': '阿克利乌什', 'João Gomes': '若昂·戈麦斯',
  'Georges Mikautadze': '米卡乌塔泽', 'Angelo Stiller': '施蒂勒',
};

const zh = (dict, name) => (dict[name] ? `${dict[name]} ${name}` : name);
const teamZh = n => zh(TEAM, n);
const playerZh = n => zh(PLAYER, n);

// ---- 解析榜单 ----
function standingsRows(lg) {
  const t0 = lg.standings.tables[0].rows;
  const t1 = lg.standings.tables[1].rows;
  const out = [];
  let section = null;
  for (let i = 0; i < t0.length; i++) {
    const label = (t0[i][0] || '').trim();
    if (/CONFERENCE/i.test(label)) { section = /WEST/i.test(label) ? 'west' : 'east'; continue; }
    if (!label) continue;
    const stats = t1[i] || [];
    if (stats.length < 8) continue;
    const [rankRaw, teamRaw] = label.split('\n');
    const rank = parseInt(rankRaw, 10);
    const team = (teamRaw || '').trim();
    if (!team || !Number.isFinite(rank)) continue;
    out.push({rank, team, section, row: [rank, teamZh(team), +stats[0], +stats[1], +stats[2], +stats[3], +stats[4], +stats[5], stats[6], +stats[7]]});
  }
  return out;
}

function topRows(lg, titleRe, key) {
  const t = lg.scoring.tables.find(x => titleRe.test(x.title || ''));
  if (!t) return [];
  const rows = t.rows.filter(r => r.length >= 5 && r[1] && r[2]);
  const out = [];
  let lastRank = 0;
  for (const r of rows.slice(0, 10)) {
    const rk = parseInt(r[1 - 0] && r[0], 10);
    const rank = Number.isFinite(rk) && rk > 0 ? rk : lastRank;
    lastRank = rank;
    out.push([rank, playerZh(r[1]), teamZh(r[2]), +r[4]]);
  }
  return out;
}

const standingsData = {};
const scorersData = {};
const assistsData = {};

for (const lg of raw.leagues) {
  const rows = standingsRows(lg);
  if (lg.key === 'mls') {
    standingsData.mls_east = rows.filter(r => r.section === 'east').map(r => r.row);
    standingsData.mls_west = rows.filter(r => r.section === 'west').map(r => r.row);
  } else {
    standingsData[lg.key] = rows.map(r => r.row);
  }
  const sc = topRows(lg, /Top Scorers/i, 'G');
  const as = topRows(lg, /Top Assists/i, 'A');
  if (lg.key === 'mls') { scorersData.mls = sc; assistsData.mls = as; }
  else { scorersData[lg.key] = sc; assistsData[lg.key] = as; }
}

// ---- 资讯卡片 ----
const A = {};
for (const a of news.articles) if (a.h1 && a.h1 !== 'Soccer') A[a.url] = a;

const cards = [
  {league: 'toutiao', team: '阿根廷国家队', tags: ['mls'], title: '梅西入选阿根廷10月6日告别赛名单 纪念碑球场迎国家队谢幕战',
   summary: '阿根廷队公布10月6日对阵贝宁的友谊赛名单，39岁的梅西（Lionel Messi）入选。该场比赛将在布宜诺斯艾利斯纪念碑球场进行，作为其国家队生涯的告别战。梅西2022年随队夺得世界杯冠军。',
   src: 'ESPN', url: 'https://www.espn.com/soccer/story/_/id/49952015/lionel-messi-called-argentina-friendly-last-tango-farewell', time: '09-16'},
  {league: 'toutiao', team: '利雅得胜利', tags: ['saudi'], title: 'C罗遭遇加盟以来最大比分失利 利雅得胜利亚冠精英联赛0-4惨败',
   summary: '沙特冠军利雅得胜利在亚冠精英联赛首轮0-4不敌阿联酋球队阿尔艾因，这是C罗（Cristiano Ronaldo）加盟以来分差最大的一场失利。',
   src: 'ESPN', url: 'https://www.espn.com/soccer/story/_/id/49951684/cristiano-ronaldo-al-nassr-asian-champions-league-al-ain', time: '09-16'},
  {league: 'toutiao', team: '皇家马德里', tags: ['laliga'], title: '穆里尼奥：皇马客场3-2绝杀埃尔切 "我们赌上了一切"',
   summary: '西甲周中赛，皇家马德里客场3-2击败埃尔切，替补卡洛斯·埃斯皮第91分钟打进制胜球。主帅穆里尼奥（José Mourinho）赛后表示球队全力压上「赌上了一切」。',
   src: 'ESPN', url: 'https://www.espn.com/soccer/story/_/id/49952550/mourinho-risked-everything-subs-real-madrid-win', time: '09-16'},
  {league: 'toutiao', team: '阿森纳', tags: ['epl'], title: '16岁道曼联赛杯梅开二度 追平鲁尼保持的纪录',
   summary: '阿森纳青训小将马克斯·道曼（Max Dowman）在联赛杯客场击败伊普斯维奇的比赛中独中两元，成为继鲁尼之后第二位为英超俱乐部单场打进多球的16岁球员。',
   src: 'ESPN / BBC Sport', url: 'https://www.espn.com/soccer/story/_/id/49951994/arsenal-max-dowman-wayne-rooney-carabao-cup-ipswich-record-16', time: '09-16'},
  {league: 'toutiao', team: '英超裁判', tags: ['epl'], title: '韦布承认曼市德比VAR未考虑越位 裁判公司称"非常失望"',
   summary: '英超裁判公司主管霍华德·韦布（Howard Webb）就曼市德比中的VAR判罚作出回应，承认VAR甚至没有考虑费尔南德斯是否越位，并对此表示非常失望。',
   src: 'BBC Sport', url: 'https://www.bbc.com/sport/football/articles/cv4g5rp56p55o', time: '09-16'},
  {league: 'toutiao', team: '转会市场', tags: ['laliga', 'bundesliga'], title: '转会流言：巴萨紧盯凯恩与哈兰德 沃尔特马德或接替凯恩',
   summary: '周三转会流言汇总：巴塞罗那正在关注哈里·凯恩与哈兰德；德国前锋沃尔特马德（Nick Woltemade）可能成为凯恩在拜仁的替代者；曼联有意布兰斯韦特。',
   src: 'BBC Sport', url: 'https://www.bbc.com/sport/football/articles/cqzezjn3wzjpo', time: '09-16'},
  {league: 'toutiao', team: '巴塞罗那', tags: ['laliga'], title: '巴萨续约埃及前锋阿卜杜勒卡里姆 绰号"尼罗河哈兰德"',
   summary: '埃及前锋哈姆扎·阿卜杜勒卡里姆（Hamza Abdelkarim）与巴塞罗那签下新合同，他对「尼罗河哈兰德」的绰号感到欣喜。',
   src: 'ESPN', url: 'https://www.espn.com/soccer/story/_/id/49952712/barcelona-re-sign-egypt-striker-abdelkarim', time: '09-16'},
  {league: 'toutiao', team: '英超', tags: ['epl'], title: '英超周末复盘：争冠只剩阿森纳与曼城？VAR争议再度主导',
   summary: '英超第四轮曼城与阿森纳双双客场取胜，赫尔城、热刺、考文垂等队的表现引发讨论；本轮再度被VAR与裁判判罚争议主导。',
   src: 'ESPN', url: 'https://www.espn.com/soccer/story/_/id/49940737/judging-premier-league-overreactions-title-race-var-arsenal-man-city-hull-spurs-coventry-lampard', time: '09-16'},

  {league: 'epl', team: '英超', tags: [], title: '20支英超球队主帅排名：谁最先下课？',
   summary: 'ESPN 对英超20队主帅处境逐一排名，指出今夏之后英超主帅环境已进入一个新时代。',
   src: 'ESPN', url: 'https://www.espn.com/soccer/story/_/id/49945295/all-20-premier-league-teams-ranked-which-managers-fired-first', time: '09-16'},
  {league: 'epl', team: '布伦特福德', tags: [], title: '安德鲁斯：让裁判做回"人" VAR正在阻止他们做决定',
   summary: '联赛杯雷丁1-2布伦特福德赛后，布伦特福德主帅基思·安德鲁斯（Keith Andrews）批评VAR让裁判不敢做决定。布伦特福德本赛季英超4轮1胜3平保持不败。',
   src: 'BBC Sport', url: 'https://www.bbc.com/sport/football/articles/cxj06nmjl3l6o', time: '09-16'},
  {league: 'saudi', team: '利雅得胜利', tags: [], title: 'C罗随利雅得胜利亚冠精英联赛首轮0-4负阿尔艾因',
   summary: '沙特联赛卫冕冠军利雅得胜利亚冠精英联赛开局惨败，C罗遭遇加盟沙特以来最大分差失利。',
   src: 'ESPN', url: 'https://www.espn.com/soccer/story/_/id/49951684/cristiano-ronaldo-al-nassr-asian-champions-league-al-ain', time: '09-16'},
  {league: 'laliga', team: '皇家马德里', tags: [], title: '皇马客场3-2埃尔切 埃斯皮91分钟绝杀',
   summary: '西甲周中赛皇家马德里客场3-2险胜埃尔切，替补埃斯皮第91分钟打进制胜球，穆里尼奥赛后称球队「赌上了一切」。',
   src: 'ESPN', url: 'https://www.espn.com/soccer/story/_/id/49952550/mourinho-risked-everything-subs-real-madrid-win', time: '09-16'},
];

const counts = {};
for (const c of cards) counts[c.league] = (counts[c.league] || 0) + 1;
const total = cards.length;
const leagueLabel = {toutiao: '今日头条', epl: '英超', laliga: '西甲', seriea: '意甲', bundesliga: '德甲', ligue1: '法甲', mls: '美职联', saudi: '沙特联', ucl: '欧冠'};
const tagCls = {toutiao: 'tag-toutiao', epl: 'tag-epl', laliga: 'tag-laliga', seriea: 'tag-seriea', bundesliga: 'tag-bundesliga', ligue1: 'tag-ligue1', mls: 'tag-mls', saudi: 'tag-saudi', ucl: 'tag-ucl'};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const newsHtml = cards.map(c => `<!-- ${c.title.slice(0, 30)} -->
<div class="news-card" data-league="${c.league}">
  <div class="card-top">
    <span class="card-team">${esc(c.team)}</span>
    <span class="card-league ${tagCls[c.league]}">${leagueLabel[c.league]}</span>
${c.tags.map(t => `    <span class="card-league ${tagCls[t]}">${leagueLabel[t]}</span>`).join('\n')}
  </div>
  <div class="card-body">
    <div class="card-title">${esc(c.title)}</div>
    <div class="card-summary">${esc(c.summary)}</div>
  </div>
  <div class="card-footer">
    <span class="card-source"><a href="${esc(c.url)}" target="_blank">${esc(c.src)}</a></span>
    <span class="card-time">${c.time}</span>
  </div>
</div>`).join('\n\n');

const filterHtml = ['all', 'toutiao', 'epl', 'laliga', 'seriea', 'bundesliga', 'ligue1', 'mls', 'saudi', 'ucl']
  .map(k => {
    const n = k === 'all' ? total : (counts[k] || 0);
    const label = k === 'all' ? '全部' : (k === 'toutiao' ? '🔥 今日头条' : leagueLabel[k]);
    return `    <div class="filter-tab${k === 'all' ? ' active' : ''}" data-filter="${k}" onclick="filterNews('${k}')">${label} ${n}</div>`;
  }).join('\n');

const j = v => JSON.stringify(v);
const dataBlocks = `const standingsData = ${j(standingsData)};\n\nconst scorersData = ${j(scorersData)};\n\nconst assistsData = ${j(assistsData)};`;

let html = tpl;
html = html.replace(/const standingsData = \{[\s\S]*?\n\};/, dataBlocks.slice(0, dataBlocks.indexOf('\n\nconst scorersData')));
html = html.replace(/const scorersData = \{[\s\S]*?\n\};/, dataBlocks.slice(dataBlocks.indexOf('const scorersData'), dataBlocks.indexOf('\n\nconst assistsData')));
html = html.replace(/const assistsData = \{[\s\S]*?\n\};/, dataBlocks.slice(dataBlocks.indexOf('const assistsData')));

html = html.replace(/<div class="news-grid" id="news-grid">[\s\S]*?\n  <\/div>\n<\/div>\n\n<div class="footer">/, `<div class="news-grid" id="news-grid">\n${newsHtml}\n  </div>\n</div>\n\n<div class="footer">`);
html = html.replace(/<div class="news-filter-tabs">[\s\S]*?<\/div>\n  <div class="news-grid"/, `<div class="news-filter-tabs">\n${filterHtml}\n  </div>\n  <div class="news-grid"`);
html = html.replace('<span class="news-count" id="news-count">全部 50 条</span>', `<span class="news-count" id="news-count">全部 ${total} 条</span>`);
html = html.replace(/<span class="news-update-time">更新 [\d-]+<\/span>/, `<span class="news-update-time">更新 ${D}</span>`);
html = html.replace(/<div class="update-time">数据截止时间：[^<]*<\/div>/, `<div class="update-time">数据截止时间：2026-09-16 13:36（北京时间） · 赛季阶段：2026-27 赛季进行中 / 美职联 2025 赛季常规赛</div>`);
// 缺数据不得静默回退英超：移除模板中的 || scorersData.epl / || assistsData.epl 兜底
html = html.replace(/scorersData\[currentLeague\] \|\| scorersData\.epl/g, 'scorersData[currentLeague] || []')
  .replace(/assistsData\[currentLeague\] \|\| assistsData\.epl/g, 'assistsData[currentLeague] || []');

// 模板中「美职联」积分榜分支引用了未定义的 header / eastRows，会导致切换该 Tab 报错；
// 此处改为与西区一致地按 mls_east 渲染，仅修数据绑定，不改动版式。
html = html.replace(/html \+= '<table class="standings-table">' \+ header \+ eastRows\.join\(''\) \+ '<\/table>';/,
  "html += buildStandingsTable(standingsData.mls_east, ['排名','球队','赛','胜','平','负','进','失','净','积分']);");

html = html.replace(/<title>[^<]*<\/title>/, `<title>足球日报 - ${D}</title>`);
// 页脚同样不得残留模板旧日期
html = html.replace(/<p>数据截止时间：[^<]*<\/p>/, `<p>数据截止时间：2026-09-16 13:36（北京时间）| 本轮三榜逐联赛核验：英超 / 西甲 / 意甲 / 德甲 / 法甲 / 美职联（东、西区）/ 沙特联 / 欧冠</p>`);

const outDir = path.join(ROOT, 'reports/daily', D);
fs.mkdirSync(outDir, {recursive: true});
const finalPath = path.join(outDir, 'football.html');
const tmp = path.join(WORK, 'football.html.tmp');
fs.writeFileSync(tmp, html);
fs.renameSync(tmp, finalPath);
console.log('WROTE ' + finalPath);
console.log('cards=' + total + ' ' + JSON.stringify(counts));
console.log('leagues standings=' + Object.keys(standingsData).join(','));
console.log('scorers=' + Object.entries(scorersData).map(([k, v]) => k + ':' + v.length).join(' '));
console.log('assists=' + Object.entries(assistsData).map(([k, v]) => k + ':' + v.length).join(' '));
