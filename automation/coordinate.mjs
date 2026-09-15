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
const status={date,startedAt:new Date(started).toISOString(),modules:states,publish:'not_attempted',unattendedPublishingVerified:false};
const stage=fs.mkdtempSync(path.join(os.tmpdir(),'fc-merge-'));let valid=0;
try{
 fs.mkdirSync(path.join(stage,'daily-merged'),{recursive:true});fs.mkdirSync(path.join(stage,'reports/daily'),{recursive:true});
 const historyRoot=path.join(root,'reports/daily');
 if(fs.existsSync(historyRoot))for(const entry of fs.readdirSync(historyRoot)){if(/^\d{4}-\d{2}-\d{2}$/.test(entry)&&entry!==date)fs.cpSync(path.join(historyRoot,entry),path.join(stage,'reports/daily',entry),{recursive:true});}
 for(const module of modules){const state=states[module];if(state?.status==='success'&&(state.evidence?.missingItems?.length||state.evidence?.missing?.length))state.status='partial';if(!state||!['success','partial'].includes(state.status))continue;const buf=fs.readFileSync(state.snapshotPath);if(digest(buf)!==state.sha256)throw Error(module+' snapshot changed');const target=path.join(stage,outputs[module](date));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,buf);valid++;const data=path.join(dir,module,'tweets.json');if(module==='news'&&fs.existsSync(data)){const targetData=path.join(stage,`apps/news/data/tweets-${date}.json`);fs.mkdirSync(path.dirname(targetData),{recursive:true});fs.copyFileSync(data,targetData);}}
 if(!valid){status.merge='no_current_snapshot';status.publish='skipped';}
 else{
 const merge=spawnSync(process.execPath,[path.join(codeRoot,'apps/portal/merge_daily_report.mjs'),date],{env:{...process.env,FC_PROJECT_ROOT:stage},encoding:'utf8',timeout:60000});if(merge.status!==0)throw Error('merge failed: '+merge.stderr);
 atomicWrite(path.join(root,`reports/daily/${date}/summary.html`),fs.readFileSync(path.join(stage,`reports/daily/${date}/summary.html`),'utf8'));
 atomicWrite(path.join(root,'daily-merged/index.html'),fs.readFileSync(path.join(stage,'daily-merged/index.html'),'utf8'));
 status.merge='success';status.indexSha256=digest(fs.readFileSync(path.join(root,'daily-merged/index.html')));
 // No guessed APIs, credentials, or unbounded agent exploration. A configured publisher must be an executable file.
 const publisher=path.join(root,'automation/publisher');
 if(!fs.existsSync(publisher)){status.publish='blocked';status.reason='未安装经过验证的无人值守发布器；保留原线上版本。';}
 else{const pub=spawnSync(publisher,[date,path.join(root,'daily-merged/index.html')],{timeout:120000,stdio:'ignore'});if(pub.status!==0){status.publish='failed';status.reason=pub.error?.code||'publisher_exit_'+pub.status;}else{const verify=spawnSync(process.execPath,[path.join(codeRoot,'automation/verify-publication.mjs'),date],{timeout:30000,encoding:'utf8'});status.publish=verify.status===0?'verified':'verification_failed';status.unattendedPublishingVerified=verify.status===0;}}
 }
}catch(e){status.error=e.message;status.merge=status.merge||'failed';}finally{status.completedAt=new Date().toISOString();atomicWrite(path.join(dir,'coordinator-state.json'),JSON.stringify(status,null,2));fs.rmSync(stage,{recursive:true,force:true});}
console.log(JSON.stringify(status,null,2));
