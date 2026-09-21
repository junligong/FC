#!/usr/bin/env node
/**
 * 作用：批量把统一中文球员名写回传奇、英雄、周黑和进化数据。
 * Reads supplement mappings + existing name library, matches by slug,
 * writes nameZh into icons/heroes/totw/evolution data files.
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = path.resolve(import.meta.dirname, '..');

// ═══════════════════════════════════════════════
//  Supplement mapping — batch 2 (full slugs)
// ═══════════════════════════════════════════════
const batch2 = {
  "abby-dahlkemper": "达尔肯珀",
  "abdessamad-ezzalzouli": "埃扎尔祖利",
  "abdukodir-khusanov": "胡桑诺夫",
  "ademola-lookman": "卢克曼",
  "alba-redondo-ferrer": "阿尔巴·雷东多",
  "albert-gronbaek": "格伦贝克",
  "aleix-garcia-serrano": "阿莱士·加西亚",
  "alejandro-berenguer-remiro": "贝伦格尔",
  "alejandro-remiro-gargallo": "雷米罗",
  "aleksandar-pavlovic": "帕夫洛维奇",
  "alex-iwobi": "伊沃比",
  "alex-meret": "梅雷特",
  "alexander-schlager": "施拉格尔",
  "alexander-sorloth": "索尔洛特",
  "alexis-saelemaekers": "萨勒马科尔斯",
  "alexsandro-de-souza-ribeiro": "亚历克斯桑德罗",
  "alice-sombath": "索姆巴特",
  "allahyar-sayyadmanesh": "萨亚德马内什",
  "alvaro-garcia-rivera": "阿尔瓦罗·加西亚",
  "amira-arfaoui": "阿尔法维",
  "ander-barrenetxea": "巴雷内切亚",
  "andre-onana": "奥纳纳",
  "andreas-christensen": "克里斯滕森",
  "andreas-schjelderup": "谢尔德鲁普",
  "andrey-n-dos-santos": "安德烈·桑托斯",
  "angel-di-maria": "迪马利亚",
  "angel-gomes": "安赫尔·戈麦斯",
  "angelo-stiller": "施蒂勒",
  "anna-moorhouse": "穆尔豪斯",
  "annaig-butel": "比泰尔",
  "anssumane-fati": "法蒂",
  "anthony-elanga": "埃兰加",
  "anthony-gordon": "安东尼·戈登",
  "antonia-da-costa-silva": "安东尼娅·席尔瓦",
  "antonio-jose-pinheiro-carvalho": "托泽",
  "antonio-nusa": "努萨",
  "antony-matheus-dos-santos": "安东尼",
  "arda-guler": "居莱尔",
  "arianna-caruso": "卡鲁索",
  "armand-lauriente": "洛里安特",
  "arthur-theate": "泰亚特",
  "ashleigh-neville": "阿什利·内维尔",
  "ayaka-yamashita": "山下杏也加",
  "barbara-bonansea": "博南塞亚",
  "bart-nieuwkoop": "尼乌文科普",
  "beatriz-zaneratto-joao": "比娅·扎内拉托",
  "bella-bixby": "比克斯比",
  "ben-brereton-diaz": "布雷雷顿·迪亚斯",
  "benjamin-white": "本·怀特",
  "bernd-leno": "莱诺",
  "boubacar-kamara": "卡马拉",
  "boulaye-dia": "迪亚",
  "brahim-diaz": "卜拉欣·迪亚斯",
  "brice-samba": "桑巴",
  "bryan-cristante": "克里斯坦特",
  "bum-keun-song": "宋范根",
  "can-bozdogan": "博兹多安",
  "carles-gil-pareja": "卡莱斯·希尔",
  "carlos-augusto-zopolato-neves": "卡洛斯·奥古斯托",
  "carlos-eduardo-lopes-cruz": "卡杜",
  "carlos-henrique-venancio-casimiro": "卡塞米罗",
  "carmen-menayo-montero": "卡门·梅纳约",
  "casey-murphy": "墨菲",
  "castello-lukeba": "卢凯巴",
  "cecilia-salvai": "萨尔瓦伊",
  "chantal-hagel": "哈格尔",
  "charles-de-ketelaere": "德凯特拉雷",
  "chengshu-wu": "吴澄舒",
  "chiedozie-ogbene": "奥格贝内",
  "christen-press": "普雷斯",
  "christian-pulisic": "普利西奇",
  "christos-tzolis": "措利斯",
  "claudia-zornoza-sanchez": "克劳迪娅·索诺萨",
  "claudio-winck-neto": "克劳迪奥·温克",
  "clement-lenglet": "朗格莱",
  "constance-picaud": "皮科",
  "cristian-roldan": "罗尔丹",
  "cristian-romero": "克里斯蒂安·罗梅罗",
  "cristiana-girelli": "吉雷利",
  "croix-bethune": "贝蒂恩",
  "crystal-dunn": "邓恩",
  "curtis-jones": "柯蒂斯·琼斯",
  "damaris-berta-egurrola-wienke": "埃古罗拉",
  "daniel-gazdag": "加兹达格",
  "daniel-munoz": "丹尼尔·穆尼奥斯",
  "david-alaba": "阿拉巴",
  "david-doudera": "杜代拉",
  "david-neres-campos": "内雷斯",
  "dean-henderson": "迪恩·亨德森",
  "dean-huijsen": "胡伊森",
  "denis-bouanga": "布安加",
  "deyna-castellanos": "卡斯特利亚诺斯",
  "diego-javier-llorente-rios": "迭戈·略伦特",
  "dodi-lukebakio": "卢克巴基奥",
  "dolores-gallardo-nunez": "洛拉·加利亚多",
  "domenico-berardi": "贝拉尔迪",
  "dominic-solanke": "索兰克",
  "dominik-livakovic": "利瓦科维奇",
  "donyell-malen": "马伦",
  "douglas-luiz-soares-de-paulo": "道格拉斯·路易斯",
  "dusan-vlahovic": "弗拉霍维奇",
  "edna-imade": "伊马德",
  "edouard-mendy": "爱德华·门迪",
  "eduardo-camavinga": "卡马文加",
  "elisa-sen": "森斯",
  "elliot-anderson": "埃利奥特·安德森",
  "ellyes-skhiri": "斯基里",
  "emil-holm": "霍尔姆",
  "emre-can": "埃姆雷·詹",
  "esmee-brugts": "布鲁赫茨",
  "ewelina-kamczyk": "卡姆奇克",
  "exequiel-palacios": "帕拉西奥斯",
  "exequiel-zeballos": "塞瓦略斯",
  "f-evanilson-de-lima-barbosa": "埃瓦尼尔森",
  "fabian-schar": "沙尔",
  "fabio-henrique-tavares": "法比尼奥",
  "fares-chaibi": "沙伊比",
  "federico-gatti": "加蒂",
  "felicitas-rauch": "劳赫",
  "felix-horn-myhre": "米尔",
  "ferland-mendy": "费兰·门迪",
  "filip-kostic": "科斯蒂奇",
  "fran-kirby": "弗兰·柯比",
  "francisco-trincao": "特林康",
  "franck-yannick-kessie": "凯西",
  "frederico-de-paula-santos": "弗雷德",
  "frederik-ronnow": "伦诺",
  "fredrik-aursnes": "奥尔斯内斯",
  "gabriel-fernando-de-jesus": "热苏斯",
  "gabriel-fortes-chaves": "加布里埃尔·佩克",
  "gabriel-teodoro-martinelli-silva": "马丁内利",
  "gaetano-oristanio": "奥里斯塔尼奥",
  "georgiy-sudakov": "苏达科夫",
  "gerard-moreno-balaguero": "杰拉德·莫雷诺",
  "geyse-da-silva-ferreira": "盖塞",
  "giada-greggi": "格雷吉",
  "giovani-lo-celso": "洛塞尔索",
  "giovanni-di-lorenzo": "迪洛伦佐",
  "goncalo-manuel-ganchinho-guedes": "贡萨洛·格德斯",
  "gonzalo-valle": "巴列",
  "hailie-mace": "梅斯",
  "hannah-blundell": "布伦德尔",
  "harry-maguire": "马奎尔",
  "harvey-barnes": "哈维·巴恩斯",
  "hayley-ladd": "拉德",
  "ignacio-fernandez": "费尔南德斯",
  "igor-guilherme-barbosa-da-paixao": "伊戈尔·派尚",
  "ilkay-gundogan": "京多安",
  "inigo-ruiz-de-galarreta": "鲁伊斯·德·加拉雷塔",
  "ismael-bennacer": "本纳赛尔",
  "ismaila-sarr": "萨尔",
  "ivan-perisic": "佩里西奇",
  "ivan-provedel": "普罗韦德尔",
  "ivan-toney": "托尼",
  "jack-grealish": "格拉利什",
  "jackson-irvine": "杰克逊·欧文",
  "jackson-tchatchoua": "查乔瓦",
  "jacob-bruun-larsen": "布鲁恩·拉森",
  "jacob-murphy": "雅各布·墨菲",
  "jaedyn-shaw": "杰丁·肖",
  "james-maddison": "麦迪逊",
  "james-ward-prowse": "沃德-普劳斯",
  "jan-paul-van-hecke": "范赫克",
  "jeremie-frimpong": "弗里姆蓬",
  "jess-park": "杰丝·帕克",
  "jesse-lingard": "林加德",
  "joao-maria-palhinha-goncalves": "帕利尼亚",
  "joao-pedro-junqueira-de-jesus": "若昂·佩德罗",
  "joelinton-apolinario-de-lira": "若埃林顿",
  "johan-manzambi": "曼赞比",
  "johanna-kaneryd": "卡内里德",
  "john-mcginn": "麦金",
  "john-stones": "斯通斯",
  "jonathan-burkardt": "布尔卡德特",
  "jorge-resurreccion": "科克",
  "jose-angel-carmona-navarro": "卡莫纳",
  "jose-ignacio-fernandez-iglesias": "纳乔",
  "jose-luis-gaya-pena": "加亚",
  "jose-luis-morales-nogales": "莫拉莱斯",
  "jose-maria-gimenez": "希梅内斯",
  "joseph-paintsil": "潘特希尔",
  "josha-vagnoman": "瓦格诺曼",
  "joshua-king": "约书亚·金",
  "julia-zigiotti": "齐焦蒂",
  "julie-dufour": "杜富尔",
  "kadeisha-buchanan": "布坎南",
  "kaishu-sano": "佐野海舟",
  "kamilla-melgard": "梅尔戈德",
  "kaoru-mitoma": "三笘薫",
  "katharina-naschenweng": "纳申文",
  "kathrin-hendrich": "亨德里希",
  "kayla-sharples": "夏普尔斯",
  "kerem-akturkoglu": "阿克蒂尔科奥卢",
  "kerim-mrabti": "姆拉布蒂",
  "kessya-bussy": "比西",
  "kevin-trapp": "特拉普",
  "khiara-keating": "基廷",
  "kieran-trippier": "特里皮尔",
  "kim-little": "金·利特尔",
  "kingsley-coman": "科曼",
  "koen-casteels": "卡斯特尔斯",
  "konstantinos-tzolakis": "措拉基斯",
  "korbin-shrader": "施雷德",
  "kosovare-asllani": "阿斯拉尼",
  "krepin-diatta": "迪亚塔",
  "kristin-kogel": "科格尔",
  "laia-aleixandri-lopez": "莱娅·阿莱克桑德里",
  "lara-prasnikar": "普拉什尼卡尔",
  "leah-galton": "加尔顿",
  "leandro-lozano": "洛萨诺",
  "lena-lattwein": "拉特魏因",
  "leon-goretzka": "格雷茨卡",
  "leonardo-godoy": "戈多伊",
  "leroy-sane": "萨内",
  "lia-walti": "瓦尔蒂",
  "lice-chamorro": "查莫罗",
  "lilla-turanyi": "图拉尼",
  "lineth-beerensteyn": "贝伦斯泰因",
  "lorena-da-silva-leite": "洛雷娜",
  "lorenzo-pellegrini": "洛伦佐·佩莱格里尼",
  "lotte-wubben-moy": "武本-莫伊",
  "lucas-estella-perri": "卢卡斯·佩里",
  "lucas-hernandez": "卢卡斯·埃尔南德斯",
  "lucas-tolentino-coelho-de-lima": "卢卡斯·帕凯塔",
  "lucia-pardo-mendez": "卢西亚·帕尔多",
  "lukas-haraslin": "哈拉斯林",
  "lukas-hradecky": "赫拉德茨基",
  "maelle-garbino": "加尔比诺",
  "malcom-filipe-silva-de-oliveira": "马尔孔",
  "malik-tillman": "蒂尔曼",
  "manaka-matsukubo": "松窪真心",
  "manuel-locatelli": "洛卡特利",
  "marc-andre-ter-stegen": "特尔施特根",
  "marcel-sabitzer": "萨比策",
  "marco-asensio-willemsen": "阿森西奥",
  "marcus-rashford": "拉什福德",
  "maria-isabel-rodriguez-rivero": "米萨",
  "marina-hegering": "黑格林",
  "mario-gotze": "格策",
  "mario-hermoso-canseco": "马里奥·埃尔莫索",
  "mario-pasalic": "帕沙利奇",
  "martin-zubimendi-ibanez": "祖比门迪",
  "mason-greenwood": "格林伍德",
  "mateo-kovacic": "科瓦契奇",
  "mateus-goncalo-espanha-fernandes": "马特乌斯·费尔南德斯",
  "mathias-honsak": "翁萨克",
  "mathias-kvistgaarden": "克维斯特高",
  "matias-rojas": "马蒂亚斯·罗哈斯",
  "matias-soule": "苏莱",
  "matteo-darmian": "达尔米安",
  "matteo-politano": "波利塔诺",
  "matthijs-de-ligt": "德里赫特",
  "matty-cash": "卡什",
  "mauro-arambarri": "阿兰瓦里",
  "maxwel-cornet": "科尔内",
  "merlin-rohl": "勒尔",
  "miguel-gutierrez-ortega": "米格尔·古铁雷斯",
  "mikael-ishak": "伊沙克",
  "milan-van-ewijk": "范艾维克",
  "mile-svilar": "斯维拉尔",
  "missy-bo-kearns": "卡恩斯",
  "mohamed-simakan": "西马坎",
  "morgan-gibbs-white": "吉布斯-怀特",
  "morten-hjulmand": "尤尔曼",
  "murillo-costa-dos-santos": "穆里略",
  "nadir-zortea": "佐尔特亚",
  "naomie-feller": "费勒",
  "nick-pope": "尼克·波普",
  "nicolas-jackson": "尼古拉斯·杰克逊",
  "nicolas-pepe": "佩佩",
  "nikita-parris": "帕里斯",
  "niklas-sule": "聚勒",
  "noa-lang": "朗",
  "noah-sadiki": "萨迪基",
  "noussair-mazraoui": "马兹拉维",
  "oceane-deslandes": "德兰",
  "odilon-kossounou": "科索努",
  "oliver-baumann": "鲍曼",
  "ollie-watkins": "沃特金斯",
  "ore-petrovic": "佩特罗维奇",
  "oriane-jean-francois": "让·弗朗索瓦",
  "orkun-kokcu": "科克屈",
  "oscar-trejo": "特雷霍",
  "otavio-edmilson-da-silva-monteiro": "奥塔维奥",
  "pablo-martin-paez-gavira": "加维",
  "patrik-schick": "希克",
  "pau-francisco-torres": "保·托雷斯",
  "pauline-peyraud-magnin": "佩罗-马尼安",
  "paulo-gazzaniga": "加扎尼加",
  "pedro-de-la-vega": "德拉维加",
  "pierre-kalulu": "卡卢卢",
  "piotr-zielinski": "泽林斯基",
  "predrag-rajkovic": "拉伊科维奇",
  "quinten-timber": "廷贝尔",
  "racheal-kundananji": "昆达南吉",
  "rafael-a-ferreira-silva": "拉法",
  "rafaela-borggrafe": "博尔格雷费",
  "ramiro-carrera": "卡雷拉",
  "raphael-guerreiro": "格雷罗",
  "rayan-ait-nouri": "艾特-努里",
  "rebeca-bernal": "贝尔纳尔",
  "riccardo-orsolini": "奥尔索利尼",
  "ritsu-doan": "堂安律",
  "robin-koch": "科赫",
  "rodrigo-bentancur": "本坦库尔",
  "rodrigo-de-paul": "德保罗",
  "roger-brugue-ayguade": "布鲁古",
  "romee-leuchter": "罗梅·洛伊希特",
  "ruben-loftus-cheek": "洛夫图斯-奇克",
  "rui-tiago-dantas-da-silva": "鲁伊·席尔瓦",
  "saki-kumagai": "熊谷纱希",
  "salem-al-dawsari": "达瓦萨里",
  "sammie-szmodics": "斯莫迪奇",
  "sara-dabritz": "德布里茨",
  "sergio-busquets-burgos": "布斯克茨",
  "sheila-garcia-gomez": "谢伊",
  "sherida-spitse": "斯皮采",
  "silas-katompa-mvumpa": "西拉斯",
  "sjoeke-nusken": "努斯肯",
  "sofia-huerta": "韦尔塔",
  "sofia-jakobsson": "雅各布松",
  "sofie-svava": "斯瓦瓦",
  "sophia-kleinherne": "克莱因赫内",
  "sophia-winkler": "温克勒",
  "stanislav-lobotka": "洛博特卡",
  "stefan-ortega": "奥尔特加",
  "stefan-posch": "波施",
  "steven-bergwijn": "贝尔赫韦恩",
  "steven-zuber": "祖贝尔",
  "stina-blackstenius": "布莱克斯泰纽斯",
  "sveindis-jane-jonsdottir": "约恩斯多蒂尔",
  "sydney-leroux": "勒鲁",
  "sydney-lohmann": "洛曼",
  "tajon-buchanan": "布坎南",
  "takefusa-kubo": "久保建英",
  "tara-rudd": "塔拉·拉德",
  "taylor-flint": "弗林特",
  "tereza-szewieczkova": "谢维茨科娃",
  "thea-greboval": "格雷博瓦尔",
  "thomas-partey": "托马斯·帕尔特伊",
  "thomas-strakosha": "斯特拉科沙",
  "tierna-davidson": "戴维森",
  "tino-livramento": "利夫拉门托",
  "tyler-dibling": "迪布林",
  "valentin-castellanos": "卡斯特利亚诺斯",
  "vanessa-dibernardo": "迪贝尔纳多",
  "vanessa-fudalla": "富达拉",
  "vangelis-pavlidis": "帕夫利季斯",
  "vicki-becho": "贝乔",
  "vincenzo-grifo": "格里福",
  "viviane-asseyi": "阿塞伊",
  "wataru-endo": "远藤航",
  "wenderson-nascimento-galeno": "加莱诺",
  "wilfried-gnonto": "尼奥托",
  "wilfried-singo": "辛戈",
  "wladimiro-falcone": "法尔科内",
  "xaver-schlager": "施拉格尔",
  "yann-sommer": "索默",
  "yannick-carrasco": "卡拉斯科",
  "yassine-bounou": "布努",
  "yazmeen-ryan": "瑞安",
  "yeremy-jesus-pino-santos": "耶雷米·皮诺",
  "yunus-musah": "穆萨",
  "yussuf-poulsen": "波尔森"
};

// ═══════════════════════════════════════════════
//  Load all lookup sources
// ═══════════════════════════════════════════════
const supplement1 = JSON.parse(fs.readFileSync(path.join(BASE, 'data/players/chinese-name-supplement.json'), 'utf8')).mappings;
const nameLib = JSON.parse(fs.readFileSync(path.join(BASE, 'data/players/player-name-zh.json'), 'utf8')).players;
const priceData = JSON.parse(fs.readFileSync(path.join(BASE, 'gold/data/prices/fc26/fc26-first-month.json'), 'utf8'));

const lookup = new Map();
// Batch 1 supplement
for (const [slug, zh] of Object.entries(supplement1)) lookup.set(slug, zh);
// Batch 2
for (const [slug, zh] of Object.entries(batch2)) lookup.set(slug, zh);
// Name library
for (const p of nameLib) { if (p.slug && p.nameZh) lookup.set(p.slug, p.nameZh); }
// Price data
for (const p of (priceData.players||[])) { if (p.slug && p.nameZh) lookup.set(p.slug, p.nameZh); }

console.log('Total lookup entries:', lookup.size);

function slugFromLink(link) {
  if (!link) return '';
  const m = String(link).match(/\/player\/\d+\/([^/?#]+)/);
  return m ? m[1].toLowerCase() : '';
}

function resolveName(slug, name) {
  if (slug && lookup.has(slug)) return lookup.get(slug);
  // Try name as slug
  if (name) {
    const nameAsSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (lookup.has(nameAsSlug)) return lookup.get(nameAsSlug);
  }
  return '';
}

let totalUpdated = 0;
let stillMissing = new Set();

// === ICONS ===
const icons = JSON.parse(fs.readFileSync(path.join(BASE, 'icons/data/prices/fc26/base-icons.json'), 'utf8'));
for (const p of icons.players) {
  if (!p.nameZh || p.nameZh === '') {
    const slug = p.slug || slugFromLink(p.url) || p.name;
    const match = resolveName(slug, p.name);
    if (match) { p.nameZh = match; totalUpdated++; }
    else stillMissing.add(`icon:${p.name}[${slug}]`);
  }
}

// === HEROES ===
const heroes = JSON.parse(fs.readFileSync(path.join(BASE, 'heroes/data/prices/fc26/base-heroes.json'), 'utf8'));
for (const p of heroes.players) {
  if (!p.nameZh || p.nameZh === '') {
    const slug = p.slug || slugFromLink(p.url) || p.name;
    const match = resolveName(slug, p.name);
    if (match) { p.nameZh = match; totalUpdated++; }
    else stillMissing.add(`hero:${p.name}[${slug}]`);
  }
}

// === TOTW ===
const totw = JSON.parse(fs.readFileSync(path.join(BASE, 'totw/data/prices/fc26/totw-1.json'), 'utf8'));
for (const p of totw.players) {
  if (!p.nameZh || p.nameZh === '') {
    const slug = p.slug || slugFromLink(p.url) || p.name;
    const match = resolveName(slug, p.name);
    if (match) { p.nameZh = match; totalUpdated++; }
    else stillMissing.add(`totw:${p.name}[${slug}]`);
  }
}

// === EVOLUTION FC26 ===
const evo = JSON.parse(fs.readFileSync(path.join(BASE, 'evolution/players/fc26/first-month-evo-players.json'), 'utf8'));
for (const group of evo) {
  for (const p of (group.players||[])) {
    if (!p.nameZh || p.nameZh === '') {
      const slug = slugFromLink(p.link);
      const match = resolveName(slug, p.name);
      if (match) { p.nameZh = match; totalUpdated++; }
      else stillMissing.add(`evo26:${p.name}[${slug}]`);
    }
  }
}

// === EVOLUTION FC27 ===
const evo27Raw = JSON.parse(fs.readFileSync(path.join(BASE, 'evolution/players/fc27/eligible-players.json'), 'utf8'));
const evo27 = evo27Raw.players || evo27Raw;
for (const p of evo27) {
  if (!p.nameZh || p.nameZh === '') {
    const slug = p.slug || slugFromLink(p.fc26Url || p.fc27Url) || p.name;
    const match = resolveName(slug, p.name);
    if (match) { p.nameZh = match; totalUpdated++; }
    else stillMissing.add(`evo27:${p.name}[${slug}]`);
  }
}

console.log('\nTotal updated this run:', totalUpdated);
console.log('Still missing:', stillMissing.size);
if (stillMissing.size > 0) {
  console.log('\nStill missing details:');
  for (const m of [...stillMissing]) console.log('  ', m);
}

// Save all updated files
fs.writeFileSync(path.join(BASE, 'icons/data/prices/fc26/base-icons.json'), JSON.stringify(icons, null, 2));
fs.writeFileSync(path.join(BASE, 'heroes/data/prices/fc26/base-heroes.json'), JSON.stringify(heroes, null, 2));
fs.writeFileSync(path.join(BASE, 'totw/data/prices/fc26/totw-1.json'), JSON.stringify(totw, null, 2));
fs.writeFileSync(path.join(BASE, 'evolution/players/fc26/first-month-evo-players.json'), JSON.stringify(evo, null, 2));
fs.writeFileSync(path.join(BASE, 'evolution/players/fc27/eligible-players.json'), JSON.stringify(evo27, null, 2));
console.log('\nAll files saved!');

// Also update the supplement file with batch2
const fullSupplement = { ...supplement1, ...batch2 };
const supplementOut = {
  schemaVersion: 1,
  generatedAt: '2026-08-28',
  source: 'manual + web research',
  description: 'Comprehensive Chinese name mapping for icons, heroes, totw, and evolution players',
  mappings: fullSupplement
};
fs.writeFileSync(path.join(BASE, 'data/players/chinese-name-supplement.json'), JSON.stringify(supplementOut, null, 2));
console.log('Supplement file updated with', Object.keys(fullSupplement).length, 'entries');
