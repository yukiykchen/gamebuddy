'use strict';
// 真实 Electron 页面 + preload + IPC；本地模拟，不连接游戏或模型。
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { stripMarkup } = require('../agent/knowledge/spire-codex');
const { references, expand, cardIndex } = require('../agent/knowledge/archetype-affinity');
const { decorateIroncladArchetypes } = require('../agent/knowledge/ironclad-archetypes');
const output = path.join(__dirname, '..', '.runtime', 'affinity-v2');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'gamebuddy-affinity-smoke-')));
ipcMain.handle('review:getDashboard', () => null);
let window;
const timeout = setTimeout(() => { console.error('Archetype renderer smoke timed out'); app.exit(1); }, 20000);
app.whenReady().then(async () => {
  window = new BrowserWindow({ show: false, width: 1500, height: 1100, webPreferences: {
    preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false
  } });
  const errors = [];
  window.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  await window.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  const deck = expand(references.block.cards).filter(card => card.id !== 'BARRICADE');
  const options = decorateIroncladArchetypes('ironclad', deck, [], ['BARRICADE', 'BODY_SLAM', 'MANGLE'].map((id, index) => ({
    ...cardIndex.get(id), description: stripMarkup(cardIndex.get(id).description), score: 90 - index * 10, pros: [], cons: [], costs: { energy: cardIndex.get(id).cost }, fit: {}
  })));
  window.webContents.send('bridge-state', { run: { character: 'ironclad', act: 3, floor: 40, room: 'reward' }, player: { hp: 60, maxHp: 80, cards: deck, relics: [], potions: [], gold: 150 }, reward: { cards: options }, combat: null });
  window.webContents.send('bridge-recommendation', { task: 'card_reward', source: 'rules', options, primary: { action: 'TAKE_CARD', cardId: options[0].id, cardName: options[0].name }, reason: '本地回放：比较补齐留存、重复输出和无关牌的流派影响。', context: {} });
  await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const reward = await window.webContents.executeJavaScript(`({ text: document.querySelector('#view-container').innerText, rows: document.querySelectorAll('.archetype-score').length, impacts: document.querySelectorAll('.archetype-impact').length, width: document.documentElement.scrollWidth, viewport: innerWidth })`);
  assert.equal(reward.rows, 4);
  assert.ok(reward.impacts >= 3);
  assert.match(reward.text, /契合度 68 → 100（\+32）/);
  assert.match(reward.text, /跨回合保留格挡/);
  assert.match(reward.text, /同类功能已较充分/);
  assert.ok(reward.width <= reward.viewport, 'Page overflows horizontally');
  await window.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise(resolve => setTimeout(resolve, 500)))');
  fs.writeFileSync(path.join(output, 'reward.png'), (await window.webContents.capturePage()).toPNG());
  const inventory = options.map((analysis, index) => ({ itemType: 'card', id: analysis.id, name: analysis.name, price: 80 + index * 10, stocked: true, affordable: true, score: analysis.score, analysis }));
  window.webContents.send('bridge-state', { shop: { gold: 150, items: inventory } });
  window.webContents.send('bridge-recommendation', { task: 'shop_choice', source: 'rules', inventory, primary: { plan: [], remainingGold: 150 }, reason: '本地回放：商店使用同一套选牌增量。', context: {} });
  await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const shop = await window.webContents.executeJavaScript("document.querySelector('#view-container').innerText");
  assert.match(shop, /契合度 68 → 100（\+32）/);
  await window.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise(resolve => setTimeout(resolve, 500)))');
  fs.writeFileSync(path.join(output, 'shop.png'), (await window.webContents.capturePage()).toPNG());
  assert.deepEqual(errors, []);
  console.log(`Archetype reward/shop renderer passed; screenshots: ${output}`);
  clearTimeout(timeout); window.destroy(); app.exit(0);
}).catch(error => { console.error(error); clearTimeout(timeout); app.exit(1); });
