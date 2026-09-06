const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { decide } = require('../router');

function loadState(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', `${name}.json`), 'utf8'))[0];
}

function observation(name) {
  const state = loadState(name);
  return { schema: 'runmate.observation.v1', sequence: 1, receivedAt: Date.now(), ageMs: 20, fresh: true, state, recentEvents: [] };
}

test('combat agent returns a deterministic sequence from codex-backed cards', () => {
  const decision = decide(observation('combat'));
  assert.equal(decision.agent, 'combat');
  assert.equal(decision.status, 'ready');
  assert.ok(Array.isArray(decision.payload.sequence));
  assert.ok(decision.payload.sequence.length > 0);
});

test('reward agent ranks visible card rewards', () => {
  const decision = decide(observation('reward'));
  assert.equal(decision.agent, 'reward');
  assert.equal(decision.status, 'ready');
  assert.equal(decision.payload.rewards.length, 2);
});

test('route agent scores map nodes', () => {
  const decision = decide(observation('map'));
  assert.equal(decision.agent, 'route');
  assert.equal(decision.status, 'ready');
  assert.equal(decision.payload.options.length, 3);
});

test('event agent resolves a codex event and option', () => {
  const decision = decide(observation('event'));
  assert.equal(decision.agent, 'event');
  assert.equal(decision.status, 'ready');
  assert.ok(decision.payload.options.length > 0);
});
