'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { showInactiveOnce, setMousePassthrough, setBoundsIfChanged } = require('../../src/danmaku-window-state');
const { showComposerHost, setComposerExpanded } = require('../../src/danmaku-composer-window');

function windowDouble() {
  const calls = { show: 0, raise: 0, focus: 0, passthrough: [], bounds: 0, blur: 0 };
  const host = {
    visible: false, destroyed: false, focusable: true, bounds: { x: 10, y: 20, width: 128, height: 72 },
    isDestroyed: () => host.destroyed, isVisible: () => host.visible, isFocusable: () => host.focusable,
    showInactive() { calls.show++; host.visible = true; },
    show() { calls.show++; host.visible = true; },
    focus() { calls.focus++; }, moveTop() { calls.raise++; }, blur() { calls.blur++; },
    setFocusable(value) { host.focusable = value; },
    setIgnoreMouseEvents(value) { calls.passthrough.push(value); },
    getBounds: () => ({ ...host.bounds }), setBounds(value) { calls.bounds++; host.bounds = { ...value }; },
    webContents: { focus() {} }
  };
  return { host, calls };
}

test('many message batches keep existing transparent windows visible without raising or focusing', () => {
  const overlay = windowDouble(), composer = windowDouble();
  for (let batch = 0; batch < 100; batch++) {
    showInactiveOnce(overlay.host); showComposerHost(composer.host);
  }
  assert.equal(overlay.calls.show, 1);
  assert.equal(composer.calls.show, 1);
  assert.equal(composer.calls.raise, 1);
  assert.equal(composer.calls.focus, 0);
  assert.deepEqual(composer.calls.passthrough, [false]);
  overlay.host.visible = false; composer.host.visible = false;
  showInactiveOnce(overlay.host); showComposerHost(composer.host);
  assert.equal(overlay.calls.show, 2);
  assert.equal(composer.calls.raise, 2);
});

test('cursor polling only changes native passthrough at interaction boundaries', () => {
  const { host, calls } = windowDouble();
  for (const mode of [true, false, true]) {
    for (let tick = 0; tick < 250; tick++) setMousePassthrough(host, mode);
  }
  assert.deepEqual(calls.passthrough, [true, false, true]);
  host.destroyed = true; setMousePassthrough(host, false);
  assert.deepEqual(calls.passthrough, [true, false, true]);
  const replacement = windowDouble(); setMousePassthrough(replacement.host, true);
  assert.deepEqual(replacement.calls.passthrough, [true]);
});

test('composer can close and reopen; arriving messages do not steal focus', () => {
  const { host, calls } = windowDouble();
  const compact = { ...host.bounds }, expanded = { x: 10, y: 20, width: 520, height: 280 };
  setBoundsIfChanged(host, compact); assert.equal(calls.bounds, 0);
  setComposerExpanded(host, true, expanded);
  setComposerExpanded(host, false, compact);
  setComposerExpanded(host, true, expanded);
  assert.equal(calls.focus, 2); assert.equal(calls.blur, 1); assert.equal(calls.bounds, 3);
  assert.equal(host.focusable, true);
  const before = { ...calls };
  for (let batch = 0; batch < 100; batch++) showComposerHost(host);
  assert.deepEqual(calls, before);
});
