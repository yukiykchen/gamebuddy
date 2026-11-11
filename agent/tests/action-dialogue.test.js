'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ACTION_MODIFIER_COUNT,
  ACTION_POOLS,
  actionDialogue,
  classifyMove
} = require('../danmaku/action-dialogue');

test('action modifier inventory has more than one hundred entries', () => {
  assert.ok(ACTION_MODIFIER_COUNT > 100);
});

test('special mechanics never reuse ordinary attack classification', () => {
  assert.equal(classifyMove({ intent: 'Attack', damage: { normal: 8 } }), 'attack');
  assert.equal(classifyMove({ intent: 'Buff', powers: [{ power_id: 'STRENGTH', amount: 2 }] }), 'scaling');
  assert.equal(classifyMove({ intent: 'Summon', description: '召唤帮手' }), 'summons');
  assert.equal(classifyMove({ intent: 'Status', description: '塞入状态牌' }), 'status_cards');
  assert.equal(classifyMove({ intent: 'Attack', damage: { normal: 4, hit_count: 3 } }), 'multi_hit');
  assert.equal(classifyMove({ intent: 'Attack', description: '造成反伤' }), 'thorns');
  assert.notEqual(classifyMove({ intent: 'Buff', powers: [{ power_id: 'STRENGTH', amount: 2 }] }), 'attack');
});

test('same scene is reproducible while different categories use different pools', () => {
  const scaling = actionDialogue({
    moveName: '强化',
    move: { intent: 'Buff', powers: [{ power_id: 'STRENGTH', amount: 2 }] },
    enemy: { id: 'NIBBIT', name: '小啃兽' },
    sceneId: 'scene-1',
    occurrence: 1
  });
  const same = actionDialogue({
    moveName: '强化',
    move: { intent: 'Buff', powers: [{ power_id: 'STRENGTH', amount: 2 }] },
    enemy: { id: 'NIBBIT', name: '小啃兽' },
    sceneId: 'scene-1',
    occurrence: 1
  });
  assert.deepEqual(scaling, same);
  assert.equal(scaling.category, 'scaling');
  assert.ok(ACTION_POOLS.attack.lines.every(line => !scaling.line.includes(line)));
});
