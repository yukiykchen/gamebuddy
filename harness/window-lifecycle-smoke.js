'use strict';
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const root = process.env.GAMEBUDDY_TEST_APP_ROOT || path.join(__dirname, '..');
const { guardWindowCallback } = require(path.join(root, 'src/window-lifecycle'));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gamebuddy-window-lifecycle-'));
app.setPath('userData', profile);
const timer = setTimeout(() => { console.error('Window lifecycle smoke timed out'); app.exit(1); }, 15000);
app.whenReady().then(async () => {
  const normal = new BrowserWindow({ show: false }); let loaded = 0;
  normal.webContents.on('did-finish-load', guardWindowCallback(normal, () => true, () => loaded++));
  await normal.loadURL('data:text/html,<p>normal initialization</p>');
  assert.equal(loaded, 1); normal.destroy();
  for (let i = 0; i < 8; i++) {
    const window = new BrowserWindow({ show: false }), contents = window.webContents; let calls = 0;
    const callback = guardWindowCallback(window, () => true, () => { calls++; window.webContents.send('test'); });
    contents.on('did-finish-load', callback); window.once('ready-to-show', callback);
    const loading = window.loadURL('data:text/html,<p>close during loading</p>').catch(error => {
      if (!window.isDestroyed() || !/ERR_ABORTED|ERR_FAILED|destroyed/i.test(error.message)) throw error;
    });
    window.destroy(); contents.emit('did-finish-load'); window.emit('ready-to-show');
    await loading; assert.equal(calls, 0);
  }
  clearTimeout(timer); console.log('Window lifecycle passed: normal initialization and 8 close-during-load cycles.'); app.exit(0);
}).catch(error => { console.error(error); clearTimeout(timer); app.exit(1); });
process.on('exit', () => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} });
