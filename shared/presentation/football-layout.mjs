// 作用：把足球日报适配为统一联赛布局，并保留原始数据、来源链接与历史交互。
export function footballLayout(html) {
  if (!html.includes('id="table-content"') || !html.includes('class="news-card"')) return html;
  if (html.includes('id="fc-league-layout"')) return html;
  // A missing league must never silently display Premier League data.
  html = html.replace(/scorersData\[currentLeague\] \|\| scorersData\.epl/g, 'scorersData[currentLeague] || []')
    .replace(/assistsData\[currentLeague\] \|\| assistsData\.epl/g, 'assistsData[currentLeague] || []');
  const style = `<style id="fc-league-layout">
#fc-football-controls{margin:12px 0 24px}.fc-leagues{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:20px 0}.fc-leagues button{background:#1d271b;color:#f5f4eb;border:1px solid #30392f;border-radius:7px;padding:18px;text-align:left;font:700 20px/1.5 inherit;cursor:pointer}.fc-leagues strong{font-size:20px;display:block}.fc-leagues small{display:block;font-size:11px;color:#aeb5aa;margin-top:12px}.fc-leagues button.active{background:#33201c;border-color:#e3b341;color:#e3b341}.fc-types{display:flex;gap:24px;border-bottom:1px solid #30392f}.fc-types button{font:16px inherit;background:none;color:#aeb5aa;border:0;border-bottom:3px solid transparent;padding:10px 0;cursor:pointer}.fc-types button.active{color:#e3b341;border-color:#e3b341}.fc-search{width:100%;padding:15px 18px;margin:20px 0 8px;background:#161e18;color:#f5f4eb;border:1px solid #3a4438;border-radius:6px;font:16px inherit}.fc-context{font-size:14px;color:#aeb5aa;margin:12px 0}.fc-empty{padding:35px 20px;color:#aeb5aa;border:1px solid #30392f;border-radius:8px}.fc-layout .standings-header,.fc-layout .league-tabs,.fc-layout .news-filter-tabs,.fc-layout .news-header,.fc-layout .section-divider{display:none!important}.fc-layout .news-section{border:0!important;background:none!important}.fc-layout .news-grid{padding:0!important}.fc-layout .news-card{padding:8px!important}.fc-layout .card-title{font-size:21px!important}.fc-layout .card-summary{display:block!important;overflow:visible!important;font-size:16px!important}.fc-layout .card-top,.fc-layout .card-footer{border:0!important}.fc-layout .card-footer{padding:12px 18px!important}.fc-layout .news-card[data-league="toutiao"]{border-top:1px solid #30392f!important}.fc-layout .standings-section{margin-top:20px}.fc-layout .table-wrapper{padding:16px!important}.fc-layout [hidden]{display:none!important}@media(min-width:1200px){.fc-leagues{grid-template-columns:repeat(8,minmax(0,1fr))}.fc-leagues button{padding:16px 12px}.fc-leagues small{font-size:10px}}@media(max-width:600px){.fc-leagues{grid-template-columns:repeat(2,minmax(0,1fr))}.fc-types{gap:20px}.fc-layout .card-title{font-size:19px!important}}
</style>`;
  const script = `<script id="fc-league-controller">
(()=>{
const standings=document.querySelector('.standings-section'),news=document.querySelector('.news-section');if(!standings||!news)return;
document.body.classList.add('fc-layout');
const leagues=[['epl','英超','PREMIER LEAGUE'],['laliga','西甲','LALIGA'],['bundesliga','德甲','BUNDESLIGA'],['seriea','意甲','SERIE A'],['ligue1','法甲','LIGUE 1'],['ucl','欧冠','CHAMPIONS LEAGUE'],['mls','美职联','MLS'],['saudi','沙特联','SAUDI PRO LEAGUE']];
const types=[['news','新闻'],['standings','积分榜'],['scorers','射手榜'],['assists','助攻榜']];
const controls=document.createElement('section');controls.id='fc-football-controls';
controls.innerHTML='<div class="fc-context">按联赛跟进新闻与数据排行</div><div class="fc-leagues" role="group" aria-label="选择联赛">'+leagues.map(([id,label,en])=>'<button type="button" data-fc-league="'+id+'"><strong>'+label+'</strong><small>'+en+'</small></button>').join('')+'</div><div class="fc-types" role="group" aria-label="内容分类">'+types.map(([id,label])=>'<button type="button" data-fc-type="'+id+'">'+label+'</button>').join('')+'</div><input class="fc-search" type="search" aria-label="搜索球队、球员或关键词" placeholder="搜索球队、球员或关键词…"><div class="fc-context" id="fc-result-count" role="status"></div>';
standings.before(controls);const empty=document.createElement('p');empty.className='fc-empty';empty.hidden=true;news.after(empty);
let league='epl',type='news';const cards=Array.from(news.querySelectorAll('.news-card'));
function matches(card){return card.dataset.league===league||!!card.querySelector('.tag-'+league);}
function render(){
const query=controls.querySelector('input').value.trim().toLowerCase();controls.querySelectorAll('[data-fc-league]').forEach(b=>{b.classList.toggle('active',b.dataset.fcLeague===league);b.setAttribute('aria-pressed',String(b.dataset.fcLeague===league));});controls.querySelectorAll('[data-fc-type]').forEach(b=>{b.classList.toggle('active',b.dataset.fcType===type);b.setAttribute('aria-pressed',String(b.dataset.fcType===type));});
news.hidden=type!=='news';standings.hidden=type==='news';empty.hidden=true;
let count=0;
if(type==='news'){cards.forEach(card=>{const visible=matches(card)&&card.textContent.toLowerCase().includes(query);card.classList.toggle('hidden',!visible);if(visible)count++;});}
else{
try{switchLeague(league);switchType(type);}catch{document.getElementById('table-content').textContent='该联赛暂无可用榜单数据。';}
const tables=standings.querySelectorAll('table');tables.forEach(table=>{Array.from(table.rows).forEach(row=>{if(row.querySelector('th'))return;const visible=row.textContent.toLowerCase().includes(query);row.hidden=!visible;if(visible)count++;});});
}
const label=leagues.find(l=>l[0]===league)[1];document.getElementById('fc-result-count').textContent=label+' · '+types.find(t=>t[0]===type)[1]+' · '+count+(type==='news'?' 条':' 项');
if(!count){empty.textContent=query?'没有匹配的内容，请调整关键词。':'该联赛暂无'+(type==='news'?'可归类的新闻':'已收录的榜单数据')+'。';empty.hidden=false;}
}
controls.querySelectorAll('[data-fc-league]').forEach(b=>b.onclick=()=>{league=b.dataset.fcLeague;render();});controls.querySelectorAll('[data-fc-type]').forEach(b=>b.onclick=()=>{type=b.dataset.fcType;render();});controls.querySelector('input').addEventListener('input',render);render();
})();
</script>`;
  return html.replace('</head>',style+'</head>').replace('</body>',script+'</body>');
}
