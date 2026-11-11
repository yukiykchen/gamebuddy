'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = process.env.GAMEBUDDY_TEST_APP_ROOT || path.join(__dirname, '..');
const { createComposerHost, showComposerHost, setComposerExpanded } = require(path.join(root, 'src', 'danmaku-composer-window'));
const interactive = process.argv.includes('--interactive');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'gamebuddy-composer-')));
let window, owner, submits = 0, opens = 0, closes = 0;
const boundsFor = expanded => ({ x: 920 - (expanded ? 520 : 128), y: 200 + (280 - (expanded ? 280 : 72)) / 2,
  width: expanded ? 520 : 128, height: expanded ? 280 : 72 });
const errors = [];
ipcMain.handle('get-shared-danmaku-context', () => ({ sceneKey: 'synthetic-combat', phase: 'combat' }));
ipcMain.handle('submit-shared-danmaku', (_event, payload) => {
  assert.equal(payload.text, '合成输入回归'); submits++;
  if (interactive) {
    assert.ok(opens >= 2 && closes >= 1, 'Native input must cover close and reopen');
    setTimeout(() => {
      assert.equal(window.isFocusable(), true);
      console.log('NATIVE_VERIFIED: OS click open/close/reopen, text entry and local mock submit passed.');
      clearTimeout(timer); window.destroy(); owner.destroy(); app.quit();
    }, 1400);
  }
  return { accepted: true };
});
ipcMain.on('danmaku-composer-focus', (_event, expanded) => {
  expanded ? opens++ : closes++;
  setComposerExpanded(window, expanded, boundsFor(expanded));
});
const timer = setTimeout(() => { console.error('Composer smoke timed out'); app.exit(1); }, interactive ? 180000 : 15000);
async function waitFor(expression) {
  for (let i = 0; i < 100; i++) {
    if (await window.webContents.executeJavaScript(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Condition failed: ${expression}`);
}
app.whenReady().then(async () => {
  owner = new BrowserWindow({ show: false, width: 1280, height: 720, transparent: true, frame: false, focusable: false });
  owner.setIgnoreMouseEvents(true, { forward: true });
  await owner.loadFile(path.join(root, 'src', 'danmaku.html'), { query: { surface: 'overlay' } });
  owner.setTitle('GameBuddy 测试弹幕层');
  window = createComposerHost({ bounds: boundsFor(false), parent: owner, preload: path.join(root, 'preload.js'), page: path.join(root, 'src', 'danmaku.html') });
  window.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  await new Promise((resolve, reject) => {
    window.webContents.once('did-finish-load', resolve);
    window.webContents.once('did-fail-load', (_event, code, description) => reject(new Error(`${code}: ${description}`)));
  });
  assert.equal(window.isFocusable(), true);
  assert.equal(window.getParentWindow(), owner);
  // macOS returns RGB here even for an alpha-zero background; pixels below verify alpha.
  assert.match(window.getBackgroundColor(), /^#000000(?:00)?$/i);
  assert.equal(await window.webContents.executeJavaScript(`getComputedStyle(document.documentElement).backgroundColor`), 'rgba(0, 0, 0, 0)');
  assert.equal(await window.webContents.executeJavaScript(`getComputedStyle(document.body).backgroundColor`), 'rgba(0, 0, 0, 0)');
  if (interactive) {
    window.setTitle('GameBuddy 发送窗口验证');
    owner.showInactive();
    showComposerHost(window);
    console.log('NATIVE_READY: Click open, close, reopen; enter 合成输入回归 and send. Local mock only.');
    return;
  }
  assert.equal(await window.webContents.executeJavaScript('document.querySelector("#danmaku-layer")'), null);
  await window.webContents.executeJavaScript('document.querySelector("#shared-composer-toggle").click()');
  await waitFor('innerWidth === 520 && !document.querySelector("#shared-composer-input").disabled');
  const bounds = await window.webContents.executeJavaScript(`['#shared-composer-panel','#shared-composer-input','#shared-composer-submit','#shared-composer-close'].map(selector => {
    const e=document.querySelector(selector),r=e.getBoundingClientRect();
    return {selector,visible:r.width>0&&r.height>0,left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight};
  })`);
  for (const b of bounds) assert.ok(b.visible && b.left >= 0 && b.top >= 0 && b.right <= b.width && b.bottom <= b.height, JSON.stringify(b));
  const output = path.join(__dirname, '..', '.runtime', 'danmaku-composer'); fs.mkdirSync(output, { recursive: true });
  const expandedImage = await window.webContents.capturePage();
  fs.writeFileSync(path.join(output, 'expanded.png'), expandedImage.toPNG());
  const bitmap = expandedImage.toBitmap();
  assert.equal(bitmap[3], 0, 'Window margin must have zero alpha');
  window.webContents.send('bridge-danmaku', { id: 'composer-no-flyer', source: 'ai', text: '不应绘制到按钮窗口' });
  await window.webContents.executeJavaScript('document.querySelector("#shared-composer-input").value="合成输入回归"; document.querySelector("#shared-composer-submit").click()');
  await waitFor('document.querySelector("#shared-composer-status").textContent.includes("已发送")');
  assert.equal(submits, 1); assert.equal(await window.webContents.executeJavaScript('document.querySelectorAll(".danmaku-item").length'), 0);
  await window.webContents.executeJavaScript('document.querySelector("#shared-composer-close").click()');
  await waitFor('innerWidth === 128 && document.querySelector("#shared-composer-panel").hidden');
  assert.equal(window.isFocusable(), true, 'Collapsed window must still accept the next activation');
  await window.webContents.executeJavaScript('document.querySelector("#shared-composer-toggle").click()');
  await waitFor('innerWidth === 520 && !document.querySelector("#shared-composer-panel").hidden');
  assert.equal(window.isFocusable(), true);
  await window.webContents.executeJavaScript('document.querySelector("#shared-composer-close").click()');
  await waitFor('innerWidth === 128');
  await window.loadFile(path.join(root, 'src', 'danmaku.html'), { query: { surface: 'overlay' } });
  assert.equal(await window.webContents.executeJavaScript('document.querySelector("#shared-composer")'), null);
  window.webContents.send('bridge-danmaku', { id: 'overlay-ai', source: 'ai', character: 'defect', text: '合成AI弹幕渲染回归' });
  await waitFor('document.querySelectorAll(".danmaku-item").length === 1');
  assert.deepEqual(errors, []);
  console.log('Composer open/input/send/close bounds and overlay AI rendering passed.');
  clearTimeout(timer); window.destroy(); owner.destroy(); app.quit();
}).catch(error => { console.error(error); clearTimeout(timer); app.exit(1); });
