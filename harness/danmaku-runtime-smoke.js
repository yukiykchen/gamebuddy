'use strict';
// 本地假Mod、假模型和真实主进程/renderer链路；不连接游戏或真实API。
const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('path'),fs=require('fs'),os=require('os');
const root=process.env.GAMEBUDDY_TEST_APP_ROOT || path.join(__dirname,'..');
const {WebSocketServer}=require(path.join(root,'node_modules/ws'));
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'gamebuddy-ai-path-')));
BrowserWindow.prototype.showInactive=function(){};
BrowserWindow.prototype.show=function(){};
let requests=0,acks=0;
ipcMain.on('danmaku-presented',()=>acks++);
const server=new WebSocketServer({port:0});
server.on('listening',()=>{
 Object.assign(process.env,{GAMEBUDDY_BRIDGE_URL:`ws://127.0.0.1:${server.address().port}`,GAMEBUDDY_LLM_API_KEY:'synthetic-key',GAMEBUDDY_LLM_BASE_URL:'http://synthetic.invalid/v1',GAMEBUDDY_LLM_MODEL:'synthetic-model',GAMEBUDDY_LLM_WIRE_API:'chat',GAMEBUDDY_LLM_STREAM:'false',GAMEBUDDY_LLM_THINKING:'disabled'});
 global.fetch=async(_url,options)=>{
  const b=JSON.parse(options.body);
  const isAI=b.messages?.[0]?.content?.includes('角色观战弹幕');
  if(isAI){
    requests++;
    if(b.max_tokens !== 800 || b.thinking?.type !== 'disabled' || b.reasoning) throw new Error('Unexpected danmaku request settings');
  }
  const text=isAI?JSON.stringify({phrases:[{text:'齿轮不用说服自己转动。我倒是有点羡慕它。',enemyKeys:[],momentId:null,topic:'self_mockery',motif:'羡慕齿轮'},{text:'想把无用的问题留下来，又不碍谁的事。',enemyKeys:[],momentId:null,topic:'banter',motif:'无用的问题'}]}):JSON.stringify({index:0,reason:'合成对局本地回归'});
  return {ok:true,json:async()=>({choices:[{message:{content:text},finish_reason:'stop'}]})};
 };
 require(path.join(root,'main.js'));
});
server.on('connection',socket=>{
 const state=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/lifecycle.json')))[0];
 state.run.character='defect';state.run.runId='synthetic-live-run';state.combat.combatId='synthetic-fight';
 let n=0;
 const send=()=>{state.timestamp=Date.now();state.player.block=n++; socket.send(JSON.stringify({type:'state',data:state}));};
 setTimeout(send,1500);
 const timer=setInterval(send,1000);socket.on('close',()=>clearInterval(timer));
});
setTimeout(async()=>{
 const states=[];
 for(const w of BrowserWindow.getAllWindows())if(w.webContents.getURL().includes('danmaku.html'))states.push(await w.webContents.executeJavaScript('({ai:document.querySelectorAll("[data-source=ai]").length,all:document.querySelectorAll(".danmaku-item").length})'));
 console.log('PATH_PROBE',JSON.stringify({requests,acks,states}));
 app.exit(requests&&states.some(s=>s.ai===2)&&acks>=2?0:1);
},11000);
