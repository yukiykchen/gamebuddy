const assert = require('node:assert/strict');
const { validateMessage, validateState } = require('./protocol');

const validState = {
  schema: 'gamebuddy.state.v1',
  timestamp: Date.now(),
  source: 'protocol-test',
  run: { act: 1, floor: 1, room: 'combat', character: 'ironclad' },
  player: { hp: 10, maxHp: 20, block: 0, gold: 0, energy: 3, maxEnergy: 3, cards: [], relics: [], potions: [] },
  combat: { turn: 1, hand: [], drawPile: [], discardPile: [], exhaustPile: [], enemies: [] },
  map: { visited: [] }
};

assert.equal(validateState(validState).ok, true);
assert.equal(validateState({ ...validState, combat: null }).ok, true);
assert.equal(validateMessage({ type: 'state', data: validState }).ok, true);
assert.equal(validateMessage({ type: 'event', name: 'turn.started', timestamp: Date.now(), data: { turn: 1 } }).ok, true);
assert.equal(validateMessage({ type: 'event', name: 'rest.opened', timestamp: Date.now() }).ok, true);
assert.equal(validateMessage({
  type: 'event',
  name: 'rest.closed',
  timestamp: Date.now(),
  data: { action: 'HEAL', hpBefore: 40, hpAfter: 64 }
}).ok, true);
assert.equal(validateMessage({ type: 'event', name: 'event.opened', timestamp: Date.now() }).ok, true);
assert.equal(validateMessage({ type: 'event', name: 'event.closed', timestamp: Date.now() }).ok, true);
assert.equal(validateMessage({ type: 'event', name: 'card.reward.closed', timestamp: Date.now() }).ok, true);
assert.equal(validateMessage({
  type: 'event',
  name: 'card.reward.opened',
  timestamp: Date.now(),
  data: { cards: [{ id: 'ANGER', name: '愤怒' }, 'IRON_WAVE'], canSkip: true }
}).ok, true);
assert.equal(validateMessage({
  type: 'event',
  name: 'card.reward.opened',
  timestamp: Date.now(),
  data: { cards: [] }
}).ok, false);
assert.equal(validateMessage({ type: 'event', name: 'made.up.event', timestamp: Date.now() }).ok, false);
assert.equal(validateMessage({ type: 'state', data: { ...validState, player: { ...validState.player, energy: '3' } } }).ok, false);
assert.equal(validateMessage({ type: 'unknown' }).ok, false);
assert.equal(validateState({
  ...validState,
  map: {
    visited: ['1,0'],
    nodes: [{ id: '1,0', row: 1, col: 0, type: 'Unknown', children: ['2,0'] }],
    routes: [['1,0', '2,0']]
  }
}).ok, true);
assert.equal(validateState({
  ...validState,
  map: { visited: [], nodes: [{ id: '1,0' }] }
}).ok, false);
assert.equal(validateState({
  ...validState,
  combat: null,
  event: {
    title: '沉没雕像',
    description: '钱可是个好东西……',
    options: [{ index: 0, label: '拿起石剑', description: '获得石之剑。', locked: false }]
  }
}).ok, true);
assert.equal(validateState({
  ...validState,
  combat: null,
  event: {
    title: '佩尔',
    description: '有傀儡来了？能帮我去看看父亲的状况么？我太累了……',
    kind: 'ancient',
    options: [
      { index: 0, label: '佩尔之角', description: '将2张放松加入你的牌组。' },
      { index: 1, label: '佩尔之牙', description: '从你的牌组中选择5张牌移除。在每场战斗结束时，将其中随机1牌升级然后返还。' },
      { index: 2, label: '佩尔之眼', description: '你在每场战斗中第一次没有打出任何牌就结束回合时，消耗所有手牌然后进行一个额外回合。' }
    ]
  }
}).ok, true);
assert.equal(validateState({
  ...validState,
  combat: null,
  cardReward: {
    options: [{ index: 0, id: 'Bash', name: '痛击', type: 'Attack', cost: 2, upgraded: false, description: '造成伤害。' }]
  }
}).ok, true);
assert.equal(validateState({
  ...validState,
  cardReward: { options: [{ index: 0, id: 'Bash', name: '痛击', type: 'Attack', cost: '2' }] }
}).ok, false);
assert.equal(validateState({
  ...validState,
  combat: null,
  reward: { cards: [{ id: 'ANGER', name: '愤怒' }], canSkip: true }
}).ok, true);
assert.equal(validateState({
  ...validState,
  combat: null,
  reward: { cards: [] }
}).ok, false);

console.log('Protocol validation cases passed: 20');
