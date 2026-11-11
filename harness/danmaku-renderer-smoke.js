'use strict';

// 用真实 Electron renderer 和 preload 验证消息幂等与上屏确认，不启动主应用或联网。
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DanmakuBridgeAdapter } = require('../agent/danmaku/bridge-adapter');
const { DanmakuDirector } = require('../agent/danmaku/director');
const { createComposerHost, showComposerHost, setComposerExpanded } = require('../src/danmaku-composer-window');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'gamebuddy-danmaku-smoke-'));
app.setPath('userData', userData);
let window;
let composerHost;
let now = 0;
const director = new DanmakuDirector({ now: () => now });
const scope = { runId: 'smoke', sceneId: 'smoke-combat', stateRevision: 1 };
director.setContext(scope);
let confirmations = 0;
ipcMain.on('danmaku-presented', (event, id) => {
  if (event.sender !== window?.webContents) return;
  confirmations += 1;
  director.acknowledgePresented(id);
});
ipcMain.handle('get-danmaku-stats', () => director.presentationStats());
ipcMain.handle('get-shared-danmaku-context', event =>
  event.sender === composerHost?.webContents ? { sceneKey: 'composer-smoke', phase: 'combat' } : null);
let submittedText;
ipcMain.handle('submit-shared-danmaku', (event, { text }) => {
  assert.equal(event.sender, composerHost.webContents);
  submittedText = text;
  return { accepted: true };
});
const timeout = setTimeout(() => { console.error('Danmaku renderer smoke timed out'); app.exit(1); }, 15_000);

