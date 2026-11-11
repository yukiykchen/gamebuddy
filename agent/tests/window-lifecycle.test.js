'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { guardWindowCallback } = require('../../src/window-lifecycle');

class WindowDouble extends EventEmitter {
  constructor() {
    super(); this.destroyed = false; this.messages = []; this.shown = 0;
    this.contents = new EventEmitter(); this.contents.destroyed = false;
    this.contents.isDestroyed = () => this.contents.destroyed;
    this.contents.send = (...args) => { if (this.destroyed || this.contents.destroyed) throw new Error('Object has been destroyed'); this.messages.push(args); };
  }
  get webContents() { if (this.destroyed) throw new Error('Object has been destroyed'); return this.contents; }
  isDestroyed() { return this.destroyed; }
  setPosition() {} setMaximumSize() {} setAlwaysOnTop() {} loadFile() {}
  showInactive() { if (this.destroyed) throw new Error('Object has been destroyed'); this.shown++; }
  destroy() { this.destroyed = true; this.contents.destroyed = true; this.emit('closed'); }
}

const source = fs.readFileSync(path.join(__dirname, '../../main.js'), 'utf8');
const start = source.indexOf('function createPetWindow()');
const end = source.indexOf('\nfunction ', start + 1);
function petRuntime() {
  const context = vm.createContext({ BrowserWindow: WindowDouble, path, __dirname, guardWindowCallback,
    petWindow: undefined, isQuitting: false, screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1280, height: 720 } }) },
    trackPageIn() {}, publishPetSkin() {}, currentObservation: () => ({ state: null }), lastBridgeStatus: {}, lastAgentThinking: {},
    orchestrator: { getRecommendation: () => null }, danmakuAdapter: { director: { snapshot: () => ({}) } },
    activeCardRecommendation: null, activeEncounterGuide: null, publishEncounterGuideState() {}
  });
  vm.runInContext(source.slice(start, end), context);
  context.createPetWindow(); return context;
}

test('pet initializes normally, but late load and ready events after close cannot access destroyed objects', () => {
  const normal = petRuntime(), active = normal.petWindow;
  active.contents.emit('did-finish-load'); active.emit('ready-to-show');
  assert.equal(active.messages.length, 4); assert.equal(active.shown, 1);
  const runtime = petRuntime(), closing = runtime.petWindow, contents = closing.contents;
  closing.destroy(); assert.equal(runtime.petWindow, undefined);
  assert.doesNotThrow(() => contents.emit('did-finish-load'));
  assert.doesNotThrow(() => closing.emit('ready-to-show'));
  assert.equal(closing.messages.length, 0); assert.equal(closing.shown, 0);
});

test('pet callbacks ignore destroyed renderer, replaced window and application shutdown', () => {
  const crashed = petRuntime(); crashed.petWindow.contents.destroyed = true;
  assert.doesNotThrow(() => crashed.petWindow.contents.emit('did-finish-load'));
  assert.equal(crashed.petWindow.messages.length, 0);
  const replaced = petRuntime(), old = replaced.petWindow;
  replaced.createPetWindow(); const current = replaced.petWindow;
  old.contents.emit('did-finish-load'); old.emit('ready-to-show');
  assert.equal(current.messages.length, 0); assert.equal(old.messages.length, 0);
  old.destroy(); assert.equal(replaced.petWindow, current);
  replaced.isQuitting = true;
  current.contents.emit('did-finish-load'); current.emit('ready-to-show');
  assert.equal(current.messages.length, 0); assert.equal(current.shown, 0);
});

test('guard preserves event arguments and does not swallow actual live callback errors', () => {
  const host = new WindowDouble(), seen = [];
  const handler = guardWindowCallback(host, () => true, (...args) => seen.push(args));
  handler('value', 1); assert.deepEqual(seen, [['value', 1]]);
  const fail = guardWindowCallback(host, () => true, () => { throw new Error('real callback failure'); });
  assert.throws(fail, /real callback failure/);
});
