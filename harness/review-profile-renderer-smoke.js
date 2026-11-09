'use strict';
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {buildDashboard}=require('../review/service');
const {makeTimeline}=require('../review/recap/facts');
const {localRecap}=require('../review/recap/runner');
function readRealRecap() {
 if(!process.argv.includes('--real-long-recap'))return null;
 const directory=path.join(__dirname,'..','.runtime','recap-real','inputs');
 const candidates=fs.readdirSync(directory).filter(name=>name.endsWith('.json')).map(name=>{
  const input=JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));
  return {input,name};
 }).filter(row=>Array.isArray(row.input.facts)&&row.input.facts.some(f=>f.eventType==='run.ended'));
 const selected=candidates.sort((a,b)=>b.input.facts.length-a.input.facts.length)[0];
 assert.ok(selected,'A prepared real completed run is required');
 const history=JSON.parse(fs.readFileSync(path.join(os.homedir(),'Library','Application Support','gamebuddy','review-history.v2.json'),'utf8'));
 const run=history.runs.find(run=>run.runId===selected.input.runId&&run.result==='loss');
 assert.ok(run,'The selected run must be a real completed loss');
 const input=selected.input,recap=localRecap(makeTimeline(input.runId,input.facts,input.coverage,input.snapshots),run);
 return {run:buildDashboard({runs:[run]}).recentRuns[0],recap,inputFile:selected.name};
}
const real=readRealRecap();
const counters={typedCardsPlayed:10,attacksPlayed:6,cardsTaken:2,rewardSkips:1,eliteEntries:1,normalCombats:3,shopsVisited:1,knownGoldSpent:60,smiths:1,heals:1,playerBlocked:6,playerHpLoss:4};
let recapCalls=0;
let dashboard=buildDashboard({runs:['win','loss','abandoned'].map((result,i)=>({runId:'profile-'+i,character:i===2?'silent':'ironclad',endedAt:i+1,result,finalAct:1,finalFloor:10,initialDeckSize:10,finalState:{deckSize:12,gold:20,deck:[],relics:[]},counters}))});
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'gamebuddy-profile-')));
ipcMain.handle('review:getDashboard',()=>dashboard);
ipcMain.handle('review:getPlayerProfile',()=>({displayName:'匿名人士'}));
const recapMetrics=['最高回合实际爆发','最高斩杀','实际抗伤','SL次数'].map((label,i)=>({label,display:['10','9999','120','2'][i]}));
const battleMetrics=['累计输出','实际抗伤','累计受伤','实际恢复'].map((label,i)=>({label,display:['1200','480','80','60'][i]}));
ipcMain.handle('review:getRunRecapPreview',(_event,runId)=>real?.run.runId===runId?real.recap:({fixedMetrics:recapMetrics,battleMetrics,cards:[{title:'有点用力过猛',body:'目标只剩十血，这次命中结算远远超出了它的生命。'}]}));
ipcMain.handle('review:getRunRecap',async(_event,runId)=>{
 recapCalls++;await new Promise(resolve=>setTimeout(resolve,80));
 if(real?.run.runId===runId)return real.recap;
 return {status:'ready',fixedMetrics:recapMetrics,battleMetrics,cards:[
  {title:'有点用力过猛',body:'目标只剩十血，这次命中结算远远超出了它的生命。'},
  {title:'升级了，没用上',body:'刚升级的痛击，下一场战斗直到结束也没上手。'},
  {title:'终于运转起来',body:'前面攒下的组件，在这场战斗里接上了配合。'}],closing:'这一局有用力过猛的高光，也留下升级未兑现的遗憾。'};
});
const timer=setTimeout(()=>{console.error('Profile renderer timed out');app.exit(1);},20000);
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1400,height:1050,webPreferences:{preload:path.join(__dirname,'..','preload.js'),contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 await win.loadFile(path.join(__dirname,'..','src','review.html'));
 const settle=()=>win.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await settle();
 let state=await win.webContents.executeJavaScript("({text:document.body.innerText,polygons:document.querySelectorAll('.review-radar-data').length,width:document.documentElement.scrollWidth,viewport:innerWidth})");
 assert.match(state.text,/全角色 · 最近 3 局/);assert.match(state.text,/放弃 1 局/);assert.equal(state.polygons,1);assert.ok(state.width<=state.viewport);
 assert.equal(await win.webContents.executeJavaScript("document.querySelectorAll('.review-stat-row').length"),4);
 assert.equal(await win.webContents.executeJavaScript("document.querySelectorAll('.review-stat-track').length"),3);
 assert.match(state.text,/最多连胜/);
 assert.doesNotMatch(await win.webContents.executeJavaScript("document.querySelector('.review-stats').textContent"),/20张内牌组|火堆升级/);
 assert.equal(await win.webContents.executeJavaScript("document.querySelector('.review-result.abandoned').textContent"),'放弃');
 const output=path.join(__dirname,'..','.runtime','review-profile');fs.mkdirSync(output,{recursive:true});
 fs.writeFileSync(path.join(output,'universal-profile.png'),(await win.webContents.capturePage()).toPNG());
 for(const size of [[1120,720],[850,900]]){win.setSize(...size);await settle();assert.ok(await win.webContents.executeJavaScript('document.documentElement.scrollWidth<=innerWidth'));}
 if(real){dashboard={...dashboard,recentRuns:[real.run,...dashboard.recentRuns]};win.webContents.send('review:changed',dashboard);await settle();}
 await win.webContents.executeJavaScript("document.querySelector('.review-run-card').click()");
 await win.webContents.executeJavaScript('new Promise(resolve=>setTimeout(resolve,150))');await settle();
 const recapState=await win.webContents.executeJavaScript(`({cards:document.querySelectorAll('.review-recap-cards article').length,
  slots:document.querySelectorAll('.review-recap-metrics>div').length,
  focused:document.activeElement?.classList.contains('review-run-card'),
  text:document.querySelector('.review-recap').textContent,width:document.documentElement.scrollWidth,viewport:innerWidth})`);
 assert.equal(recapState.cards,3);assert.equal(recapState.slots,4);assert.equal(recapState.focused,true);
 assert.match(recapState.text,/本局复盘/);assert.match(recapState.text,real?/惜命不惜债/:/升级未兑现/);
 assert.match(recapState.text,/累计输出/);assert.match(recapState.text,/实际恢复/);
 assert.doesNotMatch(recapState.text,/evidenceIds|tool_calls|snapshotId|时间线|展开战报/);
 assert.ok(recapState.width<=recapState.viewport);
 await win.webContents.executeJavaScript("document.querySelector('.review-recap').scrollIntoView({block:'center'})");await settle();
 fs.writeFileSync(path.join(output,'run-recap-narrow.png'),(await win.webContents.capturePage()).toPNG());
 if(real){
  const captureRecap=async file=>{
   await win.webContents.executeJavaScript("document.querySelector('.review-recap').scrollIntoView({block:'start'})");await settle();
   const rect=await win.webContents.executeJavaScript(`(()=>{const r=document.querySelector('.review-recap').getBoundingClientRect();return {x:Math.round(r.x),y:Math.max(0,Math.round(r.y)),width:Math.floor(r.width),height:Math.min(Math.floor(r.height),innerHeight-Math.max(0,Math.round(r.y)))}})()`);
   fs.writeFileSync(path.join(output,file),(await win.webContents.capturePage(rect)).toPNG());
  };
  const background=await win.webContents.executeJavaScript("getComputedStyle(document.querySelector('.review-recap'),'::before').backgroundImage");
  assert.ok(background.includes('spire-campfire-v1.png'));
  await captureRecap('real-run-recap-narrow.png');
  win.setSize(1400,1050);await settle();await captureRecap('real-run-recap-wide.png');
  assert.ok(await win.webContents.executeJavaScript('document.documentElement.scrollWidth<=innerWidth'));
  fs.writeFileSync(path.join(output,'real-run-recap.json'),JSON.stringify({inputFile:real.inputFile,runId:real.run.runId,
   summary:real.recap.runSummary,metrics:real.recap.battleMetrics,portrait:real.recap.portrait,
   cards:real.recap.cards.map(({title,body})=>({title,body})),closing:real.recap.closing},null,2));
 }
 await win.webContents.executeJavaScript("document.querySelector('.review-run-card').click();document.querySelector('.review-run-card').click()");
 await settle();assert.equal(recapCalls,1,'Reopening must read the same recap cache');
 win.setSize(1400,1050);await settle();
 const recapMarkup=await win.webContents.executeJavaScript("document.querySelector('.review-recap').outerHTML");
 await win.webContents.executeJavaScript("document.querySelectorAll('.review-recap-cards article').forEach((node,index)=>{if(index>0)node.remove()})");await settle();
 assert.ok(await win.webContents.executeJavaScript("(()=>{const card=document.querySelector('.review-recap-cards article'),list=card.parentElement;return card.getBoundingClientRect().width>=list.getBoundingClientRect().width-1})()"),'A single story should fill the available width');
 await win.webContents.executeJavaScript(`document.querySelector('.review-recap').outerHTML=${JSON.stringify(recapMarkup)}`);await settle();
 assert.doesNotMatch(await win.webContents.executeJavaScript('document.body.innerText'), /排行榜/);
 assert.match(await win.webContents.executeJavaScript('document.body.innerText'), /榜上名称/);
 dashboard={...dashboard,axes:dashboard.axes.map((a,i)=>i===0?{...a,value:null}:a)};
 win.webContents.send('review:changed',dashboard);await settle();
 state=await win.webContents.executeJavaScript("({text:document.body.innerText,polygons:document.querySelectorAll('.review-radar-data').length})");
 assert.equal(state.polygons,0);assert.ok(state.text.includes('等待'+dashboard.axes[0].label+'数据'));assert.doesNotMatch(state.text,/再完成 0 局/);
 clearTimeout(timer);win.destroy();console.log('Universal review, three result states, unknown axes and responsive renderer passed: '+output);app.exit(0);
}).catch(e=>{console.error(e);clearTimeout(timer);app.exit(1);});
