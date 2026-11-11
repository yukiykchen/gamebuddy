const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLocalFactStore } = require('../facts/local-fact-store');
const { validateFactEvent } = require('./fact-protocol');

const fullRun = require('./fixtures/fact-full-run.json');
const tenReloads = require('./fixtures/fact-ten-reloads');

function replayFixture(facts) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamebuddy-fact-replay-'));
  const store = createLocalFactStore({ rootDir: root, now: () => 9_000 });
  for (const fact of facts) {
    assert.equal(validateFactEvent(fact).ok, true, `${fact.eventId} is invalid`);
    assert.equal(store.ingest(fact, { replay: true }).durable, true);
  }
  return { root, store };
}

{
  const { store } = replayFixture(fullRun);
  const effective = store.getEffectiveFacts('run-full');
  assert.equal(new Set(effective.map(fact => fact.runId)).size, 1);
  assert.equal(effective.find(fact => fact.eventType === 'run.ended').payload.cleared, true);
  assert.equal(effective.find(fact => fact.eventType === 'reward.resolved').payload.outcome, 'unknown');
  assert.equal(store.getCoverage('run-full').families.damage.state, 'unavailable');
  const firstSummary = JSON.stringify(effective);
  for (const fact of fullRun) store.ingest(fact, { replay: true });
  assert.equal(JSON.stringify(store.getEffectiveFacts('run-full')), firstSummary, 'Repeated replay changed effective facts.');
}

{
  const { store } = replayFixture(tenReloads);
  const effective = store.getEffectiveFacts('run-reloads');
  const combatIds = new Set(effective.filter(fact => fact.combatId).map(fact => fact.combatId));
  assert.deepEqual([...combatIds], ['combat-same-room']);
  const plays = effective.filter(fact => fact.eventType === 'card.played');
  assert.equal(plays.length, 1);
  assert.equal(plays[0].payload.cardId, 'ATTEMPT_10');
  assert.equal(plays[0].attemptGeneration, 10);
  assert.equal(effective.some(fact => fact.payload?.cardId === 'ATTEMPT_0'), false);
  assert.equal(new Set(effective.map(fact => fact.runId)).size, 1);
}

console.log('Fact replay validation passed.');
