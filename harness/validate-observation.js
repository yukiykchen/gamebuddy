const assert = require('node:assert/strict');
const { createObservationStore } = require('./observation-store');

const state = {
  schema: 'runmate.state.v1',
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
assert.equal(store.getObservation(5102).schema, 'runmate.observation.v1');
assert.equal(store.ingest({ type: 'unknown' }, 103).accepted, false);

console.log('Observation store cases passed: 6');
