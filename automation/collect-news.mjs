// 作用：在限定时长内启动并监管FC27资讯采集进程，只终止本次创建的进程组。
import {spawn} from 'node:child_process';import path from 'node:path';import {root,reportDate} from '../shared/lib/runtime.mjs';
const date=reportDate(process.argv[2]);const requested=Number(process.env.FC_NEWS_MAX_MS);const maxMs=Number.isFinite(requested)&&requested>0?Math.min(requested,10*60000):10*60000;const child=spawn('bash',[path.join(root,'apps/news/auto_news.sh')],{env:{...process.env,FC_REPORT_DATE:date},detached:true,stdio:'inherit'});let expired=false,killTimer;
const timer=setTimeout(()=>{expired=true;try{process.kill(-child.pid,'SIGTERM');}catch{}killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},5000);},maxMs);
child.on('error',e=>{clearTimeout(timer);console.error(e.message);process.exitCode=1;});child.on('exit',code=>{clearTimeout(timer);if(killTimer&&!expired)clearTimeout(killTimer);if(expired)console.error('新闻采集达到10分钟上限；停止本轮采集，保留已有数据供收尾。');process.exitCode=expired?124:(code??1);});
