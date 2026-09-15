// 作用：验证任务唯一所有者、超时终止、迟到提交拒绝及协调器失败边界。
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
test('single owner, stale output rejection, immutable completion and coordinator bounded failure',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fc-execution-test-'));const date='2026-09-11';const env={...process.env,FC_PROJECT_ROOT:root};const run=(...args)=>spawnSync(process.execPath,[path.join(here,'run-state.mjs'),...args],{env,encoding:'utf8'});
 try{
 const report=path.join(root,`reports/daily/${date}/football.html`);fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(report,`<html>${date}</html>`);fs.utimesSync(report,1,1);
 const state=JSON.parse(run('begin','football',date).stdout);assert.equal(state.accepted,true);assert.equal(JSON.parse(run('begin','football',date).stdout).accepted,false);
 const evidence=path.join(root,'evidence.json');fs.writeFileSync(evidence,JSON.stringify({date,sources:[{url:'https://example.com/report',openedAt:new Date().toISOString()}]}));
 assert.notEqual(run('finish','football',date,state.runId,'success',evidence).status,0);
 fs.writeFileSync(report,`<html>${date} current</html>`);
 const done=run('finish','football',date,state.runId,'partial',evidence);assert.equal(done.status,0,done.stderr);const snapshot=JSON.parse(done.stdout).snapshotPath;fs.writeFileSync(report,'changed later');assert.match(fs.readFileSync(snapshot,'utf8'),/current/);
 assert.notEqual(run('finish','football',date,state.runId,'success',evidence).status,0);
 const news=JSON.parse(run('begin','news',date).stdout);assert.equal(run('finish','news',date,news.runId,'failed').status,0);
 const market=JSON.parse(run('begin','market',date).stdout);const rejectedSkip=run('finish','market',date,market.runId,'skipped');assert.notEqual(rejectedSkip.status,0);assert.match(rejectedSkip.stderr,/仍处于启用状态/);assert.equal(run('finish','market',date,market.runId,'failed').status,0);
 fs.mkdirSync(path.join(root,'daily-merged'),{recursive:true});
 const coordinated=spawnSync(process.execPath,[path.join(here,'coordinate.mjs'),date],{env,encoding:'utf8',timeout:5000});assert.equal(coordinated.status,0,coordinated.stderr);
 const result=JSON.parse(fs.readFileSync(path.join(root,'automation/runs',date,'coordinator-state.json')));assert.equal(result.merge,'success');assert.equal(result.publish,'blocked');assert.equal(result.modules.news.status,'failed');assert.equal(result.modules.market.status,'failed');assert.ok(fs.existsSync(path.join(root,'daily-merged/index.html')));
 const duplicate=spawnSync(process.execPath,[path.join(here,'coordinate.mjs'),date],{env,encoding:'utf8',timeout:1000});assert.equal(duplicate.status,0);assert.match(duplicate.stdout,/不重复合并/);
 const rerun=JSON.parse(run('begin','football',date,'--rerun').stdout);assert.equal(rerun.accepted,true);assert.match(rerun.previousAttempt,/attempts/);assert.ok(fs.existsSync(path.join(root,rerun.previousAttempt,'report.html')));assert.equal(run('finish','football',date,rerun.runId,'failed').status,0);
 const coordinateRerun=spawnSync(process.execPath,[path.join(here,'coordinate.mjs'),date,'--rerun'],{env,encoding:'utf8',timeout:5000});assert.equal(coordinateRerun.status,0,coordinateRerun.stderr);assert.ok(fs.existsSync(path.join(root,'automation/runs',date,'coordinator-attempts')));
 const prepared=JSON.parse(run('prepare-rerun','football',date).stdout);assert.equal(prepared.prepared,true);assert.ok(prepared.previousAttempt);assert.equal(fs.existsSync(path.join(root,'automation/runs',date,'football/owner.json')),false);

 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('skipped is accepted only after the task is explicitly disabled',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fc-disabled-task-test-'));const date='2026-09-11';const env={...process.env,FC_PROJECT_ROOT:root};const run=(...args)=>spawnSync(process.execPath,[path.join(here,'run-state.mjs'),...args],{env,encoding:'utf8'});
 try{
  const config=path.join(root,'shared/config/project.json');fs.mkdirSync(path.dirname(config),{recursive:true});fs.writeFileSync(config,JSON.stringify({tasks:[{id:'market',enabled:false}]}));
  const market=JSON.parse(run('begin','market',date).stdout);const skipped=run('finish','market',date,market.runId,'skipped');assert.equal(skipped.status,0,skipped.stderr);assert.equal(JSON.parse(skipped.stdout).status,'skipped');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('late submissions cannot replace a report snapshot',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fc-deadline-test-'));const date='2026-09-11';const env={...process.env,FC_PROJECT_ROOT:root};const script=path.join(here,'run-state.mjs');
 try{
  const first=spawnSync(process.execPath,[script,'begin','news',date],{env,encoding:'utf8'});const state=JSON.parse(first.stdout);const statePath=path.join(root,'automation/runs',date,'news/state.json');state.startedAt=new Date(Date.now()-21*60000).toISOString();fs.writeFileSync(statePath,JSON.stringify(state));
  const result=spawnSync(process.execPath,[script,'finish','news',date,state.runId,'success'],{env,encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/超过提交期限/);assert.equal(JSON.parse(fs.readFileSync(statePath)).status,'running');
  const failed=spawnSync(process.execPath,[script,'finish','news',date,state.runId,'failed'],{env,encoding:'utf8'});assert.equal(failed.status,0);assert.equal(JSON.parse(fs.readFileSync(statePath)).status,'failed');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('news child process is actually stopped at its hard deadline',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fc-child-timeout-'));const script=path.join(root,'apps/news/auto_news.sh');fs.mkdirSync(path.dirname(script),{recursive:true});fs.writeFileSync(script,'#!/bin/bash\nsleep 30\n');
 try{const started=Date.now();const result=spawnSync(process.execPath,[path.join(here,'collect-news.mjs'),'2026-09-11'],{env:{...process.env,FC_PROJECT_ROOT:root,FC_NEWS_MAX_MS:'100'},encoding:'utf8',timeout:7000});assert.equal(result.status,124,result.stderr);assert.ok(Date.now()-started<6500);assert.match(result.stderr,/上限/);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
