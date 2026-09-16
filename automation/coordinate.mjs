// 作用：等待三个内容任务的不可变快照，在隔离目录合并日报并刷新固定汇总入口。
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';
import {root,reportDate,atomicWrite,readJSON} from '../shared/lib/runtime.mjs';import {outputs,digest} from './run-state.mjs';
const codeRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const date=reportDate(process.argv[2]);const dir=path.join(root,'automation/runs',date);fs.mkdirSync(dir,{recursive:true});
const rerun=process.argv.includes('--rerun');
function archiveCoordinator(){
 const previous=readJSON(path.join(dir,'coordinator-state.json'),{});const label=String(previous.completedAt||new Date().toISOString()).replace(/[:.]/g,'-');const archive=path.join(dir,'coordinator-attempts',label);fs.mkdirSync(archive,{recursive:true});
 for(const entry of ['coordinator.lock','coordinator-state.json']){const source=path.join(dir,entry);if(fs.existsSync(source))fs.renameSync(source,path.join(archive,entry));}
 return path.relative(root,archive);
}
if(process.argv.includes('--prepare-rerun')){console.log(JSON.stringify({prepared:true,date,previousAttempt:fs.existsSync(path.join(dir,'coordinator.lock'))?archiveCoordinator():null},null,2));process.exit(0);}
if(rerun&&fs.existsSync(path.join(dir,'coordinator.lock')))archiveCoordinator();
let lock;try{lock=fs.openSync(path.join(dir,'coordinator.lock'),'wx');fs.writeFileSync(lock,String(process.pid));fs.closeSync(lock);}catch(e){if(e.code==='EEXIST'){console.log('本日协调任务已执行或正在执行；不重复合并。');process.exit(0);}throw e;}
const started=Date.now();const deadline=started+20*60000;const modules=['football','news','market'];
function readStage(module){try{return readJSON(path.join(dir,module,'state.json'),null);}catch{return {status:'failed',reason:'invalid_state_json'};}}
let states={};
while(true){states=Object.fromEntries(modules.map(m=>[m,readStage(m)]));if(modules.every(m=>states[m]&&states[m].status!=='running')||Date.now()>=deadline)break;console.log(JSON.stringify({phase:'waiting',date,states:Object.fromEntries(modules.map(m=>[m,states[m]?.status||'not_started']))}));await new Promise(r=>setTimeout(r,30000));}
// 进化专栏与传奇/英雄监控均为可选模块：只记录状态，不阻塞合并等待
states.evolution=readStage('evolution');
states['icons-heroes']=readStage('icons-heroes');
const status={date,startedAt:new Date(started).toISOString(),modules:states,publish:'not_attempted',unattendedPublishingVerified:false};
const stage=fs.mkdtempSync(path.join(os.tmpdir(),'fc-merge-'));let valid=0;
try{
 fs.mkdirSync(path.join(stage,'daily-merged'),{recursive:true});fs.mkdirSync(path.join(stage,'reports/daily'),{recursive:true});
 const historyRoot=path.join(root,'reports/daily');
 if(fs.existsSync(historyRoot))for(const entry of fs.readdirSync(historyRoot)){if(/^\d{4}-\d{2}-\d{2}$/.test(entry)&&entry!==date)fs.cpSync(path.join(historyRoot,entry),path.join(stage,'reports/daily',entry),{recursive:true});}
 const todayAssets=path.join(historyRoot,date,'assets');if(fs.existsSync(todayAssets))fs.cpSync(todayAssets,path.join(stage,'reports/daily',date,'assets'),{recursive:true});
 // 当日附属产物（非模块快照）：市场扫描子页、进化专栏、传奇/英雄监控子页等，需一并进隔离目录才能被合并脚本读到
 // 可选模块：有已完成快照就用快照（校验 sha256），否则直接复制当日文件（缺失则不算失败）
 const optionalPanels=[{module:'evolution',file:'evolution.html'},{module:'icons-heroes',file:'icons-heroes.html'}];
 for(const opt of optionalPanels){
  const optState=readStage(opt.module);let optWritten=false;
  if(optState&&['success','partial'].includes(optState.status)&&optState.snapshotPath&&fs.existsSync(optState.snapshotPath)){
   const buf=fs.readFileSync(optState.snapshotPath);
   if(digest(buf)===optState.sha256){const dst=path.join(stage,'reports/daily',date,opt.file);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.writeFileSync(dst,buf);optWritten=true;}
  }
  if(!optWritten){const src=path.join(historyRoot,date,opt.file);if(fs.existsSync(src)){const dst=path.join(stage,'reports/daily',date,opt.file);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst);}}
 }
 for(const extra of ['market-scan.html']){const src=path.join(historyRoot,date,extra);if(fs.existsSync(src)){const dst=path.join(stage,'reports/daily',date,extra);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst);}}
 const portalAssets=path.join(root,'apps/portal/assets');if(fs.existsSync(portalAssets))fs.cpSync(portalAssets,path.join(stage,'apps/portal/assets'),{recursive:true});
 // 传奇卡研究底稿是跨日期常驻内容（「传奇/英雄专栏」的「传奇卡研究」子标签的内容源），必须一并进隔离目录
 const iconReports=path.join(root,'apps/market/engine/icons/reports');if(fs.existsSync(iconReports))fs.cpSync(iconReports,path.join(stage,'apps/market/engine/icons/reports'),{recursive:true});
 let available=0,failedPanels=0;
 for(const module of modules){const state=states[module];if(state?.status==='success'&&(state.evidence?.missingItems?.length||state.evidence?.missing?.length))state.status='partial';if(!state||!['success','partial','failed'].includes(state.status)||!state.snapshotPath||!fs.existsSync(state.snapshotPath))continue;const buf=fs.readFileSync(state.snapshotPath);if(digest(buf)!==state.sha256)throw Error(module+' snapshot changed');const target=path.join(stage,outputs[module](date));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,buf);available++;if(state.status==='failed')failedPanels++;else valid++;const data=path.join(dir,module,'tweets.json');if(module==='news'&&fs.existsSync(data)){const targetData=path.join(stage,`apps/news/data/tweets-${date}.json`);fs.mkdirSync(path.dirname(targetData),{recursive:true});fs.copyFileSync(data,targetData);}}
 if(!available){status.merge='no_current_snapshot';status.publish='skipped';}
 else{
 const merge=spawnSync(process.execPath,[path.join(codeRoot,'apps/portal/merge_daily_report.mjs'),date],{env:{...process.env,FC_PROJECT_ROOT:stage},encoding:'utf8',timeout:60000});if(merge.status!==0)throw Error('merge failed: '+merge.stderr);
 atomicWrite(path.join(root,`reports/daily/${date}/summary.html`),fs.readFileSync(path.join(stage,`reports/daily/${date}/summary.html`),'utf8'));
 atomicWrite(path.join(root,'daily-merged/index.html'),fs.readFileSync(path.join(stage,'daily-merged/index.html'),'utf8'));
 // 同步历史日报独立归档目录（stage 里合并脚本已生成/补齐 archive/*.html）
 const stageArchive=path.join(stage,'daily-merged','archive');if(fs.existsSync(stageArchive)){fs.mkdirSync(path.join(root,'daily-merged','archive'),{recursive:true});for(const f of fs.readdirSync(stageArchive)){if(f.endsWith('.html'))fs.copyFileSync(path.join(stageArchive,f),path.join(root,'daily-merged','archive',f));}}
 // 同步共享静态资源（海报等），保证线上多文件站点相对路径可用
 const stageAssets=path.join(stage,'daily-merged','assets');if(fs.existsSync(stageAssets)){fs.mkdirSync(path.join(root,'daily-merged','assets'),{recursive:true});for(const f of fs.readdirSync(stageAssets))fs.copyFileSync(path.join(stageAssets,f),path.join(root,'daily-merged','assets',f));}
 status.merge=valid?'success':'status_only';status.indexSha256=digest(fs.readFileSync(path.join(root,'daily-merged/index.html')));status.failedPanels=failedPanels;
 // 发布交由 WorkBuddy 站点发布能力完成：agent 在同一会话内对 daily-merged/ 调用 sites 发布。
 // 不再使用 DuMate 单文件 artifact 通道，也不再于此处猜测发布接口。
 status.publish='delegated';
 status.publishTarget={kind:'workbuddy-sites',directory:path.join(root,'daily-merged'),entry:'index.html'};
 status.reason=valid?'本地已合并；发布交由 WorkBuddy 站点发布能力执行（每日任务在 coordinate 成功后调用 sites 发布 daily-merged/）。':'本日采集全部失败；已生成如实的当日状态页，发布后保留历史日报且不以旧数据冒充今日内容。';
 }
}catch(e){status.error=e.message;status.merge=status.merge||'failed';}finally{status.completedAt=new Date().toISOString();atomicWrite(path.join(dir,'coordinator-state.json'),JSON.stringify(status,null,2));fs.rmSync(stage,{recursive:true,force:true});}
console.log(JSON.stringify(status,null,2));
