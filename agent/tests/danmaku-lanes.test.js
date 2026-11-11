'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DanmakuDirector } = require('../danmaku/director');

test('only three lanes are available inside the marked band', () => {
  let now = 0;
  const director = new DanmakuDirector({ now: () => now, gapMs: 450 });
  const scope = { runId: 'run', sceneId: 'scene', stateRevision: 1 };
  director.setContext(scope);
  director.burst({ ...scope, eventId: 'burst', trigger: 'shared_combat', factTexts: ['一', '二', '三', '四'],
    factSourceByText: Object.fromEntries(['一', '二', '三', '四'].map(text => [text, { source: 'shared' }])) });

  const lanes = [];
  for (now of [0, 450, 900, 1350]) {
    lanes.push(...director.tick().map(message => message.lane));
  }
  assert.deepEqual(lanes, [0, 1, 2]);
  assert.equal(director.queue.length, 1);
  now = 5600;
  assert.deepEqual(director.tick().map(message => message.lane), [0]);
});
