const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  isAtRunStart,
  speechForThisRun,
  applyRunEntry,
  loadSlStats,
  saveSlStats,
  createSlTracker
} = require('./sl-stats');

const startState = {
  run: { act: 1, floor: 1, room: 'map', character: 'ironclad' },
  map: { start: '0,0', current: '0,0', visited: ['0,0'] }
};

const midState = {
  run: { act: 1, floor: 7, room: 'map', character: 'ironclad' },
  map: { start: '0,0', current: '2,1', visited: ['0,0', '1,0', '2,1'] }
};

assert.equal(isAtRunStart(startState), true);
assert.equal(isAtRunStart(midState), false);
assert.equal(isAtRunStart({ run: { act: 2 }, map: { start: '0,0', current: '0,0', visited: ['0,0'] } }), false);
assert.equal(isAtRunStart({ run: { act: 1, floor: 1 }, map: { start: null, current: null, visited: [] } }), true);

let session = { inSession: false, thisRun: 0 };
session = applyRunEntry(session, { hasLiveRun: true, state: startState });
assert.equal(session.thisRun, 0);
assert.equal(session.incremented, false);

session = applyRunEntry(session, { hasLiveRun: true, state: { ...startState, run: { ...startState.run, floor: 2 } } });
assert.equal(session.thisRun, 0);
assert.equal(session.incremented, false);

session = applyRunEntry(session, { hasLiveRun: false });
assert.equal(session.inSession, false);
assert.equal(session.thisRun, 0);

session = applyRunEntry(session, { hasLiveRun: true, state: midState });
assert.equal(session.thisRun, 1);
assert.equal(session.incremented, true);

session = applyRunEntry(session, { hasLiveRun: true, state: midState });
assert.equal(session.thisRun, 1);
assert.equal(session.incremented, false);

// Starting another run in the same Bridge session must clear the previous
// run's count even though no disconnect was observed.
session = applyRunEntry(session, { hasLiveRun: true, state: startState });
assert.equal(session.inSession, true);
assert.equal(session.thisRun, 0);
assert.equal(session.incremented, false);

session = applyRunEntry(session, { hasLiveRun: false });
session = applyRunEntry(session, { hasLiveRun: true, state: midState });
assert.equal(session.thisRun, 1);

session = applyRunEntry(session, { hasLiveRun: false });
session = applyRunEntry(session, { hasLiveRun: true, state: midState });
assert.equal(session.thisRun, 2);

session = applyRunEntry(session, { hasLiveRun: false });
session = applyRunEntry(session, { hasLiveRun: true, state: startState });
assert.equal(session.thisRun, 0);
assert.equal(session.incremented, false);

assert.match(speechForThisRun(1), /读档/);
assert.match(speechForThisRun(2), /读档/);
assert.match(speechForThisRun(5), /5/);
assert.match(speechForThisRun(10), /10/);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamebuddy-sl-'));
const file = path.join(dir, 'sl-stats.json');
saveSlStats(file, { thisRun: 2 });
assert.equal(loadSlStats(file).thisRun, 2);

const live = createSlTracker({ persistPath: file });
assert.equal(live.snapshot().thisRun, 2);
live.observe({ hasLiveRun: true, state: midState });
assert.equal(loadSlStats(file).thisRun, 3);

const beforeReplay = loadSlStats(file).thisRun;
const replay = createSlTracker();
replay.observe({ hasLiveRun: true, state: startState });
replay.observe({ hasLiveRun: false });
const replayMid = replay.observe({ hasLiveRun: true, state: midState });
assert.equal(replayMid.thisRun, 1);
assert.equal(replayMid.incremented, true);
assert.equal(loadSlStats(file).thisRun, beforeReplay);

const replayStartThenMid = createSlTracker();
assert.equal(replayStartThenMid.observe({ hasLiveRun: true, state: startState }).thisRun, 0);
replayStartThenMid.observe({ hasLiveRun: false });
assert.equal(replayStartThenMid.observe({ hasLiveRun: true, state: midState }).thisRun, 1);

fs.rmSync(dir, { recursive: true, force: true });
console.log('SL stats cases passed');
