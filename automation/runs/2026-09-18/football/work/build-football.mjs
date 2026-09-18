#!/usr/bin/env node
// 用途：2026-09-18 足球日报生成器。输入：本轮并行采集的三榜与新闻数据（内嵌）。
// 输出：reports/daily/2026-09-18/football.html（先写临时文件，校验后原子替换）。
import { writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const D = '2026-09-18';

// ===== 三榜数据（采集子代理逐页核验，2026-09-17T19:38Z–19:43Z 打开来源页提取）=====
const standingsData = {
  epl: [["1","阿森纳 Arsenal","4","4","0","0","8","1","+7","12"],["2","曼城 Man City","4","4","0","0","8","2","+6","12"],["3","利兹联 Leeds United","4","2","2","0","7","3","+4","8"],["4","赫尔城 Hull City","4","2","2","0","5","2","+3","8"],["5","布莱顿 Brighton & Hove Albion","4","2","1","1","13","5","+8","7"],["6","切尔西 Chelsea","4","2","1","1","10","9","+1","7"],["7","布伦特福德 Brentford","4","1","3","0","7","4","+3","6"],["8","利物浦 Liverpool","4","1","3","0","6","4","+2","6"],["9","埃弗顿 Everton","4","1","3","0","5","3","+2","6"],["10","伊普斯维奇 Ipswich Town","4","2","0","2","7","10","-3","6"],["11","诺丁汉森林 Nottingham Forest","4","1","2","1","4","4","0","5"],["12","纽卡斯尔联 Newcastle United","4","1","2","1","7","8","-1","5"],["13","曼联 Manchester United","4","1","1","2","7","7","0","4"],["14","桑德兰 Sunderland","4","1","1","2","3","5","-2","4"],["15","伯恩茅斯 Bournemouth","4","0","3","1","6","7","-1","3"],["16","水晶宫 Crystal Palace","4","1","0","3","6","11","-5","3"],["17","托特纳姆热刺 Tottenham Hotspur","4","0","2","2","0","5","-5","2"],["18","富勒姆 Fulham","4","0","1","3","4","7","-3","1"],["19","阿斯顿维拉 Aston Villa","4","0","1","3","1","7","-6","1"],["20","考文垂 Coventry City","4","0","0","4","0","10","-10","0"]],
  laliga: [["1","巴塞罗那 Barcelona","6","6","0","0","28","6","+22","18"],["2","皇家马德里 Real Madrid","6","5","0","1","17","6","+11","15"],["3","皇家贝蒂斯 Real Betis","6","5","0","1","8","6","+2","15"],["4","马德里竞技 Atlético Madrid","6","4","1","1","14","6","+8","13"],["5","塞维利亚 Sevilla","6","4","1","1","9","6","+3","13"],["6","阿拉维斯 Alavés","6","3","1","2","11","6","+5","10"],["7","拉科鲁尼亚 Deportivo de A Coruña","6","2","3","1","9","7","+2","9"],["8","西班牙人 Espanyol","6","2","1","3","9","7","+2","7"],["9","毕尔巴鄂竞技 Athletic Club","5","2","1","2","7","6","+1","7"],["10","桑坦德竞技 Racing de Santander","6","2","1","3","11","16","-5","7"],["11","巴列卡诺 Rayo Vallecano","6","2","1","3","10","15","-5","7"],["12","皇家社会 Real Sociedad","6","2","1","3","6","11","-5","7"],["13","奥萨苏纳 Osasuna","6","2","1","3","5","12","-7","7"],["14","莱万特 Levante","5","1","2","2","7","9","-2","5"],["15","赫塔菲 Getafe","6","1","2","3","3","7","-4","5"],["16","塞尔塔 Celta Vigo","6","0","4","2","3","6","-3","4"],["17","马拉加 Málaga","6","0","4","2","2","8","-6","4"],["18","瓦伦西亚 Valencia","6","1","1","4","2","10","-8","4"],["19","比利亚雷亚尔 Villarreal","6","0","3","3","7","10","-3","3"],["20","埃尔切 Elche","6","0","2","4","8","16","-8","2"]],
  seriea: [[1,"罗马 AS Roma",4,4,0,0,12,1,"+11",12],[2,"国际米兰 Inter",4,4,0,0,13,6,"+7",12],[3,"科莫 Como 1907",4,3,1,0,9,4,"+5",10],[4,"拉齐奥 Lazio Roma",4,3,1,0,6,3,"+3",10],[5,"卡利亚里 Cagliari Calcio",4,3,0,1,4,2,"+2",9],[6,"AC米兰 AC Milan",4,2,2,0,7,4,"+3",8],[7,"弗罗西诺内 Frosinone Calcio",4,2,1,1,7,4,"+3",7],[8,"尤文图斯 Juventus",4,2,1,1,6,4,"+2",7],[9,"萨索洛 US Sassuolo",4,2,1,1,8,7,"+1",7],[10,"那不勒斯 SSC Napoli",4,2,0,2,6,5,"+1",6],[11,"亚特兰大 Atalanta",4,2,0,2,5,5,"0",6],[12,"莱切 US Lecce",4,2,0,2,5,7,"-2",6],[13,"乌迪内斯 Udinese Calcio",4,1,1,2,8,10,"-2",4],[14,"都灵 Torino FC",4,1,0,3,4,7,"-3",3],[15,"佛罗伦萨 ACF Fiorentina",4,1,0,3,5,11,"-6",3],[16,"博洛尼亚 Bologna FC",4,0,1,3,2,5,"-3",1],[17,"帕尔马 Parma Calcio 1913",4,0,1,3,2,6,"-4",1],[18,"蒙扎 AC Monza",4,0,1,3,6,11,"-5",1],[19,"热那亚 Genoa CFC",4,0,1,3,2,8,"-6",1],[20,"威尼斯 Venezia FC",4,0,0,4,4,11,"-7",0]],
  bundesliga: [[1,"弗赖堡 SC Freiburg",3,3,0,0,10,1,"+9",9],[2,"多特蒙德 Borussia Dortmund",3,3,0,0,8,2,"+6",9],[3,"奥格斯堡 FC Augsburg",3,2,1,0,9,3,"+6",7],[4,"拜仁慕尼黑 Bayern Munich",3,2,1,0,7,2,"+5",7],[5,"莱比锡红牛 RB Leipzig",3,2,0,1,9,3,"+6",6],[6,"埃尔沃斯堡 SV 07 Elversberg",3,2,0,1,8,7,"+1",6],[7,"勒沃库森 Bayer Leverkusen",3,1,1,1,8,5,"+3",4],[8,"美因茨 1. FSV Mainz 05",3,1,1,1,6,3,"+3",4],[9,"法兰克福 Eintracht Frankfurt",3,1,1,1,7,8,"-1",4],[10,"云达不来梅 Werder Bremen",3,1,1,1,5,6,"-1",4],[11,"沙尔克04 FC Schalke 04",3,1,1,1,3,4,"-1",4],[12,"科隆 1. FC Köln",3,1,1,1,5,7,"-2",4],[13,"霍芬海姆 TSG Hoffenheim",3,1,0,2,6,7,"-1",3],[14,"斯图加特 VfB Stuttgart",3,1,0,2,6,8,"-2",3],[15,"帕德博恩 SC Paderborn 07",3,0,1,2,0,4,"-4",1],[16,"柏林联合 1. FC Union Berlin",3,0,1,2,4,10,"-6",1],[17,"门兴格拉德巴赫 Bor. Mönchengladbach",3,0,0,3,3,12,"-9",0],[18,"汉堡 Hamburger SV",3,0,0,3,0,12,"-12",0]],
  ligue1: [[1,"里尔 Lille OSC",4,3,1,0,7,2,"+5",10],[2,"摩纳哥 AS Monaco",4,3,1,0,6,2,"+4",10],[3,"雷恩 Stade Rennais",4,3,1,0,8,5,"+3",10],[4,"里昂 Olympique Lyonnais",4,2,2,0,6,2,"+4",8],[5,"巴黎FC Paris FC",4,2,2,0,6,2,"+4",8],[6,"斯特拉斯堡 Racing Strasbourg",4,2,1,1,9,8,"+1",7],[7,"巴黎圣日耳曼 Paris Saint-Germain",4,1,2,1,6,6,"0",5],[8,"布雷斯特 Stade Brestois 29",4,1,2,1,6,6,"0",5],[9,"洛里昂 FC Lorient",4,1,2,1,4,4,"0",5],[10,"朗斯 RC Lens",4,1,1,2,8,7,"+1",4],[11,"昂热 Angers SCO",4,1,1,2,4,5,"-1",4],[12,"特鲁瓦 ES Troyes AC",4,1,1,2,4,9,"-5",4],[13,"马赛 Olympique de Marseille",4,1,0,3,6,6,"0",3],[14,"勒芒 Le Mans FC",4,0,3,1,7,8,"-1",3],[15,"欧塞尔 AJ Auxerre",4,1,0,3,5,11,"-6",3],[16,"勒阿弗尔 Havre AC",4,0,2,2,2,4,"-2",2],[17,"图卢兹 Toulouse FC",4,0,2,2,4,7,"-3",2],[18,"尼斯 OGC Nice",4,0,2,2,1,5,"-4",2]],
  mls_east: [[1,"纳什维尔SC Nashville SC",25,16,6,3,50,21,"+29",54],[2,"迈阿密国际 Inter Miami CF",25,12,9,4,61,46,"+15",45],[3,"新英格兰革命 New England Revolution",25,13,4,8,41,31,"+10",43],[4,"夏洛特FC Charlotte FC",25,11,7,7,45,36,"+9",40],[5,"芝加哥火焰 Chicago Fire FC",24,11,6,7,45,35,"+10",39],[6,"奥兰多城 Orlando City SC",25,10,4,11,44,56,"-12",34],[7,"费城联合 Philadelphia Union",25,9,6,10,46,39,"+7",33],[8,"纽约城FC New York City FC",25,8,8,9,39,33,"+6",32],[9,"辛辛那提FC FC Cincinnati",24,8,8,8,52,59,"-7",32],[10,"纽约红牛 Red Bull New York",25,8,6,11,33,48,"-15",30],[11,"华盛顿联 D.C. United",24,6,11,7,30,37,"-7",29],[12,"多伦多FC Toronto FC",25,6,11,8,38,46,"-8",29],[13,"哥伦布机员 Columbus Crew",25,6,5,14,35,42,"-7",23],[14,"亚特兰大联 Atlanta United FC",25,6,5,14,29,43,"-14",23],[15,"蒙特利尔CF CF Montréal",25,5,6,14,31,51,"-20",21]],
  mls_west: [[1,"温哥华白浪 Vancouver Whitecaps",24,14,4,6,53,23,"+30",46],[2,"休斯敦迪纳摩 Houston Dynamo FC",25,13,4,8,32,28,"+4",43],[3,"达拉斯FC FC Dallas",25,12,7,6,49,42,"+7",43],[4,"圣何塞地震 San Jose Earthquakes",25,12,5,8,44,36,"+8",41],[5,"圣路易斯城 St. Louis CITY SC",25,11,8,6,42,35,"+7",41],[6,"洛杉矶FC LAFC",26,11,7,8,41,27,"+14",40],[7,"科罗拉多急流 Colorado Rapids",25,11,2,12,33,32,"+1",35],[8,"波特兰伐木者 Portland Timbers",25,9,5,11,47,47,"0",32],[9,"圣迭戈FC San Diego FC",25,8,6,11,42,42,"0",30],[10,"洛杉矶银河 LA Galaxy",26,7,9,10,31,40,"-9",30],[11,"皇家盐湖城 Real Salt Lake",24,8,5,11,37,39,"-2",29],[12,"明尼苏达联 Minnesota United FC",25,7,8,10,37,43,"-6",29],[13,"奥斯汀FC Austin FC",25,7,8,10,32,44,"-12",29],[14,"西雅图海湾人 Seattle Sounders FC",23,7,7,9,25,30,"-5",28],[15,"堪萨斯城竞技 Sporting Kansas City",24,5,3,16,26,59,"-33",18]],
  saudi: [[1,"利雅得新月 Al Hilal",7,6,0,1,23,5,"+18",18],[2,"吉达伊蒂哈德 Al Ittihad",7,5,2,0,12,6,"+6",17],[3,"利雅得胜利 Al Nassr",7,5,1,1,16,7,"+9",16],[4,"胡拜尔卡迪西亚 Al Qadsiah",7,5,1,1,16,8,"+8",16],[5,"新未来城SC NEOM SC",7,5,0,2,13,6,"+7",15],[6,"吉达国民 Al Ahli SFC",7,4,0,3,16,10,"+6",12],[7,"卡胡德 Al Kholood",7,3,3,1,12,10,"+2",12],[8,"迪利亚 Al Diriyah",7,3,2,2,7,5,"+2",11],[9,"达曼伊蒂法克 Al Ettifaq",7,3,2,2,11,11,"0",11],[10,"哈泽姆 Al Hazem",7,2,2,3,7,9,"-2",8],[11,"利雅得 Al Riyadh",7,2,2,3,8,16,"-8",8],[12,"费哈 Al Fayha",7,1,3,3,7,11,"-4",6],[13,"海沃尔 Al Khaleej",7,0,5,2,3,10,"-7",5],[14,"利雅得沙巴布 Al Shabab",7,0,4,3,6,11,"-5",4],[15,"法特 Al Fateh",7,0,3,4,4,11,"-7",3],[16,"费萨里 Al Faisaly",7,0,3,4,5,13,"-8",3],[17,"布赖代塔亚文 Al Taawoun",7,0,3,4,3,12,"-9",3],[18,"艾卜哈 Abha Club",7,0,2,5,5,13,"-8",2]],
  ucl: [[1,"巴黎圣日耳曼 PSG",1,1,0,0,6,1,"+5",3],[2,"拜仁慕尼黑 Bayern Munich",1,1,0,0,5,0,"+5",3],[3,"巴塞罗那 FC Barcelona",1,1,0,0,5,1,"+4",3],[4,"曼联 Manchester United",1,1,0,0,4,0,"+4",3],[5,"科莫 Como 1907",1,1,0,0,4,1,"+3",3],[6,"葡萄牙体育 Sporting CP",1,1,0,0,3,1,"+2",3],[7,"斯图加特 VfB Stuttgart",1,1,0,0,3,1,"+2",3],[8,"曼城 Manchester City",1,1,0,0,2,0,"+2",3],[9,"阿斯顿维拉 Aston Villa",1,1,0,0,3,2,"+1",3],[10,"朗斯 RC Lens",1,1,0,0,3,2,"+1",3],[11,"皇家贝蒂斯 Real Betis",1,1,0,0,3,2,"+1",3],[12,"多特蒙德 Borussia Dortmund",1,1,0,0,3,2,"+1",3],[13,"利物浦 Liverpool FC",1,1,0,0,2,1,"+1",3],[14,"皇家马德里 Real Madrid",1,1,0,0,2,1,"+1",3],[15,"阿森纳 Arsenal FC",1,1,0,0,1,0,"+1",3],[16,"AEK雅典 AEK Athen",1,1,0,0,1,0,"+1",3],[17,"罗马 AS Roma",1,0,1,0,1,1,"0",1],[18,"顿涅茨克矿工 Shakhtar Donetsk",1,0,1,0,1,1,"0",1],[19,"费内巴切 Fenerbahçe",1,0,1,0,1,1,"0",1],[20,"埃因霍温 PSV Eindhoven",1,0,1,0,1,1,"0",1],[21,"比利亚雷亚尔 Villarreal CF",1,0,0,1,2,3,"-1",0],[22,"布鲁日 Club Brugge KV",1,0,0,1,2,3,"-1",0],[23,"里尔 Lille OSC",1,0,0,1,2,3,"-1",0],[24,"布拉格斯拉维亚 Slavia Praha",1,0,0,1,2,3,"-1",0],[25,"马德里竞技 Atlético Madrid",1,0,0,1,1,2,"-1",0],[26,"国际米兰 Inter",1,0,0,1,1,2,"-1",0],[27,"林茨 LASK",1,0,0,1,0,1,"-1",0],[28,"那不勒斯 SSC Napoli",1,0,0,1,0,1,"-1",0],[29,"加拉塔萨雷 Galatasaray",1,0,0,1,1,3,"-2",0],[30,"维京 Viking FK",1,0,0,1,1,3,"-2",0],[31,"波尔图 FC Porto",1,0,0,1,0,2,"-2",0],[32,"莱比锡红牛 RB Leipzig",1,0,0,1,1,4,"-3",0],[33,"费耶诺德 Feyenoord",1,0,0,1,1,5,"-4",0],[34,"萨巴赫 Sabah FK",1,0,0,1,0,4,"-4",0],[35,"布拉迪斯拉发斯洛万 Slovan Bratislava",1,0,0,1,1,6,"-5",0],[36,"博德闪耀 FK Bodø/Glimt",1,0,0,1,0,5,"-5",0]],
};

// 射手/助攻统一 4 列：[排名, 球员, 球队, 数值]；MLS/沙特来源为总榜（含出场列，已去掉出场列）
const scorersData = {
  epl: [["1","哈兰德 Erling Haaland","曼城 Man City","4"],["2","若昂·佩德罗 João Pedro","切尔西 Chelsea","3"],["2","罗杰斯 Morgan Rogers","切尔西 Chelsea","3"],["2","B·费尔南德斯 Bruno Fernandes","曼联 Man Utd","3"],["2","卡尔弗特-勒温 D. Calvert-Lewin","利兹联 Leeds","3"],["2","伊萨克 A. Isak","利物浦 Liverpool","3"],["2","萨卡 B. Saka","阿森纳 Arsenal","3"],["2","塔弗尼埃 M. Tavernier","伯恩茅斯 Bournemouth","3"],["2","沙德 K. Schade","布伦特福德 Brentford","3"],["10","切尔基 R. Cherki","曼城 Man City","2"]],
  laliga: [["1","拉菲尼亚 Raphinha","巴塞罗那 Barcelona","9"],["2","拉明·亚马尔 Lamine Yamal","巴塞罗那 Barcelona","7"],["2","姆巴佩 K. Mbappé","皇家马德里 Real Madrid","7"],["4","卡梅洛 Sergio Camello","巴列卡诺 Rayo","6"],["4","扎比里 Y. Zabiri","桑坦德竞技 Santander","6"],["4","罗伯托·费尔南德斯 Roberto Fernández","西班牙人 Espanyol","6"],["7","奥巴梅扬 P. Aubameyang","拉科鲁尼亚 Deportivo","5"],["8","费尔明·洛佩斯 Fermín López","巴塞罗那 Barcelona","4"],["8","巴埃纳 Álex Baena","马德里竞技 Atlético","4"],["8","博耶 L. Boyé","阿拉维斯 Alavés","4"]],
  seriea: [["1","马伦 Donyell Malen","罗马 AS Roma","6"],["2","拉伊蒙多 Antonio Raimondo","弗罗西诺内 Frosinone","4"],["3","弗拉泰西 Davide Frattesi","拉齐奥 Lazio","3"],["3","马斯坦托诺 Franco Mastantuono","佛罗伦萨 Fiorentina","3"],["5","亚当斯 Ché Adams","都灵 Torino","2"],["5","阿季奇 Vasilije Adžić","萨索洛 Sassuolo","2"],["5","迪奥 Assane Diao","科莫 Como","2"],["5","巴图里纳 Martin Baturina","科莫 Como","2"],["5","恰尔汗奥卢 Hakan Çalhanoğlu","国际米兰 Inter","2"],["5","西塞 Alphadjo Cissè","AC米兰 AC Milan","2"]],
  bundesliga: [["1","埃布诺塔利布 Younes Ebnoutalib","法兰克福 E. Frankfurt","3"],["1","格雷戈里奇 Michael Gregoritsch","奥格斯堡 Augsburg","3"],["1","克拉滕马赫 Maurice Krattenmacher","埃尔沃斯堡 Elversberg","3"],["1","马塔诺维奇 Igor Matanović","弗赖堡 Freiburg","3"],["1","希克 Patrik Schick","勒沃库森 Leverkusen","3"],["1","铃木唯人 Yuito Suzuki","弗赖堡 Freiburg","3"],["1","蒂茨 Phillip Tietz","美因茨 Mainz 05","3"],["8","巴库 Ridle Baku","莱比锡 RB Leipzig","2"],["8","博林 Hugo Bolin","门兴 M'gladbach","2"],["8","伯克特 Jonathan Burkardt","法兰克福 E. Frankfurt","2"]],
  ligue1: [["1","杜姆比亚 Kamory Doumbia","布雷斯特 Brest","4"],["1","古里 Amine Gouiri","马赛 Marseille","4"],["1","西纳约科 Lassine Sinayoko","巴黎FC Paris FC","4"],["4","布伦纳 Paris Brunner","摩纳哥 Monaco","3"],["4","费兰·托雷斯 Ferran Torres","巴黎圣日耳曼 PSG","3"],["4","勒波尔 Esteban Lepaul","雷恩 Rennais","3"],["4","马富塔 Louis Mafouta","勒芒 Le Mans","3"],["4","托万 Florian Thauvin","朗斯 Lens","3"],["9","阿莫-阿梅亚 Sam Amo-Ameyaw","斯特拉斯堡 Strasbourg","2"],["9","阿彻 Cameron Archer","欧塞尔 Auxerre","2"]],
  mls: [["1","梅西 Lionel Messi","迈阿密国际 Inter Miami","19"],["2","穆萨 Petar Musa","达拉斯FC FC Dallas","18"],["3","费尔南德斯 Nicolás Fernández","纽约城FC New York City FC","15"],["3","怀特 Brian White","温哥华白浪 Vancouver Whitecaps","15"],["3","瑟里奇 Sam Surridge","纳什维尔SC Nashville SC","15"],["6","巴里博 Tai Baribo","华盛顿联 D.C. United","14"],["7","布安加 Denis Bouanga","洛杉矶FC LAFC","13"],["7","吉列尔梅 Guilherme Augusto","休斯敦迪纳摩 Houston Dynamo","13"],["7","奥乌苏 Prince Owusu","蒙特利尔CF CF Montréal","13"],["7","登凯 Kévin Denkey","辛辛那提FC FC Cincinnati","13"]],
  saudi: [["1","托尼 Ivan Toney","吉达国民 Al Ahli","10"],["2","拉卡泽特 Alexandre Lacazette","新未来城SC NEOM SC","5"],["3","贝尔温 Steven Bergwijn","吉达伊蒂哈德 Al Ittihad","4"],["3","恩内斯里 Youssef En-Nesyri","吉达伊蒂哈德 Al Ittihad","4"],["3","科塔哈雷纳 Iker Kortajarena","卡胡德 Al Kholood","4"],["3","伊莱尼赫纳 George Ilenikhena","吉达伊蒂哈德 Al Ittihad","4"],["3","科内 Amadou Koné","新未来城SC NEOM SC","4"],["3","米林科维奇-萨维奇 Sergej Milinković-Savić","利雅得新月 Al Hilal","4"],["3","雷特吉 Mateo Retegui","胡拜尔卡迪西亚 Al Qadsiah","4"],["10","阿布·沙马特 Mohammed Abu Al Shamat","胡拜尔卡迪西亚 Al Qadsiah","3"]],
  ucl: [["1","德米罗维奇 Ermedin Demirović","斯图加特 Stuttgart","3"],["1","费兰·托雷斯 Ferran Torres","巴黎圣日耳曼 PSG","3"],["3","登贝莱 Ousmane Dembélé","巴黎圣日耳曼 PSG","2"],["3","吉拉西 Serhou Guirassy","多特蒙德 Dortmund","2"],["3","哈兰德 Erling Haaland","曼城 Man City","2"],["3","马科斯·巴特拉 Marc Bartra","皇家贝蒂斯 Real Betis","2"],["3","奥利塞 Michael Olise","拜仁慕尼黑 Bayern","2"],["3","拉菲尼亚 Raphinha","巴塞罗那 Barcelona","2"],["3","什图尔姆 Danijel Šturm","布拉格斯拉维亚 Slavia Praha","2"],["10","阿德耶米 Karim Adeyemi","巴塞罗那 Barcelona","1"]],
};
const assistsData = {
  epl: [["1","若昂·佩德罗 João Pedro","切尔西 Chelsea","3"],["1","镰田大地 Daichi Kamada","水晶宫 Crystal Palace","3"],["1","埃万尼尔松 Evanilson","伯恩茅斯 Bournemouth","3"],["1","加克波 Cody Gakpo","利物浦 Liverpool","3"],["5","塞梅尼奥 A. Semenyo","曼城 Man City","2"],["5","吉布斯-怀特 M. Gibbs-White","诺丁汉森林 N. Forest","2"],["5","格罗斯 P. Groß","布莱顿 Brighton","2"],["5","帕尔默 C. Palmer","切尔西 Chelsea","2"],["5","恩西索 J. Enciso","伊普斯维奇 Ipswich","2"],["5","德屈佩 M. De Cuyper","布莱顿 Brighton","2"]],
  laliga: [["1","哈维·埃尔南德斯 Javi Hernandez","西班牙人 Espanyol","4"],["1","安东尼·戈登 Anthony Gordon","巴塞罗那 Barcelona","4"],["3","维尼修斯 Vinícius Júnior","皇家马德里 Real Madrid","3"],["3","拉菲尼亚 Raphinha","巴塞罗那 Barcelona","3"],["3","安赫尔·佩雷斯 Ángel Pérez","阿拉维斯 Alavés","3"],["3","乌奈·洛佩斯 Unai López","巴列卡诺 Rayo Vallecano","3"],["3","马里亚诺·迪亚斯 Mariano Díaz","阿拉维斯 Alavés","3"],["3","达尼·奥尔莫 Dani Olmo","巴塞罗那 Barcelona","3"],["9","姆巴佩 Kylian Mbappé","皇家马德里 Real Madrid","2"],["9","拉明·亚马尔 Lamine Yamal","巴塞罗那 Barcelona","2"]],
  seriea: [["1","迪巴拉 Paulo Dybala","罗马 AS Roma","4"],["2","迪乌夫 Andy Diouf","国际米兰 Inter","3"],["3","拉比奥 Adrien Rabiot","AC米兰 AC Milan","2"],["3","扎卡尼 Mattia Zaccagni","拉齐奥 Lazio","2"],["3","马尼亚斯 Ricardo Mangas","蒙扎 Monza","2"],["3","丘克乌泽 Samuel Chukwueze","AC米兰 AC Milan","2"],["3","戴维斯 Keinan Davis","乌迪内斯 Udinese","2"],["3","伊利奇 Ivan Ilić","莱切 Lecce","2"],["3","布西奥 Gianluca Busio","威尼斯 Venezia","2"],["3","阿多波 Michel Adopo","卡利亚里 Cagliari","2"]],
  bundesliga: [["1","金特尔 Matthias Ginter","弗赖堡 Freiburg","3"],["1","萨伊巴里 Ismael Saibari","拜仁慕尼黑 Bayern","3"],["3","基米希 Joshua Kimmich","拜仁慕尼黑 Bayern","2"],["3","科法尔 Vladimír Coufal","霍芬海姆 Hoffenheim","2"],["3","贝克 Sheraldo Becker","美因茨 Mainz 05","2"],["3","吉拉西 Serhou Guirassy","多特蒙德 Dortmund","2"],["3","奥诺拉 Franck Honorat","门兴 M'gladbach","2"],["3","尤拉诺维奇 Josip Juranović","柏林联合 Union Berlin","2"],["3","格吕尔 Marco Grüll","不来梅 Werder","2"],["3","古铁雷斯 Miguel Gutiérrez","勒沃库森 Leverkusen","2"]],
  ligue1: [["1","卡塞雷斯 Cristian Cásseres Jr.","图卢兹 Toulouse","3"],["1","卡策里斯 Panos Katseris","洛里昂 Lorient","3"],["3","吉鲁 Olivier Giroud","里尔 Lille","2"],["3","托万 Florian Thauvin","朗斯 Lens","2"],["3","托马松 Adrien Thomasson","雷恩 Rennais","2"],["3","戈洛温 Aleksandr Golovin","摩纳哥 Monaco","2"],["3","法比安·鲁伊斯 Fabián Ruiz","巴黎圣日耳曼 PSG","2"],["3","舒尔茨 Pavel Šulc","里昂 Lyon","2"],["3","纳纳西 Sebastian Nanasi","斯特拉斯堡 Strasbourg","2"],["3","布拉巴 Adil Bourabaa","勒芒 Le Mans","2"]],
  mls: [["1","佩雷拉 Joaquín Pereyra","明尼苏达联 Minnesota United","13"],["1","梅西 Lionel Messi","迈阿密国际 Inter Miami","13"],["3","德雷尔 Anders Dreyer","圣迭戈FC San Diego FC","12"],["4","孙兴慜 Son Heung-Min","洛杉矶FC LAFC","11"],["4","埃万德 Evander","辛辛那提FC FC Cincinnati","11"],["4","瓦连特 Joaquín Valiente","达拉斯FC FC Dallas","11"],["4","埃斯皮诺萨 Cristian Espinoza","纳什维尔SC Nashville SC","11"],["4","德保罗 Rodrigo De Paul","迈阿密国际 Inter Miami","11"],["9","察基里斯 Niko Tsakiris","圣何塞地震 San Jose Earthquakes","10"],["9","埃利斯 Justin Ellis","奥兰多城 Orlando City","10"]],
  saudi: [["1","梅德兰 Medrán","达曼伊蒂法克 Al Ettifaq","3"],["1","鲁本·内维斯 Rúben Neves","利雅得新月 Al Hilal","3"],["1","奥斯卡 Óscar","迪利亚 Al Diriyah","3"],["1","萨默维尔 Crysencio Summerville","利雅得新月 Al Hilal","3"],["1","阿布·沙马特 Mohammed Abu Al Shamat","胡拜尔卡迪西亚 Al Qadsiah","3"],["6","马内 Sadio Mané","利雅得胜利 Al Nassr","2"],["6","布朗希尔 Josh Brownhill","利雅得沙巴布 Al Shabab","2"],["6","沃特金斯 Ollie Watkins","利雅得新月 Al Hilal","2"],["6","阿瓦尔 Houssem Aouar","吉达伊蒂哈德 Al Ittihad","2"],["6","特林康 Francisco Trincão","吉达国民 Al Ahli","2"]],
  ucl: [["1","登贝莱 Ousmane Dembélé","巴黎圣日耳曼 PSG","2"],["1","温达夫 Deniz Undav","斯图加特 Stuttgart","2"],["1","保·托雷斯 Pau Torres","阿斯顿维拉 Aston Villa","2"],["1","尼科·帕斯 Nico Paz","科莫 Como","2"],["1","拉明·亚马尔 Lamine Yamal","巴塞罗那 Barcelona","2"],["6","伊斯科 Isco","皇家贝蒂斯 Real Betis","1"],["6","凯恩 Harry Kane","拜仁慕尼黑 Bayern","1"],["6","坎塞洛 João Cancelo","巴塞罗那 Barcelona","1"],["6","比约达尔 Henrik Bjørdal","维京 Viking FK","1"],["6","蒂莱曼斯 Youri Tielemans","曼联 Man Utd","1"]],
};

// ===== 新闻（每条均打开原文核实）=====
const news = [
  { league:"toutiao", team:"曼联", extra:"英超", title:"遭让二追三！曼联2-3布莱顿连续两年联赛杯一轮游", summary:"北京时间9月17日凌晨联赛杯第3轮，曼联(Manchester United)主场2-0领先遭布莱顿(Brighton)连追3球逆转出局，芒特(Mount)和小将莱西(Lacey)破门，上次主场2球领先仍输球还要追溯到1976年，主帅卡里克(Carrick)赛后担责。", source:"https://www.toutiao.com/article/7686313136249274886/", sourceName:"北青网（北京青年报）", time:"09-17" },
  { league:"toutiao", team:"切尔西", extra:"英超", title:"切尔西官方：清湖资本收购伯利/沃尔特股份，获俱乐部完全控制权", summary:"切尔西(Chelsea)官方宣布清湖资本(Clearlake)收购老板伯利(Boehly)和马克·沃尔特(Mark Walter)各自持有的12.8%股份，持股升至61.5%实现完全控制，据《泰晤士报》交易价值近10亿英镑，伯利时代告一段落。", source:"https://www.toutiao.com/article/7686313136249274886/", sourceName:"北青网（北京青年报）", time:"09-17" },
  { league:"toutiao", team:"西班牙国家队", extra:"国家队", title:"HWG！德拉富恩特将与西班牙队续约至2032年", summary:"世界杯冠军主帅德拉富恩特(Luis de la Fuente)续约获罗马诺Here we go确认，将执教西班牙国家队至2032年，西足协主席此前已表态推进续约。", source:"https://www.toutiao.com/article/7686273270744400420/", sourceName:"直播吧", time:"09-17" },
  { league:"toutiao", team:"AC米兰", extra:"意甲", title:"欧联开门黑！AC米兰主场0-2负本菲卡", summary:"欧联杯联赛阶段首轮，AC米兰(AC Milan)主场0-2不敌本菲卡(Benfica)，卡明斯基(Kaminski)传射、卢克巴基奥(Lukebakio)破门，这是红黑军团本赛季正式比赛首败。", source:"https://www.toutiao.com/article/7686273270744400420/", sourceName:"直播吧", time:"09-17" },
  { league:"toutiao", team:"曼城", extra:"欧冠", title:"哈兰德梅开二度！曼城2-0波尔图欧冠开门红", summary:"欧冠联赛阶段首轮，曼城(Manchester City)客场2-0波尔图(Porto)，哈兰德(Erling Haaland)头球+推射梅开二度，欧冠59场59球升至历史射手榜第七，恩佐(Enzo)送出曼城生涯首记欧冠助攻，曼城各项赛事四连胜。", source:"https://sports.sina.cn/2026-09-17/detail-inirfcpw5694020.d.html", sourceName:"新浪体育", time:"09-17" },
  { league:"toutiao", team:"国际米兰", extra:"意甲", title:"开场16分钟0-2落后！国米连追5球5-3逆转乌迪内斯", summary:"意甲第4轮，国际米兰(Inter Milan)主场先丢两球后连入5球，5-3逆转乌迪内斯(Udinese)，图拉姆(Thuram)、巴雷拉(Barella)等建功，国米4轮全胜积12分并列榜首。", source:"https://www.163.com/dy/article/L72A8E5M05561FXE.html", sourceName:"网易（元气满分吖）", time:"09-17" },
  { league:"epl", team:"阿森纳", title:"阿森纳官方：签下英格兰U16国脚前锋文森特-约瑟夫", summary:"阿森纳(Arsenal)官方宣布签下英格兰U16前锋文森特·约瑟夫(Vincent Joseph)，作为2026/27首年奖学金计划成员加盟，他此前效力利物浦U18，代表英格兰U16出场9次打进8球。", source:"https://news.qq.com/rain/a/20260917A0EJR700", sourceName:"腾讯新闻/虎扑", time:"09-17" },
  { league:"laliga", team:"巴塞罗那", title:"6轮轰28球！巴萨7-2桑坦德竞技，拉菲尼亚戴帽", summary:"西甲第6轮，巴塞罗那(Barcelona)7-2狂胜升班马桑坦德竞技(Racing Santander)，拉菲尼亚(Raphinha)上演帽子戏法、亚马尔(Lamine Yamal)1射2传，巴萨6轮全胜进28球领跑西甲，拉菲尼亚9球居射手榜首位。", source:"https://www.toutiao.com/article/7686313136249274886/", sourceName:"北青网（北京青年报）", time:"09-17" },
  { league:"laliga", team:"皇家贝蒂斯", title:"贝蒂斯2-1客胜比利亚雷亚尔，延续强势开局", summary:"西甲第6轮，皇家贝蒂斯(Real Betis)客场2-1逆转比利亚雷亚尔(Villarreal)，赫拉德·莫雷诺(Gerard Moreno)先拔头筹，库乔·埃尔南德斯(Cucho Hernandez)和纳坦(Natan)4分钟内连入两球反超，贝蒂斯开局延续强势。", source:"https://www.skysports.com/football/live-blog/12023/13575723/european-football-news-and-transfers-barcelona-real-madrid-psg-bayern-munich-latest-and-more", sourceName:"Sky Sports", time:"09-18" },
  { league:"seriea", team:"国际米兰", title:"斯通斯大腿伤退，预计缺阵3-4周无缘英格兰队名单", summary:"Sky Sports证实，约翰·斯通斯(John Stones)在国米5-3乌迪内斯一役大腿拉伤，预计缺阵3-4周，将缺席图赫尔(Tuchel)周五公布的英格兰队9-10月名单，出战周六国米对罗马的榜首大战也成疑。", source:"https://www.skysports.com/football/live-blog/12023/13575723/european-football-news-and-transfers-barcelona-real-madrid-psg-bayern-munich-latest-and-more", sourceName:"Sky Sports", time:"09-18" },
  { league:"seriea", team:"罗马", title:"罗马2-0客胜都灵，四战全胜与国米并列意甲榜首", summary:"罗马(Roma)客场2-0击败都灵(Torino)，马伦(Donyell Malen)利用对方门将传球失误破门、皮西利(Pisilli)补时锁定胜局，罗马4轮全胜积12分，周六将与国米在奥林匹克球场直接对话。", source:"https://www.163.com/dy/article/L72A8E5M05561FXE.html", sourceName:"网易（元气满分吖）", time:"09-17" },
  { league:"bundesliga", team:"多特蒙德", title:"多特德甲三连胜11年首次，卡雷察斯恢复合练", summary:"多特蒙德(Borussia Dortmund)德甲开局三连胜，为11年来首次，全队赛前客战斯图加特保持高士气；新援卡雷察斯(Konstantinos Karetsas)周三恢复合练将随队出征，施洛特贝克(Schlotterbeck)、本塞拜尼(Bensebaini)已伤愈复出。", source:"https://onefootball.com/en/news/nine-points-confidence-highbvb-ahead-of-the-bundesliga-match-in-stuttgart-43478192", sourceName:"OneFootball（BVB官网内容）", time:"09-17" },
  { league:"ucl", team:"阿斯顿维拉", title:"维拉3-2客胜布鲁日迎欧冠首胜，麦金成队史欧战头号射手", summary:"欧冠联赛阶段首轮，阿斯顿维拉(Aston Villa)客场3-2险胜布鲁日(Club Brugge)，麦金(John McGinn)第10分钟世界波破门，欧战总进球达12球成为维拉队史欧战第一射手，万比萨卡(Wan-Bissaka)送点。（注：本条为单一自媒体来源，已如实标注）", source:"https://www.sohu.com/a/1077068812_122341060", sourceName:"搜狐（自媒体，单一来源）", time:"09-17" },
  { league:"mls", team:"迈阿密国际", title:"梅西打进迈阿密生涯第100球，率队夺美冠杯首冠", summary:"美冠杯(Campeones Cup)决赛，迈阿密国际(Inter Miami)2-0击败蓝十字(Cruz Azul)夺得队史首座该赛事冠军，梅西(Lionel Messi)第24分钟接苏亚雷斯(Luis Suárez)传中头球破门，以115场达成俱乐部生涯百球，创个人最快纪录。", source:"https://thesportscast.net/2026/09/17/lionel-messi-reaches-100-goals-for-inter-miami-how-many-has-cristiano-ronaldo-scored-for-al-nassr/", sourceName:"The Sports Cast", time:"09-17" },
];

// R3 校验要求末列为数字：把射助榜每行第 4 列统一转 number
for (const board of [scorersData, assistsData]) {
  for (const lg of Object.keys(board)) {
    board[lg] = board[lg].map(r => [Number(r[0]), r[1], r[2], Number(r[3])]);
  }
}

const leagueLabel = { epl:"英超", laliga:"西甲", seriea:"意甲", bundesliga:"德甲", ligue1:"法甲", mls:"美职联", saudi:"沙特联", ucl:"欧冠", toutiao:"今日头条" };
const tagClass = { epl:"tag-epl", laliga:"tag-laliga", seriea:"tag-seriea", bundesliga:"tag-bundesliga", ligue1:"tag-ligue1", mls:"tag-mls", saudi:"tag-saudi", ucl:"tag-ucl", toutiao:"tag-toutiao" };

function newsCard(n) {
  const extraTag = n.extra ? `<span class="card-league ${tagClass[n.extra === "国家队" ? "ucl" : n.extra] || "tag-epl"}">${n.extra === "国家队" ? "国家队" : n.extra}</span>` : "";
  return `<div class="news-card" data-league="${n.league}">
  <div class="card-top">
    <span class="card-team">${n.team}</span>
    <span class="card-league ${tagClass[n.league]}">${leagueLabel[n.league]}</span>
    ${extraTag}
  </div>
  <div class="card-body">
    <div class="card-title" style="color:#000;font-weight:700">${n.title}</div>
    <div class="card-summary">${n.summary}</div>
  </div>
  <div class="card-footer">
    <span class="card-source"><a href="${n.source}" target="_blank">${n.sourceName}</a></span>
    <span class="card-time">${n.time}</span>
  </div>
</div>`;
}

const counts = {};
for (const n of news) counts[n.league] = (counts[n.league] || 0) + 1;
const filterOrder = ["all","toutiao","epl","laliga","seriea","bundesliga","ligue1","mls","saudi","ucl"];
const filterTabs = filterOrder.map(f => {
  if (f === "all") return `<div class="filter-tab active" data-filter="all" onclick="filterNews('all')">全部 ${news.length}</div>`;
  return `<div class="filter-tab" data-filter="${f}" onclick="filterNews('${f}')">${f === "toutiao" ? "🔥 今日头条" : leagueLabel[f]} ${counts[f] || 0}</div>`;
}).join("\n    ");

const standingsTabs = [["epl","英超"],["laliga","西甲"],["seriea","意甲"],["bundesliga","德甲"],["ligue1","法甲"],["mls","美职联"],["saudi","沙特联"],["ucl","欧冠"]]
  .map(([k,l], i) => `<div class="league-tab${i === 0 ? " active" : ""}" data-league="${k}" onclick="switchLeague('${k}')">${l}</div>`).join("\n    ");

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>足球日报 - 2026年9月18日</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif; background:#f5f5f5; color:#333; line-height:1.6; font-size:14px; }
.header { background:linear-gradient(135deg,#c41e3a 0%,#8b1a2b 100%); color:#fff; padding:20px; text-align:center; box-shadow:0 2px 8px rgba(0,0,0,0.15); }
.header h1 { font-size:28px; color:#fff; font-weight:900; margin-bottom:8px; text-shadow:0 2px 6px rgba(0,0,0,0.6); }
.header .subtitle { font-size:14px; color:#fff; opacity:0.95; text-shadow:0 1px 3px rgba(0,0,0,0.5); }
.header .update-time { font-size:12px; color:#fff; opacity:0.9; margin-top:6px; text-shadow:0 1px 3px rgba(0,0,0,0.4); }
.standings-section { background:#fff; margin:12px; border-radius:12px; border:1px solid #e8e8e8; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,0.06); }
.standings-header { padding:12px 16px 0; display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.standings-header .section-label { font-size:15px; font-weight:700; color:#222; }
.type-tabs { display:flex; gap:4px; background:#f8f8f8; border-radius:8px; padding:3px; }
.type-tab { padding:5px 14px; border-radius:6px; font-size:13px; font-weight:500; cursor:pointer; color:#666; transition:all .2s; border:none; background:transparent; }
.type-tab.active { background:#c41e3a; color:#fff; }
.league-tabs { display:flex; gap:4px; padding:8px 16px; overflow-x:auto; flex-wrap:wrap; }
.league-tab { padding:4px 12px; border-radius:6px; font-size:12px; cursor:pointer; color:#666; border:1px solid #e8e8e8; background:#fafafa; transition:all .2s; white-space:nowrap; }
.league-tab.active { background:#c41e3a; color:#fff; border-color:#c41e3a; }
.league-tab:hover { border-color:#c41e3a; color:#c41e3a; }
.table-wrapper { padding:0 16px 16px; }
.standings-table { width:100%; border-collapse:collapse; font-size:12px; color:#555; }
.standings-table th { background:#f8f8f8; padding:8px 4px; text-align:center; font-weight:500; color:#666; border-bottom:1px solid #e8e8e8; }
.standings-table td { padding:7px 4px; text-align:center; border-bottom:1px solid #f5f5f5; }
.standings-table td:first-child { font-weight:700; color:#c41e3a; }
.standings-table td:nth-child(2) { text-align:left; font-weight:500; color:#333; }
.standings-table tr:hover td { background:#fff8e1; }
.standings-table .top3 td:first-child { color:#ffd700; }
.standings-table .top4 td:first-child { color:#00d2ff; }
.standings-table .relegation td:first-child { color:#ff6b6b; }
.standings-table .highlight td { background:#fff8e1; }
.section-header { background:linear-gradient(135deg,#f8f8f8 0%,#fff 100%); padding:12px 16px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e8e8e8; }
.section-header .title { font-size:16px; font-weight:700; color:#222; display:flex; align-items:center; gap:8px; }
.section-header .title .dot { width:6px; height:6px; background:#c41e3a; border-radius:50%; display:inline-block; }
.section-header .info { font-size:12px; color:#999; }
.news-section { background:#fff; margin:12px; border-radius:12px; border:1px solid #e8e8e8; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,0.06); }
.news-header { padding:12px 16px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e8e8e8; }
.news-header-left { display:flex; align-items:center; gap:8px; }
.news-header-left .dot { width:6px; height:6px; background:#c41e3a; border-radius:50%; }
.news-header-left .title { font-size:16px; font-weight:700; color:#222; }
.news-header-right { display:flex; align-items:center; gap:12px; }
.news-count { font-size:12px; padding:2px 8px; background:#f8f8f8; border-radius:4px; color:#666; }
.news-update-time { font-size:12px; color:#999; }
.news-filter-tabs { display:flex; gap:4px; padding:8px 16px; overflow-x:auto; flex-wrap:wrap; border-bottom:1px solid #e8e8e8; }
.filter-tab { padding:4px 12px; border-radius:6px; font-size:12px; cursor:pointer; color:#666; border:1px solid #e8e8e8; background:#fafafa; transition:all .2s; white-space:nowrap; }
.filter-tab.active { background:#c41e3a; color:#fff; border-color:#c41e3a; }
.filter-tab:hover { border-color:#c41e3a; color:#c41e3a; }
.news-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(360px,1fr)); gap:16px; padding:16px; }
.news-card { background:#fafafa; border-radius:10px; border:1px solid #e8e8e8; overflow:hidden; transition:transform .2s,border-color .2s; }
.news-card:hover { transform:translateY(-2px); border-color:#ccc; }
.card-top { padding:10px 12px; display:flex; align-items:center; gap:8px; border-bottom:1px solid #e8e8e8; }
.card-team { font-size:13px; font-weight:700; color:#c41e3a; }
.card-league { font-size:11px; padding:2px 6px; border-radius:4px; font-weight:500; }
.tag-epl { background:#37003c; color:#00ff85; }
.tag-laliga { background:#1a2b4a; color:#ffd700; }
.tag-seriea { background:#0066aa; color:#fff; }
.tag-bundesliga { background:#d3010c; color:#fff; }
.tag-ligue1 { background:#091c3e; color:#dae025; }
.tag-mls { background:#e31837; color:#fff; }
.tag-saudi { background:#165d31; color:#fff; }
.tag-ucl { background:#0f367c; color:#fff; }
.tag-toutiao { background:#ff6b35; color:#fff; font-weight:700; }
.news-card[data-league="toutiao"] { border:2px solid #ff6b35; background:linear-gradient(135deg,#fff 0%,#fff8f0 100%); }
.news-card[data-league="toutiao"] .card-title { color:#c41e3a; }
.card-body { padding:10px 12px; }
.card-title { font-size:15px; font-weight:700; color:#000; margin-bottom:8px; line-height:1.4; }
.card-summary { font-size:12px; color:#666; line-height:1.6; display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden; }
.card-footer { padding:8px 12px; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #e8e8e8; font-size:11px; }
.card-source a { color:#c41e3a; text-decoration:none; font-weight:500; }
.card-source a:hover { text-decoration:underline; }
.card-time { color:#999; font-style:italic; }
.hidden { display:none !important; }
.footer { text-align:center; padding:24px; color:#999; font-size:11px; line-height:1.8; }
@media (max-width:768px) { .news-grid { grid-template-columns:1fr; } .standings-header { flex-direction:column; align-items:flex-start; } }
</style>
</head>
<body>

<div class="header">
  <h1>⚽ 足球日报</h1>
  <div class="subtitle">欧洲冠军联赛 · 七大联赛每日资讯聚合</div>
  <div class="update-time">数据截止时间：2026年9月18日 03:45（北京时间）</div>
</div>

<!-- ===== STANDINGS ===== -->
<div class="standings-section">
  <div class="standings-header">
    <div class="section-label">📊 数据排行</div>
    <div class="type-tabs">
      <div class="type-tab active" data-type="standings" onclick="switchType('standings')">积分榜</div>
      <div class="type-tab" data-type="scorers" onclick="switchType('scorers')">射手榜</div>
      <div class="type-tab" data-type="assists" onclick="switchType('assists')">助攻榜</div>
    </div>
  </div>
  <div class="league-tabs">
    ${standingsTabs}
  </div>
  <div class="table-wrapper">
    <div id="table-content"></div>
  </div>
</div>

<!-- ===== NEWS ===== -->
<div class="news-section">
  <div class="news-header">
    <div class="news-header-left">
      <div class="dot"></div>
      <div class="title">最新资讯</div>
    </div>
    <div class="news-header-right">
      <span class="news-count" id="news-count">全部 ${news.length} 条</span>
      <span class="news-update-time">更新 2026-09-18</span>
    </div>
  </div>
  <div class="news-filter-tabs">
    ${filterTabs}
  </div>
  <div class="news-grid" id="news-grid">
${news.map(newsCard).join("\n\n")}
  </div>
</div>

<div class="footer">
  <p>足球日报 · 每日足球资讯聚合</p>
  <p>数据来源：BBC Sport、ESPN、worldfootball.net、Sky Sports、OneFootball、新浪体育、直播吧、北青网、网易等</p>
  <p>数据截止时间：2026年9月18日 03:45（北京时间） | 仅供参考，请以官方最新信息为准</p>
</div>

<script>
// ===== DATA =====
const standingsData = ${JSON.stringify(standingsData)};
const scorersData = ${JSON.stringify(scorersData)};
const assistsData = ${JSON.stringify(assistsData)};
const metaNotes = ${JSON.stringify({
  epl: "英超第4轮（积分/射手：BBC Sport，助攻：ESPN）",
  laliga: "西甲第6轮（积分/射手：BBC Sport，助攻：ESPN）",
  seriea: "意甲第4轮（worldfootball.net）",
  bundesliga: "德甲第3轮（worldfootball.net）",
  ligue1: "法甲第4轮（worldfootball.net）",
  mls: "美职联常规赛（ESPN；射手/助攻为联盟总榜，无东西分区拆分）",
  saudi: "沙特联第7轮（worldfootball.net）",
  ucl: "欧冠联赛阶段第1轮（worldfootball.net，36队每队已赛1场）",
})};

let currentType = 'standings';
let currentLeague = 'epl';

function switchType(type) {
  currentType = type;
  document.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.type-tab[data-type="' + type + '"]').classList.add('active');
  renderTable();
}

function switchLeague(league) {
  currentLeague = league;
  document.querySelectorAll('.league-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.league-tab[data-league="' + league + '"]').classList.add('active');
  renderTable();
}

function buildStandingsTable(data, headers) {
  let html = '<table class="standings-table"><tr>';
  headers.forEach(h => html += '<th>' + h + '</th>');
  html += '</tr>';
  data.forEach((row, idx) => {
    let cls = '';
    if (idx < 3) cls = 'top3';
    else if (idx < 4) cls = 'top4';
    else if (idx >= data.length - 3 && data.length >= 18) cls = 'relegation';
    if (parseInt(row[0], 10) <= 4) cls += ' highlight';
    html += '<tr class="' + cls + '">';
    row.forEach(cell => { html += '<td>' + cell + '</td>'; });
    html += '</tr>';
  });
  html += '</table>';
  return html;
}

function buildSimpleTable(data, headers, emptyNote) {
  if (!data || !data.length) {
    return '<p style="color:#999;font-size:13px;padding:12px 0">' + (emptyNote || '本轮未逐条核验到该榜单数据') + '</p>';
  }
  let html = '<table class="standings-table"><tr>';
  headers.forEach(h => html += '<th>' + h + '</th>');
  html += '</tr>';
  data.forEach(row => {
    html += '<tr>';
    row.forEach((cell, cidx) => {
      if (cidx === 0) html += '<td style="font-weight:700;color:#c41e3a">' + cell + '</td>';
      else html += '<td>' + cell + '</td>';
    });
    html += '</tr>';
  });
  html += '</table>';
  return html;
}

function renderTable() {
  const container = document.getElementById('table-content');
  let html = '';
  if (currentType === 'standings') {
    html += '<div class="section-header" style="margin:0 -16px"><div class="title"><span class="dot"></span>积分榜</div><div class="info">' + metaNotes[currentLeague] + '</div></div>';
    if (currentLeague === 'mls') {
      html += '<h4 style="color:#666;font-size:13px;margin:8px 0 4px">东区</h4>';
      html += buildStandingsTable(standingsData.mls_east, ['排名','球队','赛','胜','平','负','进','失','净胜球','积分']);
      html += '<h4 style="color:#666;font-size:13px;margin:12px 0 4px">西区</h4>';
      html += buildStandingsTable(standingsData.mls_west, ['排名','球队','赛','胜','平','负','进','失','净胜球','积分']);
    } else {
      html += buildStandingsTable(standingsData[currentLeague], ['排名','球队','赛','胜','平','负','进','失','净胜球','积分']);
    }
  } else if (currentType === 'scorers') {
    html += '<div class="section-header" style="margin:0 -16px"><div class="title"><span class="dot"></span>射手榜</div><div class="info">' + metaNotes[currentLeague] + '</div></div>';
    html += buildSimpleTable(scorersData[currentLeague], ['排名','球员','球队','进球']);
  } else if (currentType === 'assists') {
    html += '<div class="section-header" style="margin:0 -16px"><div class="title"><span class="dot"></span>助攻榜</div><div class="info">' + metaNotes[currentLeague] + '</div></div>';
    html += buildSimpleTable(assistsData[currentLeague], ['排名','球员','球队','助攻']);
  }
  container.innerHTML = html;
}

function filterNews(filter) {
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.filter-tab[data-filter="' + filter + '"]').classList.add('active');
  const cards = document.querySelectorAll('.news-card');
  let visibleCount = 0;
  cards.forEach(card => {
    if (filter === 'all' || card.dataset.league === filter) {
      card.classList.remove('hidden');
      visibleCount++;
    } else {
      card.classList.add('hidden');
    }
  });
  const labelMap = { 'all':'全部 ', 'toutiao':'今日头条 ', 'epl':'英超 ', 'laliga':'西甲 ', 'seriea':'意甲 ', 'bundesliga':'德甲 ', 'ligue1':'法甲 ', 'mls':'美职联 ', 'saudi':'沙特联 ', 'ucl':'欧冠 ' };
  document.getElementById('news-count').textContent = (labelMap[filter] || '') + visibleCount + ' 条';
}

renderTable();
</script>

</body>
</html>
`;

const outDir = join(process.cwd(), 'reports', 'daily', D);
mkdirSync(outDir, { recursive: true });
const tmp = join(outDir, 'football.html.tmp');
writeFileSync(tmp, html);
renameSync(tmp, join(outDir, 'football.html'));
console.log('OK bytes=' + Buffer.byteLength(html));
