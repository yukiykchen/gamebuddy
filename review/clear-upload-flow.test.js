const assert = require('node:assert/strict');
const { FACT_EVENT_TYPES } = require('../harness/fact-protocol');
const { submitClearedRun } = require('./clear-upload-client');

assert.equal(FACT_EVENT_TYPES.has('event.selected'), true);
assert.equal(FACT_EVENT_TYPES.has('event.option_selected'), true);

function factsFor({ cleared, reason, saveLoad }) {
  const facts = [
    { eventType: 'run.started', occurredAt: 1_000, payload: { gameMode: 'Standard' } },
    {
      eventType: 'run.observed', occurredAt: 1_200,
      payload: {
        character: 'IRONCLAD', ascension: 5,
        deck: [{ id: 'STRIKE', name: 'Strike', upgraded: false }],
        relics: [{ id: 'OLD', name: 'Old' }],
        potions: [{ id: 'POT' }],
        hp: 80
      }
    },
    {
      eventType: 'run.observed', occurredAt: 4_200,
      payload: {
        character: 'IRONCLAD', ascension: 5,
        deck: [{ id: 'STRIKE', name: 'Strike+', upgraded: true, description: 'Deal 9' }],
        relics: [{ id: 'BURNING_BLOOD', name: 'Burning Blood' }],
        potions: [{ id: 'POT', name: 'Potion' }],
        hp: 12, seed: 'hidden'
      }
    },
    { eventType: 'event.option_selected', occurredAt: 2_000, payload: { optionId: 'OTHER', label: 'Other' } },
    { eventType: 'event.selected', occurredAt: 2_100, payload: { eventId: 'FISH', pageId: 'INITIAL', optionId: 'BANANA' } }
  ];
  if (saveLoad) facts.push({ eventType: 'combat.attempt_replaced', occurredAt: 3_000, payload: { replacedGeneration: 0 } });
  facts.push({ eventType: 'run.ended', occurredAt: 5_500, payload: { cleared, reason } });
  return facts;
}

function ended(facts) {
  return facts.find(fact => fact.eventType === 'run.ended');
}

(async () => {
  const calls = [];
  const client = {
    async submit(record) {
      calls.push(record);
      return { ok: true, status: 201 };
    }
  };
  const stored = { durable: true, duplicate: false };

  const clearFacts = factsFor({ cleared: true, reason: 'game_ended_victory', saveLoad: false });
  assert.equal((await submitClearedRun({
    fact: { ...ended(clearFacts), runId: 'clear-run' },
    stored, replay: false, facts: clearFacts, coverage: {}, client
  })).ok, true);
  const saveFacts = factsFor({ cleared: true, reason: 'game_ended_victory', saveLoad: true });
  assert.equal((await submitClearedRun({
    fact: { ...ended(saveFacts), runId: 'save-run' },
    stored, replay: false, facts: saveFacts, coverage: {}, client
  })).ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].combatSaveLoad, false);
  assert.equal(calls[0].displayName, '匿名人士');
  assert.equal(calls[0].startedAt, 1_000);
  assert.equal(calls[1].combatSaveLoad, true);
  assert.equal(calls[0].runId, 'clear-run');
  assert.equal(calls[0].observedDurationSeconds, 4);
  assert.deepEqual(calls[0].finalDeck, [{ id: 'STRIKE', upgraded: true }]);
  assert.deepEqual(calls[0].finalRelics, [{ id: 'BURNING_BLOOD' }]);
  assert.deepEqual(calls[0].selectedEvents, [{ eventId: 'FISH', pageId: 'INITIAL', optionId: 'BANANA' }]);
  assert.equal(calls[0].hp, undefined);
  assert.equal(calls[0].potions, undefined);
  assert.equal(calls[0].seed, undefined);
  assert.equal(JSON.stringify(calls[0]).includes('Strike+'), false);
  assert.equal(JSON.stringify(calls[0]).includes('Burning Blood'), false);

  async function skipped(extra) {
    const before = calls.length;
    const result = await submitClearedRun({ client, stored, replay: false, coverage: {}, ...extra });
    assert.equal(result, null);
    assert.equal(calls.length, before);
  }
  const lossFacts = factsFor({ cleared: false, reason: 'game_ended_not_cleared', saveLoad: false });
  await skipped({ fact: { ...ended(lossFacts), runId: 'loss-run' }, facts: lossFacts });
  const abandonFacts = factsFor({ cleared: false, reason: 'abandoned', saveLoad: true });
  await skipped({ fact: { ...ended(abandonFacts), runId: 'abandon-run' }, facts: abandonFacts });
  await skipped({ fact: { ...ended(clearFacts), runId: 'replay-run' }, facts: clearFacts, replay: true });
  await skipped({
    fact: { ...ended(clearFacts), runId: 'duplicate-run' },
    facts: clearFacts,
    stored: { durable: true, duplicate: true }
  });

  const failing = {
    async submit() {
      throw new Error('offline');
    }
  };
  const failed = await submitClearedRun({
    fact: { ...ended(clearFacts), runId: 'clear-run' },
    stored, replay: false, facts: clearFacts, coverage: {}, client: failing
  });
  assert.deepEqual(failed, { ok: false, reason: 'clear_upload_failed' });
  console.log('Clear upload flow tests passed.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
