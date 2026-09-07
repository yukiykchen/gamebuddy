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

console.log('Protocol validation cases passed: 12');
