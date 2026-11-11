'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { writeGatewayPreference, readGatewayPreference } = require('../agent/llm/preferred-gateway');
const { createGatewayWindow, showGatewayWindow } = require('../src/gateway-setup-window');

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'gamebuddy-gateway-ui-')));
app.on('window-all-closed', () => {}); // 关闭后重建的测试阶段继续由本脚本控制退出。
const file = path.join(app.getPath('userData'), 'llm-gateway.json');
let cancelled = false;
let openedKeys = false;
ipcMain.handle('gateway-setup:load', () => ({
  apiKey: '',
  baseURL: 'https://copilot.tencent.com/v2/',
  gatewayName: '公司个人 token 网关'
}));
ipcMain.handle('gateway-setup:save', (_event, payload) => {
  const saved = writeGatewayPreference(file, payload);
  return saved.ok ? { ok: true } : { ok: false, message: saved.message };
});
ipcMain.on('gateway-setup:cancel', () => { cancelled = true; });
ipcMain.on('gateway-setup:open-keys', () => { openedKeys = true; });

const timer = setTimeout(() => {
  console.error('Gateway setup renderer timed out');
  app.exit(1);
}, 20000);

app.whenReady().then(async () => {
  const win = createGatewayWindow({
    preload: path.join(__dirname, '..', 'preload.js'),
    page: path.join(__dirname, '..', 'src', 'gateway-setup.html')
  });
  await new Promise((resolve, reject) => {
    win.webContents.once('did-finish-load', resolve);
    win.webContents.once('did-fail-load', (_event, code, description) => reject(new Error(`${code}: ${description}`)));
  });
  for (let i = 0; i < 100 && !win.isFocused(); i++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(win.isAlwaysOnTop(), true);
  assert.equal(win.isVisible(), true);
  assert.equal(win.isFocused(), true);
  if (process.platform === 'win32') {
    assert.equal(win.isMenuBarVisible(), false);
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Alt' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Alt' });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(win.isMenuBarVisible(), false, 'Alt must not reveal a native menu bar');
  }
  const count = BrowserWindow.getAllWindows().length;
  for (let i = 0; i < 3; i++) {
    win.hide(); showGatewayWindow(win);
    assert.equal(win.isVisible(), true); assert.equal(win.isAlwaysOnTop(), true);
  }
  showGatewayWindow(win);
  assert.equal(BrowserWindow.getAllWindows().length, count);
  await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const text = await win.webContents.executeJavaScript('document.body.innerText');
  assert.match(text, /API Key/);
  assert.match(text, /网关/);
  assert.match(text, /公司个人 token 网关/);
  assert.match(text, /公司内网 API 获取链接/);
  await win.webContents.executeJavaScript('document.querySelector("#openKeys").click()');
  assert.equal(openedKeys, true);
  assert.equal(await win.webContents.executeJavaScript('document.querySelector("#baseURL").value'), 'https://copilot.tencent.com/v2/');
  await win.webContents.executeJavaScript('document.querySelector("#form").requestSubmit()');
  await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  assert.match(await win.webContents.executeJavaScript('document.querySelector("#error").textContent'), /请填写 API Key/);
  assert.equal(fs.existsSync(file), false);
  await win.webContents.executeJavaScript(`
    document.querySelector('#apiKey').value = 'smoke-key';
    document.querySelector('#baseURL').value = 'https://copilot.tencent.com/v2/';
    document.querySelector('#form').requestSubmit();
  `);
  await win.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 50))');
  assert.deepEqual(readGatewayPreference(file), {
    apiKey: 'smoke-key',
    baseURL: 'https://copilot.tencent.com/v2'
  });
  await win.webContents.executeJavaScript('document.querySelector("#cancel").click()');
  assert.equal(cancelled, true);
  const output = path.join(__dirname, '..', '.runtime', 'gateway-setup'); fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'foreground.png'), (await win.webContents.capturePage()).toPNG());
  win.destroy();
  assert.doesNotThrow(() => showGatewayWindow(win));
  const replacement = createGatewayWindow({
    preload: path.join(__dirname, '..', 'preload.js'), page: path.join(__dirname, '..', 'src', 'gateway-setup.html')
  });
  await new Promise(resolve => replacement.webContents.once('did-finish-load', resolve));
  for (let i = 0; i < 100 && !replacement.isFocused(); i++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(replacement.isVisible(), true); assert.equal(replacement.isAlwaysOnTop(), true); assert.equal(replacement.isFocused(), true);
  replacement.destroy();
  clearTimeout(timer);
  console.log('Gateway setup dialog passed: topmost, first focus, hide/reopen, reuse, recreate and form behavior.');
  app.exit(0);
}).catch(error => {
  console.error(error);
  clearTimeout(timer);
  app.exit(1);
});
