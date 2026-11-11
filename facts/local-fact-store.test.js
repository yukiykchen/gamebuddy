const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLocalFactStore } = require('./local-fact-store');

function temporaryRoot(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

function fact(sequence, eventType, overrides = {}) {
  return {
    schema: 'gamebuddy.fact-event.v1',
    eventVersion: 1,
    eventId: `source-a:${sequence}`,
    eventType,
    runId: 'run-a',
    segmentId: 'segment-a',
    combatId: null,
    decisionId: null,
    actionId: null,
    parentActionId: null,
    sourceSessionId: 'source-a',
    sourceSeq: sequence,
    occurredAt: 1_000 + sequence,
    sourceElapsedMs: sequence,
    attemptGeneration: null,
    contextSnapshotId: null,
    quality: { observationMethod: 'direct_hook', unknownFields: [], unknownReasons: {} },
    payload: {},
    ...overrides
  };
}

{
  const root = temporaryRoot('gamebuddy-facts-basic');
  const store = createLocalFactStore({ rootDir: root, now: () => 2_000 });
  const started = fact(1, 'run.started', { payload: { character: 'IRONCLAD' } });
  const first = store.ingest(started);
  assert.equal(first.durable, true);
  assert.equal(first.ackSourceSeq, 1);
  const replayed = store.ingest(started);
  assert.equal(replayed.duplicate, true);
  assert.equal(replayed.ackSourceSeq, first.ackSourceSeq);
  assert.equal(store.ingest(fact(2, 'room.entered', { eventId: 'source-a:2', payload: { roomId: 1 } })).durable, true);
  assert.equal(store.ingest(fact(3, 'room.entered', { eventId: 'source-a:3', payload: { roomId: 1 } })).durable, true);
  assert.equal(store.getEffectiveFacts('run-a').length, 3, 'Distinct identical actions must be retained.');

  const restarted = createLocalFactStore({ rootDir: root, now: () => 3_000 });
  assert.equal(restarted.getEffectiveFacts('run-a').length, 3, 'Facts did not survive restart.');
  assert.equal(restarted.rebuildIndex().runs[0].runId, 'run-a');
}

{
  const root = temporaryRoot('gamebuddy-facts-combat');
  const store = createLocalFactStore({ rootDir: root, now: () => 4_000 });
  const combat = (sequence, eventType, generation, payload = {}) => fact(sequence, eventType, {
    combatId: 'combat-a',
    attemptGeneration: generation,
    actionId: eventType === 'card.played' ? `action-${sequence}` : null,
    payload
  });
  store.ingest(combat(1, 'combat.started', 0));
  store.ingest(combat(2, 'card.played', 0, { cardId: 'STRIKE_IRONCLAD' }));
  store.ingest(combat(3, 'combat.ended', 0, { victory: false }));
  store.ingest(combat(4, 'combat.attempt_replaced', 1, { replacedGeneration: 0 }));
  store.ingest(combat(5, 'card.played', 1, { cardId: 'DEFEND_IRONCLAD' }));
  let effective = store.getEffectiveFacts('run-a');
  assert.deepEqual(effective.filter(item => item.eventType === 'card.played').map(item => item.payload.cardId), ['DEFEND_IRONCLAD']);

  const afterCrash = createLocalFactStore({ rootDir: root, now: () => 5_000 });
  effective = afterCrash.getEffectiveFacts('run-a');
  assert.deepEqual(effective.filter(item => item.eventType === 'card.played').map(item => item.payload.cardId), ['STRIKE_IRONCLAD']);

  afterCrash.ingest(combat(6, 'combat.attempt_replaced', 2, { replacedGeneration: 0 }));
  afterCrash.ingest(combat(7, 'card.played', 2, { cardId: 'BASH' }));
  afterCrash.ingest(combat(8, 'combat.ended', 2, { victory: true }));
  effective = afterCrash.getEffectiveFacts('run-a');
  assert.deepEqual(effective.filter(item => item.eventType === 'card.played').map(item => item.payload.cardId), ['BASH']);
  assert.equal(effective.some(item => item.attemptGeneration === 0), false);
}

{
  const root = temporaryRoot('gamebuddy-facts-gap');
  const store = createLocalFactStore({ rootDir: root, now: () => 6_000 });
  assert.equal(store.ingest(fact(1, 'run.started')).ackSourceSeq, 1);
  const ahead = store.ingest(fact(3, 'room.entered'));
  assert.equal(ahead.ackSourceSeq, 1, 'A later sequence must not acknowledge the missing prefix.');
  assert.equal(store.getCoverage('run-a').gaps.some(gap => gap.reason === 'not_observed'), false);
  assert.equal(store.ingest(fact(2, 'map.observed')).ackSourceSeq, 3);
  assert.equal(store.getCoverage('run-a').gaps.length, 0, 'A filled sequence hole is not a declared gap.');
  store.ingest(fact(4, 'capture.capability_reported', {
    payload: {
      capabilities: {
        card_play: { state: 'unavailable', reason: 'hook_failed' },
        damage: { state: 'available' }
      }
    }
  }));
  assert.equal(store.getCoverage('run-a').families.card_play.state, 'unavailable');
}

{
  const root = temporaryRoot('gamebuddy-facts-tail');
  const store = createLocalFactStore({ rootDir: root, now: () => 7_000 });
  store.ingest(fact(1, 'run.started'));
  const index = store.rebuildIndex();
  const runDirectory = path.join(root, 'runs', index.runs[0].directory);
  fs.appendFileSync(path.join(runDirectory, 'events-0001.jsonl'), '{broken');
  const recovered = createLocalFactStore({ rootDir: root, now: () => 8_000 });
  assert.equal(recovered.getEffectiveFacts('run-a').length, 1);
  assert.equal(recovered.getCoverage('run-a').health.some(item => item.type === 'recovered_corrupt_tail'), true);
}

{
  const root = temporaryRoot('gamebuddy-facts-write-failed');
  const store = createLocalFactStore({ rootDir: root, now: () => 9_000 });
  const originalFsync = fs.fsyncSync;
  const blocked = fact(1, 'run.started', {
    runId: 'run-write-failed',
    eventId: 'write-failed:1',
    sourceSessionId: 'write-failed'
  });
  fs.fsyncSync = () => {
    throw new Error('simulated disk full');
  };
  try {
    const failed = store.ingest(blocked);
    assert.equal(failed.durable, false, 'A failed durable write was incorrectly acknowledged.');
    assert.equal(failed.reason, 'write_failed');
    assert.equal(failed.ackSourceSeq, undefined);
    assert.equal(store.getEffectiveFacts('run-write-failed').length, 0);
    const healthWrite = store.ingest(fact(2, 'room.entered', {
      runId: 'run-write-failed',
      eventId: 'write-failed:2',
      sourceSessionId: 'write-failed'
    }));
    assert.equal(healthWrite.durable, false);
    assert.equal(healthWrite.reason, 'write_failed');
  } finally {
    fs.fsyncSync = originalFsync;
  }
  const retried = store.ingest(blocked);
  assert.equal(retried.durable, true);
  assert.equal(retried.ackSourceSeq, 1);
  assert.equal(store.ingest(fact(2, 'room.entered', {
    runId: 'run-write-failed',
    eventId: 'write-failed:2',
    sourceSessionId: 'write-failed'
  })).ackSourceSeq, 2);
  assert.equal(store.getEffectiveFacts('run-write-failed').length, 2);
}

{
  const root = temporaryRoot('gamebuddy-facts-index-failed');
  const store = createLocalFactStore({ rootDir: root, now: () => 9_500 });
  const originalRename = fs.renameSync;
  fs.renameSync = (from, to) => {
    if (String(to).endsWith(`${path.sep}index.json`)) throw new Error('simulated index failure');
    return originalRename(from, to);
  };
  const blocked = fact(1, 'run.started', {
    runId: 'run-index-failed',
    eventId: 'index-failed:1',
    sourceSessionId: 'index-failed'
  });
  try {
    const failed = store.ingest(blocked);
    assert.equal(failed.durable, false);
    assert.equal(failed.reason, 'write_failed');
    assert.equal(failed.ackSourceSeq, undefined);
    assert.equal(store.getCoverage('run-index-failed').health.some(item => item.type === 'write_failed'), true);
  } finally {
    fs.renameSync = originalRename;
  }
  const reloaded = createLocalFactStore({ rootDir: root, now: () => 9_600 });
  assert.equal(reloaded.getCoverage('run-index-failed').health.some(item => item.type === 'write_failed'), true);
  const retried = store.ingest(blocked);
  assert.equal(retried.durable, true);
  assert.equal(retried.ackSourceSeq, 1);
  assert.equal(store.getEffectiveFacts('run-index-failed').length, 1);
}

{
  const root = temporaryRoot('gamebuddy-facts-declared-gap');
  const store = createLocalFactStore({ rootDir: root, now: () => 10_000 });
  assert.equal(store.ingest(fact(2, 'room.entered')).ackSourceSeq, 0);
  assert.equal(store.ingest(fact(3, 'map.observed')).ackSourceSeq, 0);
  assert.equal(store.ingest(fact(4, 'room.exited')).ackSourceSeq, 0);
  const declared = store.ingest(fact(5, 'capture.gap_detected', {
    payload: { fromSourceSeq: 1, toSourceSeq: 1, reason: 'queue_overflow' }
  }));
  assert.equal(declared.ackSourceSeq, 5, 'A declared overflow gap must release the contiguous acknowledgement.');
  const coverage = store.getCoverage('run-a');
  const gap = coverage.gaps.find(item => item.reason === 'queue_overflow');
  assert.equal(gap.from, 1);
  assert.equal(gap.to, 1);
  assert.equal(coverage.health.some(item => item.type === 'gap_detected' && item.reason === 'queue_overflow'), true);
  const widened = store.ingest(fact(5, 'capture.gap_detected', {
    payload: { fromSourceSeq: 1, toSourceSeq: 1, reason: 'queue_overflow' }
  }));
  assert.equal(widened.duplicate, true);
  assert.equal(widened.ackSourceSeq, 5);
  assert.equal(store.getEffectiveFacts('run-a').filter(item => item.eventId === 'source-a:5').length, 1);

  const restarted = createLocalFactStore({ rootDir: root, now: () => 10_500 });
  assert.equal(restarted.ingest(fact(2, 'room.entered')).ackSourceSeq, 5);
}

{
  const root = temporaryRoot('gamebuddy-facts-gap-widen');
  const store = createLocalFactStore({ rootDir: root, now: () => 11_000 });
  assert.equal(store.ingest(fact(1, 'run.started')).ackSourceSeq, 1);
  assert.equal(store.ingest(fact(5, 'room.entered')).ackSourceSeq, 1);
  const narrow = store.ingest(fact(4, 'capture.gap_detected', {
    payload: { fromSourceSeq: 2, toSourceSeq: 2, reason: 'queue_overflow' }
  }));
  assert.equal(narrow.ackSourceSeq, 2, 'A gap must not skip a sequence it does not cover.');
  const wider = store.ingest(fact(4, 'capture.gap_detected', {
    payload: { fromSourceSeq: 2, toSourceSeq: 3, reason: 'queue_overflow' }
  }));
  assert.equal(wider.duplicate, true);
  assert.equal(wider.durable, true);
  assert.equal(wider.ackSourceSeq, 5, 'Widening a declared gap must advance the contiguous acknowledgement.');
  const gap = store.getCoverage('run-a').gaps.find(item => item.reason === 'queue_overflow');
  assert.equal(gap.from, 2);
  assert.equal(gap.to, 3);
  assert.equal(store.getEffectiveFacts('run-a').filter(item => item.eventType === 'capture.gap_detected').length, 1);
}

{
  const root = temporaryRoot('gamebuddy-facts-session');
  const store = createLocalFactStore({ rootDir: root, now: () => 12_000 });
  assert.equal(store.ingest(fact(1, 'run.started')).ackSourceSeq, 1);
  assert.equal(store.ingest(fact(2, 'room.entered')).ackSourceSeq, 2);
  const restarted = store.ingest(fact(1, 'run.resumed', {
    eventId: 'source-b:1',
    sourceSessionId: 'source-b'
  }));
  assert.equal(restarted.ackSourceSeq, 1, 'A new source session must start its own sequence.');
  const ahead = store.ingest(fact(1, 'room.exited', {
    eventId: 'source-b:3',
    sourceSessionId: 'source-b',
    sourceSeq: 3
  }));
  assert.equal(ahead.ackSourceSeq, 1, 'A new session must not inherit the previous session acknowledgement.');
  const previous = store.ingest(fact(2, 'room.entered'));
  assert.equal(previous.duplicate, true);
  assert.equal(previous.ackSourceSeq, 2);
}

{
  const root = temporaryRoot('gamebuddy-facts-fatal-combat');
  const store = createLocalFactStore({ rootDir: root, now: () => 13_000 });
  assert.equal(store.ingest(fact(1, 'combat.started', {
    combatId: 'fatal',
    attemptGeneration: 0,
    payload: { enemies: [{ id: 'OWL_MAGISTRATE', name: '猫头鹰法官' }] }
  })).durable, true);
  assert.equal(store.ingest(fact(2, 'run.ended', { payload: { cleared: false, reason: 'game_ended_not_cleared' } })).durable, true);
  const restarted = createLocalFactStore({ rootDir: root, now: () => 14_000 });
  const types = restarted.getEffectiveFacts('run-a').map(item => item.eventType);
  assert.deepEqual(types, ['combat.started', 'run.ended']);
}

console.log('Local fact store tests passed.');