async function waitForCount(count) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const actual = await window.webContents.executeJavaScript('document.querySelectorAll(".danmaku-item").length');
    if (actual === count && confirmations >= count) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Expected ${count} rendered items`);
}

app.whenReady().then(async () => {
  window = new BrowserWindow({ show: false, width: 1280, height: 720, webPreferences: {
    preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false
  } });
  await window.loadFile(path.join(__dirname, '..', 'src', 'danmaku.html'));
  for (const [index, source] of ['ai', 'original_template', 'recommendation', 'shared', 'monster_skill'].entries()) {
    now = index * 6000;
    const text = `渲染确认测试 ${index}`;
    director.burst({ ...scope, eventId: `event-${index}`, trigger: 'smoke', key: `${index}`, priority: 3,
      factTexts: [text], factSourceByText: { [text]: { source } } });
    const [message] = director.tick();
    window.webContents.send('bridge-danmaku', { ...message, character: 'ironclad' });
    window.webContents.send('bridge-danmaku', { ...message, character: 'ironclad' });
    await waitForCount(index + 1);
  }
  assert.equal(confirmations, 5);
  const stats = await window.webContents.executeJavaScript('window.gamebuddyBridge.getDanmakuStats()');
  assert.equal(stats.total, 5);
  assert.equal(stats.aiPercent, 20);
  assert.equal(stats.commentaryAiPercent, 50);
  window.webContents.send('bridge-danmaku-clear', {});
  await waitForCount(0);
  assert.equal(director.presentationStats().total, 5);
  const preview = [
    ['ironclad', '铁甲战士', '伤口会记住，嘴就不必了。'],
    ['silent', '静默猎手', '动静很大。破绽也是。'],
    ['defect', '故障机器人', '我似乎不喜欢这里。这个发现很新。'],
    ['regent', '储君', '这里的迎宾礼，实在欠缺教养。'],
    ['necrobinder', '亡灵契约师', '别紧张，骨头通常很有耐心。']
  ];
  for (const [index, [character, speaker, text]] of preview.entries()) {
    window.webContents.send('bridge-danmaku', { id: `preview-${index}`, character, speaker, source: 'ai', text,
      detail:{title:'人格提示词解释',source:'ai',lines:['提示词：展示当前场景与生成解释','来源：AI 生成']} });
  }
  window.webContents.send('bridge-danmaku', { id: 'preview-skill', character: 'ironclad', source: 'monster_skill',
    skillLabel: '小啃兽（2） · 顶撞', text: '没什么，我只是要狠狠地给你来一下。',
    detail: { title: '小啃兽的当前行动', source: 'mod', lines: ['行动：顶撞', '效果：造成伤害', '来源：Mod 当前行动数据'] } });
  await waitForCount(6);
  const labels = await window.webContents.executeJavaScript(`({
    ai: [...document.querySelectorAll('[data-source="ai"] .danmaku-speaker')].map(e => e.textContent),
    skill: document.querySelector('.danmaku-skill .danmaku-speaker').textContent,
    skillAvatars: document.querySelectorAll('.danmaku-skill img').length,
    detail: document.querySelector('.danmaku-skill .danmaku-detail').textContent
    ,aiDetail:[...document.querySelectorAll('[data-source="ai"] .danmaku-detail')].map(e=>e.textContent)
  })`);
  assert.deepEqual(labels.ai, preview.map(item => item[1]));
  assert.match(labels.skill, /技能.*小啃兽（2）.*顶撞/);
  assert.equal(labels.skillAvatars, 0);
  assert.match(labels.detail, /Mod 当前行动数据/);
  assert.deepEqual(labels.aiDetail,preview.map(item=>item[2]));
  assert.doesNotMatch(labels.aiDetail.join(''),/提示词|生成解释|来源：/);
  await window.webContents.executeJavaScript("document.querySelector('[data-source=ai]').classList.add('hovered')");
  assert.equal(await window.webContents.executeJavaScript("getComputedStyle(document.querySelector('[data-source=ai] .danmaku-detail')).display"),'block');
  // 仅在预览中暂停飞行并排成纵列，便于目视检查真实组件和悬停详情。
  await window.webContents.executeJavaScript(`
    document.body.style.background = '#0b141a';
    const style = document.createElement('style');
    style.textContent = '.danmaku-item { left: 40px !important; transform: none !important; }';
    document.head.append(style);
    [...document.querySelectorAll('.danmaku-item')].forEach((item, i) => {
      item.style.setProperty('left', '40px', 'important');
      item.style.setProperty('top', (40 + i * 100) + 'px', 'important');
      item.style.setProperty('transform', 'none', 'important');
    });
    document.querySelector('.danmaku-skill').classList.add('hovered');
  `);
  await new Promise(resolve => setTimeout(resolve, 200));
  const layout = await window.webContents.executeJavaScript(`(() => {
    const item = document.querySelector('.danmaku-skill');
    return { outer: item.getBoundingClientRect().bottom, text: item.querySelector('.gb-danmaku__text').getBoundingClientRect().bottom };
  })()`);
  assert.ok(layout.text <= layout.outer, 'skill text must fit inside its frame');
  const screenshotPath = path.join(os.tmpdir(), 'gamebuddy-danmaku-personas-preview.png');
  fs.writeFileSync(screenshotPath, (await window.webContents.capturePage()).toPNG());
  console.log(`Danmaku renderer smoke passed: ${JSON.stringify(stats)}; preview: ${screenshotPath}`);
  // 完整事件顺序经过 adapter/director，再通过真实 preload/IPC 上屏。
  window.webContents.send('bridge-danmaku-clear', {}); await waitForCount(0);
  const adapter = new DanmakuBridgeAdapter({ now: () => now });
  adapter.director.counter = 100; // 与上半段独立director的测试消息ID分开
  const live = { run: { character: 'ironclad', runId: 'mod-run', floor: 2 }, player: { hp: 60, maxHp: 80,
    cards: [...Array(5).fill({ id: 'STRIKE_IRONCLAD', name: '打击' }), ...Array(4).fill({ id: 'DEFEND_IRONCLAD', name: '防御' }), { id: 'BASH', name: '痛击' }] }, combat: { turn: 2, enemies: [] } };
  const observation = sequence => ({ schema: 'gamebuddy.observation.v1', sequence, fresh: true, state: live });
  await adapter.ingestObservation(observation(1), { runId: 'app-session' });
  adapter.syncKeyComponents({ name: 'card.reward.opened', data: { opportunityId: 'smoke-core', cards: [{ id: 'PERFECTED_STRIKE', name: '完美打击' }] } }, live, 'app-session');
  live.combat = null;
  await adapter.ingestObservation(observation(2), { runId: 'app-session' });
  await adapter.ingestRecommendation({ id: 'smoke-flame', task: 'card_reward', primary: { action: 'TAKE_CARD', cardName: '火焰屏障' }, reason: '本地推荐回放' }, { runId: 'app-session', observation: observation(2) });
  const [alert] = adapter.tick();
  assert.equal(alert.source, 'key_component');
  window.webContents.send('bridge-danmaku', { ...alert, character: 'ironclad' });
  window.webContents.send('bridge-danmaku', { ...alert, character: 'ironclad' });
  await waitForCount(1);
  assert.match(await window.webContents.executeJavaScript("document.querySelector('[data-source=key_component]').textContent"), /完美打击/);
  now += 500;
  assert.deepEqual(adapter.tick(), []);
  assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('[data-source=recommendation]').length"), 0);
  const coreScreenshot = path.join(os.tmpdir(), 'gamebuddy-core-alert-preview.png');
  await window.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise(resolve => setTimeout(resolve, 300)))');
  fs.writeFileSync(coreScreenshot, (await window.webContents.capturePage()).toPNG());
  console.log(`Core alert rendered once; ordinary recommendation suppressed: ${coreScreenshot}`);
  window.webContents.send('bridge-danmaku-clear', {}); await waitForCount(0);
  Object.assign(live, { schema: 'gamebuddy.state.v1', timestamp: 100, source: 'renderer-shop-replay', map: { visited: [] } });
  live.run.act = 1; live.run.room = 'Merchant'; live.run.floor = 3;
  Object.assign(live.player, { gold: 300, block: 0, energy: 3, maxEnergy: 3, relics: [], potions: [] });
  live.player.cards.push({ id: 'POMMEL_STRIKE', name: '剑柄打击' });
  live.shop = { gold: 300, items: [
    { index: 0, stockKey: 'card:0', itemType: 'card', id: 'HELLRAISER', name: '地狱狂徒', price: 80, stocked: true, card: { id: 'HELLRAISER', name: '地狱狂徒' } },
    { index: 1, stockKey: 'relic:0', itemType: 'relic', id: 'STRIKE_DUMMY', name: '打击木偶', price: 100, stocked: true },
    { index: 2, stockKey: null, itemType: 'service', id: 'CARD_REMOVAL', name: '删除一张牌', price: 75, stocked: true, card: null }
  ] };
  const { createObservationStore } = require('../harness/observation-store');
  const store = createObservationStore();
  const shopStateResult = store.ingest({ type: 'state', data: live }, Date.now());
  assert.equal(shopStateResult.kind, 'state', shopStateResult.reason);
  now += 1000;
  await adapter.ingestObservation({ ...store.getObservation(), sequence: 3 }, { runId: 'app-session' });
  await adapter.ingestRecommendation({ id: 'shop-plan', task: 'shop_choice', primary: { itemName: '地狱狂徒' } });
  const [shopAlert] = adapter.tick(); assert.equal(shopAlert.source, 'key_component');
  window.webContents.send('bridge-danmaku', { ...shopAlert, character: 'ironclad' }); await waitForCount(1);
  const shopText = await window.webContents.executeJavaScript("document.querySelector('[data-source=key_component]').textContent");
  assert.match(shopText, /地狱狂徒/); assert.match(shopText, /打击木偶/);
  assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('[data-source=recommendation]').length"), 0);
  const shopScreenshot = path.join(os.tmpdir(), 'gamebuddy-shop-alert-preview.png');
  await window.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise(resolve => setTimeout(resolve, 300)))');
  fs.writeFileSync(shopScreenshot, (await window.webContents.capturePage()).toPNG());
  console.log(`Nullable shop accepted; core card/relic rendered without repeating advice: ${shopScreenshot}`);
  window.webContents.send('bridge-danmaku-clear', {});await waitForCount(0);
  const supportAdapter=new DanmakuBridgeAdapter({now:()=>now});supportAdapter.director.counter=500;
  const supportState={...live,run:{...live.run,character:'silent'},player:{...live.player,cards:[],gold:200}};
  supportAdapter.syncKeyComponents({name:'shop.opened',data:{visitId:'support-renderer',items:[
    {itemType:'card',id:'PIERCING_WAIL',stockKey:'card:0',price:24},
    {itemType:'card',id:'ABRASIVE',stockKey:'card:1',price:144}
  ]}},supportState,'support-run');
  for(let i=0;i<2;i++){
    now+=1000;const [message]=supportAdapter.tick();assert.ok(message);
    window.webContents.send('bridge-danmaku',{...message,character:'silent'});await waitForCount(i+1);
  }
  const supportTexts=await window.webContents.executeJavaScript("[...document.querySelectorAll('[data-source=key_component] .gb-danmaku__text')].map(e=>e.textContent)");
  assert.equal(supportTexts.length,2);assert.ok(supportTexts.some(t=>/敏捷防线/.test(t)&&/尖啸/.test(t)&&/磨蚀/.test(t)));
  assert.ok(supportTexts.some(t=>/弃牌周转/.test(t)&&/磨蚀/.test(t)));
  console.log('Support cards grouped by system rendered without cross-system suppression.');
  // 原生穿透切换可能产生 pointerleave，不能推翻主进程同一位置的采样结果。
  const pointerModes = [];
  ipcMain.on('danmaku-pointer-mode', (event, mode) => {
    if (event.sender === window.webContents) pointerModes.push(mode);
  });
  await window.loadFile(path.join(__dirname, '..', 'src', 'danmaku.html'), { query: { surface: 'overlay' } });
  window.webContents.send('bridge-danmaku', { id: 'stable-hover', source: 'ai', character: 'defect', text: '稳定悬停回归' });
  await waitForCount(1);
  const point = await window.webContents.executeJavaScript(`(() => {
    const item = document.querySelector('.danmaku-item'); item.style.left = '300px';
    const r = item.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};
  })()`);
  window.webContents.send('danmaku-cursor-probe', point);
  await new Promise(resolve => setTimeout(resolve, 60));
  const pausedTransform = await window.webContents.executeJavaScript("document.querySelector('.danmaku-item').style.transform");
  for (let i = 0; i < 10; i++) {
    await window.webContents.executeJavaScript(`(() => {
      const item=document.querySelector('.danmaku-item');
      item.dispatchEvent(new PointerEvent('pointerleave'));
      document.dispatchEvent(new MouseEvent('mousemove',{bubbles:true}));
      if(!item.classList.contains('hovered')) throw new Error('Native events undid sampled hover');
    })()`);
    window.webContents.send('danmaku-cursor-probe', point);
  }
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.danmaku-item').style.transform"), pausedTransform);
  assert.deepEqual(pointerModes, [true], 'stationary hover must not oscillate native input mode');
  window.webContents.send('danmaku-cursor-probe', {x:-1,y:-1});
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.danmaku-item').classList.contains('hovered')"), false);
  assert.notEqual(await window.webContents.executeJavaScript("document.querySelector('.danmaku-item').style.transform"), pausedTransform);
  assert.deepEqual(pointerModes, [true, false]);
  console.log('Sampled hover remains stable through native leave events and resumes outside.');
  // The compact native host must accept its first click and pass input through preload.
  const compactBounds = { x: 220, y: 220, width: 128, height: 72 };
  const expandedBounds = { ...compactBounds, width: 520, height: 280 };
  composerHost = createComposerHost({ bounds: compactBounds,
    parent: window, preload: path.join(__dirname, '..', 'preload.js'), page: path.join(__dirname, '..', 'src', 'danmaku.html') });
  ipcMain.on('danmaku-composer-focus', (event, expanded) => {
    if (event.sender === composerHost.webContents) setComposerExpanded(composerHost, expanded, expanded ? expandedBounds : compactBounds);
  });
  await new Promise(resolve => composerHost.webContents.once('did-finish-load', resolve));
  showComposerHost(composerHost);
  assert.equal(composerHost.isVisible(), true);
  const click = async selector => {
    const point = await composerHost.webContents.executeJavaScript(`(() => {
      const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
    })()`);
    for (const type of ['mouseDown', 'mouseUp']) {
      composerHost.webContents.sendInputEvent({ type, ...point, button: 'left', clickCount: 1 });
    }
  };
  // sendInputEvent requires app focus. Native first-mouse is enabled by createComposerHost.
  composerHost.focus();
  await click('#shared-composer-toggle');
  await composerHost.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const check = attempts => {
      if (document.activeElement?.id === 'shared-composer-input') return resolve();
      if (!attempts) return reject(Error('Composer input did not receive focus'));
      setTimeout(() => check(attempts - 1), 30);
    };
    check(50);
  })`);
  await composerHost.webContents.executeJavaScript("document.querySelector('#shared-composer-input').value = '本地发送测试'");
  await click('#shared-composer-submit');
  for (let attempt = 0; !submittedText && attempt < 50; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  assert.equal(submittedText, '本地发送测试');
  assert.equal(await window.webContents.executeJavaScript("Boolean(document.querySelector('#shared-composer'))"), false);
  console.log('Separate composer accepted clicks and forwarded a simulated submission.');
  composerHost.destroy();
  clearTimeout(timeout);
  window.destroy();
  app.exit(0);
}).catch(error => {
  console.error(error);
  clearTimeout(timeout);
  if (composerHost && !composerHost.isDestroyed()) composerHost.destroy();
  window?.destroy();
  app.exit(1);
});

process.on('exit', () => { try { fs.rmSync(userData, { recursive: true, force: true }); } catch {} });
