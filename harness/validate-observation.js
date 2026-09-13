const assert = require('node:assert/strict');
const { createObservationStore } = require('./observation-store');

const state = {
  schema: 'gamebuddy.state.v1',
  timestamp: 1,
  source: 'observation-test',
  run: { act: 1, floor: 1, room: 'combat', character: 'ironclad' },
  player: { hp: 10, maxHp: 20, block: 0, gold: 0, energy: 3, maxEnergy: 3, cards: [], relics: [], potions: [] },
  combat: { turn: 1, hand: [], drawPile: [], discardPile: [], exhaustPile: [], enemies: [] },
  map: { visited: [] }
};
const store = createObservationStore({ historyLimit: 2, staleAfterMs: 5000 });

assert.equal(store.ingest({ type: 'state', data: state }, 100).accepted, true);
assert.equal(store.ingest({ type: 'state', data: { ...state, timestamp: 2 } }, 101).kind, 'duplicate');
assert.equal(store.ingest({ type: 'event', name: 'turn.started', timestamp: 3, data: { turn: 1 } }, 102).accepted, true);
assert.equal(store.getObservation(5101).fresh, true);
assert.equal(store.getObservation(5102).fresh, false);
assert.equal(store.getObservation(5102).recentEvents.length, 1);
assert.equal(store.getObservation(5102).schema, 'gamebuddy.observation.v1');
assert.equal(store.ingest({ type: 'unknown' }, 103).accepted, false);

const restOpen = {
  schema: 'gamebuddy.state.v1',
  timestamp: 10,
  source: 'observation-test',
  run: { act: 1, floor: 6, room: 'RestSite', character: 'ironclad', currentNode: 'RestSite' },
  player: {
    hp: 40,
    maxHp: 80,
    block: 0,
    gold: 0,
    energy: 0,
    maxEnergy: 3,
    cards: [{ id: 'Bash', name: '痛击', upgraded: false }],
    relics: [],
    potions: []
  },
  combat: null,
  map: { visited: ['1,1'], current: '1,1' }
};
const restStore = createObservationStore();
assert.equal(restStore.ingest({ type: 'state', data: restOpen }, 200).accepted, true);
const healed = restStore.ingest({
  type: 'state',
  data: { ...restOpen, timestamp: 11, player: { ...restOpen.player, hp: 64 } }
}, 201);
assert.equal(healed.accepted, true);
assert.equal(healed.derivedEvents[0].name, 'rest.closed');
assert.equal(healed.derivedEvents[0].data.action, 'HEAL');
assert.equal(healed.derivedEvents[0].data.hpBefore, 40);
assert.equal(healed.derivedEvents[0].data.hpAfter, 64);
const goldTick = restStore.ingest({
  type: 'state',
  data: {
    ...restOpen,
    timestamp: 12,
    player: { ...restOpen.player, hp: 64, gold: 12 }
  }
}, 202);
assert.equal(goldTick.accepted, true);
assert.equal((goldTick.derivedEvents || []).length, 0);

console.log('Observation store cases passed: 8');
