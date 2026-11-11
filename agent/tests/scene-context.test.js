'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractSceneContext, factLines, normalizeIntent } = require('../danmaku/scene-context');
const { codexFactCandidates } = require('../danmaku/codex-facts');
const lifecycleFixture = require('../../harness/fixtures/lifecycle.json');

const state = {
  player: { hp: 80, maxHp: 80, energy: 3, block: 0 },
  combat: {
    turn: 1,
    enemies: [{ name: '树枝史莱姆（小）', intent: 'SingleAttackIntent', alive: true }]
  }
};

test('scene context uses only explicit Mod fields', () => {
  const context = extractSceneContext({ state: { ...state, run: { character: 'ironclad', room: 'combat' } }, trigger: 'attack' });
  assert.deepEqual(context.enemyNames, ['树枝史莱姆（小）']);
  assert.deepEqual(context.intentKinds, ['attack']);
  assert.equal(context.hpBand, 'healthy');
  assert.equal(context.turn, 1);
  assert.equal(context.characterKey, 'ironclad');
  assert.equal(context.tone, 'tense');
  assert.equal(context.sceneTags.includes('attack-intent'), true);
  assert.deepEqual(factLines(context), []);
});

test('unknown character uses the generic language profile', () => {
  const context = extractSceneContext({ state: { ...state, run: { character: 'new-character' } }, trigger: 'mechanic' });
  assert.equal(context.characterKey, 'generic');
  assert.equal(context.sceneTags.includes('mechanic'), true);
});

test('replay fixture produces an explicit combat language profile', () => {
  const context = extractSceneContext({ state: lifecycleFixture[0], trigger: 'attack' });
  assert.equal(context.characterKey, 'ironclad');
  assert.equal(context.scene, 'combat');
  assert.equal(context.sceneTags.includes('attack'), true);
});

test('unknown enemy names get an entry fact without a catalog lookup', () => {
  const context = extractSceneContext({
    state: {
      ...state,
      combat: { ...state.combat, enemies: [{ name: '新怪物', intent: 'BuffIntent', alive: true }] }
    },
    trigger: 'entry'
  });
  assert.deepEqual(factLines(context), ['新怪物']);
});

test('heal intent is not collapsed into defend', () => {
  const { parseIntentKinds, primaryIntentKind } = require('../danmaku/scene-context');
  const fromText = parseIntentKinds('HealIntent | DefendIntent');
  const fromField = parseIntentKinds('HealIntent | DefendIntent', ['heal', 'defend']);
  assert.deepEqual(fromText, ['heal', 'defend']);
  assert.deepEqual(fromField, ['heal', 'defend']);
  assert.equal(primaryIntentKind(fromText), 'heal');
  assert.equal(normalizeIntent('HealIntent | DefendIntent'), 'heal');
});

test('health changes use concise fact keywords without numeric advice', () => {
  const lowContext = extractSceneContext({ state: { ...state, player: { ...state.player, hp: 10 } }, trigger: 'low_hp' });
  const dropContext = extractSceneContext({ state: { ...state, player: { ...state.player, hp: 50 } }, trigger: 'hp_drop' });
  assert.deepEqual(factLines(lowContext), []);
  assert.deepEqual(factLines(dropContext, { previousHp: 80 }), []);
});

test('card-played fact uses the explicit event card name', () => {
  const context = extractSceneContext({ state, trigger: 'card_played', event: { data: { cardName: '打击' } } });
  assert.deepEqual(factLines(context), ['已使用「打击」。']);
  assert.equal(normalizeIntent('SingleAttackIntent'), 'attack');
});

test('Codex monster facts are natural and do not expose source labels', () => {
  const facts = codexFactCandidates([{ id: 'AEONGLASS', name: '永世沙漏' }]);
  assert.equal(facts.length > 0, true);
  assert.match(facts[0].text, /永世沙漏/);
  assert.equal(/档案|标签|资料|建议/.test(facts[0].text), false);
  assert.equal(facts[0].source, 'codex');
});

test('Codex briefing includes the known action cycle', () => {
  const { monsterDetail } = require('../danmaku/codex-facts');
  const detail = monsterDetail({ id: 'NIBBIT', name: '小啃兽' });
  assert.match(detail.lines.join('\n'), /循环 顶撞 → Slice → 哈气/);
  assert.match(detail.lines.join('\n'), /会成长/);
  assert.equal(/造成12点伤害|常见遭遇|开场：/.test(detail.lines.join('\n')), false);
  assert.equal(detail.lines.length <= 3, true);
  assert.equal(/档案|标签|资料/.test(detail.lines.join('\n')), false);
});
