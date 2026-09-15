// 作用：管理足球、资讯、市场任务的运行所有权、证据校验、重跑归档和不可变快照。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {root,reportDate,atomicWrite,readJSON} from '../shared/lib/runtime.mjs';
export const outputs={news:d=>`reports/daily/${d}/news.html`,football:d=>`reports/daily/${d}/football.html`,market:d=>`reports/daily/${d}/market.html`,evolution:d=>`reports/daily/${d}/evolution.html`};
export const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const archivedEntries=['owner.json','state.json','report.html','tweets.json','evidence.json','work','legacy-work'];
function archivePreviousRun(dir,now){
 const previous=readJSON(path.join(dir,'state.json'),readJSON(path.join(dir,'owner.json'),{}));
 const label=String(previous?.runId||new Date(now).toISOString().replace(/[:.]/g,'-'));
 const archiveDir=path.join(dir,'attempts',label);fs.mkdirSync(archiveDir,{recursive:true});
 for(const entry of archivedEntries){const source=path.join(dir,entry);if(fs.existsSync(source))fs.renameSync(source,path.join(archiveDir,entry));}
 return path.relative(root,archiveDir);
}
function activeRun(dir){
 const owner=readJSON(path.join(dir,'owner.json'),null);
 const state=readJSON(path.join(dir,'state.json'),owner);
 return state?.status==='running'?owner:null;
}
export function prepareRerun(module,date,now=Date.now()){
 if(!outputs[module])throw Error('unknown module');date=reportDate(date);
 const dir=path.join(root,'automation/runs',date,module);fs.mkdirSync(dir,{recursive:true});
 if(!fs.existsSync(path.join(dir,'owner.json')))return {prepared:true,module,date,previousAttempt:null};
 const owner=activeRun(dir);if(owner)return {prepared:false,module,date,reason:'当前运行仍在进行，拒绝归档或启动重跑。',owner};
 return {prepared:true,module,date,previousAttempt:archivePreviousRun(dir,now)};
}
function taskEnabled(module){
 const config=readJSON(path.join(root,'shared/config/project.json'),null);
 const task=config?.tasks?.find(item=>item.id===module);
 // Daily content tasks are enabled by default. A skip is only valid after the
 // project configuration records an explicit pause.
 return task?.enabled!==false;
}
export function begin(module,date,{rerun=false,now=Date.now()}={}){
 if(!outputs[module])throw Error('unknown module');date=reportDate(date);
 const dir=path.join(root,'automation/runs',date,module);fs.mkdirSync(dir,{recursive:true});
 let previousAttempt=null;
 if(rerun&&fs.existsSync(path.join(dir,'owner.json'))){const owner=activeRun(dir);if(owner)return {accepted:false,reason:'当前运行仍在进行，拒绝启动重跑。',owner};previousAttempt=archivePreviousRun(dir,now);}
 const lock=path.join(dir,'owner.json');let fd;
 try{fd=fs.openSync(lock,'wx');}catch(e){if(e.code==='EEXIST')return {accepted:false,reason:'本日任务已启动或已完成；不重复运行。需要重跑时使用明确的重跑日期目录流程。',owner:readJSON(lock,null)};throw e;}
 const record={module,date,runId:crypto.randomUUID(),status:'running',startedAt:new Date(now).toISOString(),deadlineAt:new Date(now+15*60000).toISOString(),reportPath:outputs[module](date),...(previousAttempt?{previousAttempt}: {})};
 fs.writeFileSync(fd,JSON.stringify(record));fs.closeSync(fd);atomicWrite(path.join(dir,'state.json'),JSON.stringify(record,null,2));return {accepted:true,...record};
}
export function finish(module,date,runId,status,evidencePath,now=Date.now()){
 date=reportDate(date);if(!outputs[module])throw Error('unknown module');const dir=path.join(root,'automation/runs',date,module);const statePath=path.join(dir,'state.json');const state=readJSON(statePath,null);
 if(!state||state.runId!==runId||state.status!=='running')throw Error('运行所有者不匹配或已经结束，拒绝覆盖');
 if(!['success','partial','failed','skipped'].includes(status))throw Error('invalid status');
 if(status==='skipped'&&taskEnabled(module))throw Error(`${module} 任务仍处于启用状态，不能标记为 skipped；采集或生成失败请提交 failed，数据不完整请提交 partial`);
 const evidence=evidencePath?readJSON(path.resolve(evidencePath),null):null;
 const result={...state,status,completedAt:new Date(now).toISOString(),evidence};
 if(['success','partial'].includes(status)){
  if(now>Date.parse(state.startedAt)+20*60000)throw Error('超过提交期限，不接受迟到版本');
  const file=path.join(root,state.reportPath),html=fs.readFileSync(file);const stat=fs.statSync(file);
  if(stat.mtimeMs<Date.parse(state.startedAt)||!html.includes(Buffer.from(date))||!/<\/html>/i.test(html.toString()))throw Error('不是本轮新生成的完整报告');
  if(!evidence||evidence.date!==date||!Array.isArray(evidence.sources)||!evidence.sources.length)throw Error('缺少本轮来源记录');
  const startedAt=Date.parse(state.startedAt);
  if(evidence.sources.some(source=>!Number.isFinite(Date.parse(source.openedAt))||Date.parse(source.openedAt)<startedAt))throw Error('来源记录不是本轮实际打开，拒绝复用旧证据');
  if(status==='success' && (evidence.missingItems?.length || evidence.missing?.length)) result.status='partial';
  result.sha256=digest(html);result.bytes=html.length;result.snapshotPath=path.join(dir,'report.html');atomicWrite(result.snapshotPath,html.toString());
  const newsData=path.join(root,`apps/news/data/tweets-${date}.json`);if(module==='news'&&fs.existsSync(newsData)){const data=readJSON(newsData,null);if(data?.date===date)atomicWrite(path.join(dir,'tweets.json'),JSON.stringify(data));}
 }
 atomicWrite(statePath,JSON.stringify(result,null,2));return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [cmd,module,date,token,status,evidence]=process.argv.slice(2);const result=cmd==='begin'?begin(module,date,{rerun:process.argv.includes('--rerun')}):cmd==='prepare-rerun'?prepareRerun(module,date):cmd==='finish'?finish(module,date,token,status,evidence):(()=>{throw Error('Use begin MODULE DATE [--rerun], prepare-rerun MODULE DATE, or finish MODULE DATE RUN_ID STATUS EVIDENCE_JSON');})();console.log(JSON.stringify(result,null,2));}catch(e){console.error(e.message);process.exitCode=1;}
}
