'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { presentationFor } = require('../../src/danmaku-theme');

test('each playable character uses its supplied frame and avatar', () => {
  const expected = {
    ironclad: 'warrior',
    silent: 'bird',
    defect: 'robot',
    regent: 'star',
    necrobinder: 'reaper'
  };
  for (const [character, theme] of Object.entries(expected)) {
    assert.deepEqual(presentationFor({ character }), { theme, avatar: true });
  }
});

test('card reward advice keeps its character frame without an avatar', () => {
  assert.deepEqual(presentationFor({ character: 'silent', recommendation: { task: 'card_reward' } }), {
    theme: 'bird', avatar: false
  });
  assert.deepEqual(presentationFor({ character: 'silent', recommendation: { task: 'map_route' } }), {
    theme: 'bird', avatar: true
  });
});

test('unknown character cannot show another character avatar', () => {
  assert.deepEqual(presentationFor({ character: 'unknown' }), { theme: null, avatar: false });
});
