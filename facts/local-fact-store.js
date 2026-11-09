const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { validateFactEvent } = require('../harness/fact-protocol');

const MANIFEST_SCHEMA = 'gamebuddy.fact-manifest.v1';
const COVERAGE_SCHEMA = 'gamebuddy.fact-coverage.v1';
const INDEX_SCHEMA = 'gamebuddy.fact-index.v1';

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    const descriptor = fs.openSync(temporary, 'w');
    try {
      fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temporary, filePath);
  } catch (error) {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
    throw error;
  }
}

function appendJsonl(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const descriptor = fs.openSync(filePath, 'a');
  const startingSize = fs.fstatSync(descriptor).size;
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(value)}\n`, 'utf8');
    fs.fsyncSync(descriptor);
  } catch (error) {
    try {
      fs.ftruncateSync(descriptor, startingSize);
    } catch {
      // Recovery will discard an invalid tail on the next read.
    }
    throw error;
  } finally {
    fs.closeSync(descriptor);
  }
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readJsonlRecover(filePath) {
  if (!fs.existsSync(filePath)) return { rows: [], recovered: false };
  const rows = [];
  let recovered = false;
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      recovered = true;
      break;
    }
  }
  if (recovered) {
    const temporary = `${filePath}.${process.pid}.recover`;
    fs.writeFileSync(temporary, rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
    fs.renameSync(temporary, filePath);
  }
  return { rows, recovered };
}

function safeId(value) {
  const readable = String(value).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'unknown';
  const digest = crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
  return `${readable}-${digest}`;
}

function factFamily(eventType) {
  if (eventType.startsWith('capture.')) return 'capture';
  if (eventType.startsWith('run.') || eventType.startsWith('room.')) return 'lifecycle';
  if (/^(reward|route|shop|rest|event|map)\./.test(eventType)) return 'decisions';
  if (/^(deck|relic|potion)\./.test(eventType)) return 'build';
  if (/^(combat|turn|entity)\./.test(eventType)) return 'combat_boundary';
  if (eventType === 'card.played') return 'card_play';
  if (/^card\./.test(eventType)) return 'card_movement';
  if (/^(damage|block|heal)\./.test(eventType)) return 'combat_resolution';
  if (/^(resource|power|gold|health|max_health|capacity)\./.test(eventType)) return 'resources';
  return 'unknown';
}

function createLocalFactStore({ rootDir, now = () => Date.now() } = {}) {
  if (!rootDir) throw new Error('fact rootDir is required');
  const runsDir = path.join(rootDir, 'runs');
  const indexPath = path.join(rootDir, 'index.json');
  const cache = new Map();
  fs.mkdirSync(runsDir, { recursive: true });

  function pathsFor(runId) {
    const directory = path.join(runsDir, safeId(runId));
    return {
      directory,
      manifest: path.join(directory, 'manifest.json'),
      events: path.join(directory, 'events-0001.jsonl'),
      snapshots: path.join(directory, 'snapshots-0001.jsonl'),
      coverage: path.join(directory, 'coverage.json'),
      combats: path.join(directory, 'combats')
    };
  }

  function newManifest(runId) {
    return {
      schema: MANIFEST_SCHEMA,
      runId,
      createdAt: now(),
      updatedAt: now(),
      replay: false,
      eventIds: [],
      sourceSessions: {},
      combats: {}
    };
  }

  function newCoverage() {
    return {
      schema: COVERAGE_SCHEMA,
      families: {},
      gaps: [],
      rejected: [],
      health: []
    };
  }

  function loadRun(runId) {
    if (cache.has(runId)) return cache.get(runId);
    const paths = pathsFor(runId);
    fs.mkdirSync(paths.directory, { recursive: true });
    const manifest = readJson(paths.manifest, newManifest(runId));
    const coverage = readJson(paths.coverage, newCoverage());
    if (manifest.runId !== runId || manifest.schema !== MANIFEST_SCHEMA) {
      throw new Error(`invalid fact manifest for ${runId}`);
    }
    let recoveryDirty = false;
    for (const [combatId, combat] of Object.entries(manifest.combats || {})) {
      if (combat.pendingGeneration !== undefined && combat.pendingGeneration !== null) {
        const pending = path.join(paths.combats, `${safeId(combatId)}-g${combat.pendingGeneration}.jsonl`);
        const pendingSize = fs.existsSync(pending) ? fs.statSync(pending).size : 0;
        const fatalAttempt = (combat.activeGeneration === undefined || combat.activeGeneration === null) && pendingSize > 0;
        if (fatalAttempt) {
          combat.activeGeneration = combat.pendingGeneration;
          delete combat.pendingGeneration;
          coverage.health.push({ at: now(), type: 'kept_unfinished_combat', combatId });
        } else {
          if (fs.existsSync(pending)) fs.rmSync(pending);
          delete combat.pendingGeneration;
          coverage.health.push({ at: now(), type: 'discarded_incomplete_attempt', combatId });
        }
        recoveryDirty = true;
      }
    }
    manifest.combats ||= {};
    manifest.eventIds ||= [];
    manifest.sourceSessions ||= {};
    coverage.families ||= {};
    coverage.gaps ||= [];
    coverage.rejected ||= [];
    coverage.health ||= [];
    const loaded = {
      paths,
      manifest,
      coverage,
      eventIds: new Set(manifest.eventIds),
      livePending: new Map(),
      recoveryDirty
    };
    cache.set(runId, loaded);
    return loaded;
  }

  function persistMetadata(run) {
    run.manifest.updatedAt = now();
    run.manifest.eventIds = [...run.eventIds];
    atomicWriteJson(run.paths.coverage, run.coverage);
    atomicWriteJson(run.paths.manifest, run.manifest);
  }

  function persistRecoveryIfNeeded(run) {
    if (!run.recoveryDirty) return;
    persistMetadata(run);
    run.recoveryDirty = false;
  }

  function cloneRunState(run) {
    return {
      manifest: JSON.parse(JSON.stringify(run.manifest)),
      coverage: JSON.parse(JSON.stringify(run.coverage)),
      eventIds: new Set(run.eventIds),
      livePending: new Map(run.livePending),
      recoveryDirty: run.recoveryDirty
    };
  }

  function restoreRunState(run, snapshot) {
    run.manifest = snapshot.manifest;
    run.coverage = snapshot.coverage;
    run.eventIds = snapshot.eventIds;
    run.livePending = snapshot.livePending;
    run.recoveryDirty = snapshot.recoveryDirty;
  }

  function trackAppend(appended, filePath, value) {
    const existed = fs.existsSync(filePath);
    const previousSize = existed ? fs.statSync(filePath).size : 0;
    appendJsonl(filePath, value);
    appended.push({ filePath, existed, previousSize });
  }

  function rollbackAppended(appended) {
    for (let index = appended.length - 1; index >= 0; index -= 1) {
      const item = appended[index];
      try {
        if (!item.existed) {
          if (fs.existsSync(item.filePath)) fs.rmSync(item.filePath, { force: true });
        } else {
          const descriptor = fs.openSync(item.filePath, 'r+');
          try {
            fs.ftruncateSync(descriptor, item.previousSize);
          } finally {
            fs.closeSync(descriptor);
          }
        }
      } catch {
        // Memory rollback still prevents acknowledging a partially written fact.
      }
    }
  }

  function commitDurable(run, snapshot) {
    persistMetadata(run);
    try {
      rebuildIndex();
    } catch (error) {
      try {
        atomicWriteJson(run.paths.coverage, snapshot.coverage);
        atomicWriteJson(run.paths.manifest, snapshot.manifest);
      } catch {
        // A failed rollback must not turn into a durable acknowledgement.
      }
      throw error;
    }
  }

  function rangesOverlapOrTouch(gap, from, to) {
    return from <= gap.to + 1 && to >= gap.from - 1;
  }

  function ensureSession(run, sourceSessionId) {
    const existing = run.manifest.sourceSessions[sourceSessionId];
    const session = existing || { ackSourceSeq: 0, seen: [], declaredGaps: [] };
    if (!Number.isInteger(session.ackSourceSeq) || session.ackSourceSeq < 0) session.ackSourceSeq = 0;
    session.seen = Array.isArray(session.seen) ? session.seen.filter(seq => Number.isInteger(seq) && seq > 0) : [];
    if (!Array.isArray(session.declaredGaps)) {
      session.declaredGaps = run.coverage.gaps
        .filter(gap => gap.sourceSessionId === sourceSessionId && gap.reason !== 'not_observed'
          && Number.isInteger(gap.from) && Number.isInteger(gap.to) && gap.to >= gap.from)
        .map(gap => ({ from: gap.from, to: gap.to }));
    }
    run.manifest.sourceSessions[sourceSessionId] = session;
    return session;
  }

  function advanceAck(session) {
    const seen = new Set(session.seen);
    while (true) {
      const next = session.ackSourceSeq + 1;
      if (seen.has(next)) {
        session.ackSourceSeq = next;
        seen.delete(next);
        continue;
      }
      const covering = session.declaredGaps.find(gap => next >= gap.from && next <= gap.to);
      if (!covering) break;
      session.ackSourceSeq = covering.to;
    }
    session.seen = [...seen].filter(seq => seq > session.ackSourceSeq).sort((a, b) => a - b);
  }

  function clearFilledUnobserved(run, sourceSessionId, ackSourceSeq) {
    run.coverage.gaps = run.coverage.gaps.filter(gap => {
      if (gap.reason !== 'not_observed' || gap.sourceSessionId !== sourceSessionId) return true;
      return gap.to > ackSourceSeq;
    });
  }

  function declareGap(run, fact) {
    if (fact.eventType !== 'capture.gap_detected') return false;
    const from = fact.payload.fromSourceSeq;
    const to = fact.payload.toSourceSeq;
    const reason = fact.payload.reason;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) return false;
    if (typeof reason !== 'string' || reason.length === 0 || reason === 'not_observed') return false;
    const session = ensureSession(run, fact.sourceSessionId);
    const ackBefore = session.ackSourceSeq;
    const sessionMatch = session.declaredGaps.find(gap => rangesOverlapOrTouch(gap, from, to));
    let changed = false;
    if (sessionMatch) {
      const nextFrom = Math.min(sessionMatch.from, from);
      const nextTo = Math.max(sessionMatch.to, to);
      changed = nextFrom !== sessionMatch.from || nextTo !== sessionMatch.to;
      sessionMatch.from = nextFrom;
      sessionMatch.to = nextTo;
    } else {
      session.declaredGaps.push({ from, to });
      changed = true;
    }
    const coverageMatch = run.coverage.gaps.find(gap => gap.sourceSessionId === fact.sourceSessionId
      && gap.reason === reason && rangesOverlapOrTouch(gap, from, to));
    if (coverageMatch) {
      const nextFrom = Math.min(coverageMatch.from, from);
      const nextTo = Math.max(coverageMatch.to, to);
      if (nextFrom !== coverageMatch.from || nextTo !== coverageMatch.to) changed = true;
      coverageMatch.from = nextFrom;
      coverageMatch.to = nextTo;
    } else {
      run.coverage.gaps.push({ sourceSessionId: fact.sourceSessionId, from, to, reason });
      changed = true;
    }
    if (changed) {
      run.coverage.health.push({
        at: now(),
        type: 'gap_detected',
        reason,
        sourceSessionId: fact.sourceSessionId,
        from,
        to
      });
    }
    advanceAck(session);
    clearFilledUnobserved(run, fact.sourceSessionId, session.ackSourceSeq);
    return changed || session.ackSourceSeq !== ackBefore;
  }

  function updateSourceProgress(run, fact) {
    const session = ensureSession(run, fact.sourceSessionId);
    declareGap(run, fact);
    session.seen.push(fact.sourceSeq);
    advanceAck(session);
    clearFilledUnobserved(run, fact.sourceSessionId, session.ackSourceSeq);
    return session.ackSourceSeq;
  }

  function updateCoverage(run, fact) {
    const family = factFamily(fact.eventType);
    const entry = run.coverage.families[family] || {
      state: 'available',
      firstSourceSeq: fact.sourceSeq,
      lastSourceSeq: fact.sourceSeq,
      observationMethods: [],
      eventCount: 0
    };
    entry.firstSourceSeq = Math.min(entry.firstSourceSeq ?? fact.sourceSeq, fact.sourceSeq);
    entry.lastSourceSeq = Math.max(entry.lastSourceSeq ?? fact.sourceSeq, fact.sourceSeq);
    entry.eventCount = (entry.eventCount || 0) + 1;
    entry.observationMethods ||= [];
    if (!entry.observationMethods.includes(fact.quality.observationMethod)) {
      entry.observationMethods.push(fact.quality.observationMethod);
    }
    run.coverage.families[family] = entry;
    if (fact.eventType === 'capture.capability_reported') {
      for (const [capability, report] of Object.entries(fact.payload.capabilities)) {
        run.coverage.families[capability] = {
          ...(run.coverage.families[capability] || {}),
          state: report.state,
          reason: report.reason || null,
          reportedAt: fact.occurredAt
        };
      }
    }
  }

  function combatFile(run, combatId, generation) {
    return path.join(run.paths.combats, `${safeId(combatId)}-g${generation}.jsonl`);
  }

  function appendCombatFact(run, stored, appended, deferredDeletes) {
    const combat = run.manifest.combats[stored.combatId] || {};
    const generation = stored.attemptGeneration;
    if (stored.eventType === 'combat.attempt_replaced') {
      combat.pendingGeneration = generation;
      run.livePending.set(stored.combatId, generation);
      const pendingPath = combatFile(run, stored.combatId, generation);
      fs.mkdirSync(run.paths.combats, { recursive: true });
      fs.writeFileSync(pendingPath, '');
    } else if (combat.activeGeneration !== generation && combat.pendingGeneration !== generation) {
      combat.pendingGeneration = generation;
      run.livePending.set(stored.combatId, generation);
    }
    trackAppend(appended, combatFile(run, stored.combatId, generation), stored);
    if (stored.eventType === 'combat.ended') {
      const previous = combat.activeGeneration;
      combat.activeGeneration = generation;
      delete combat.pendingGeneration;
      run.livePending.delete(stored.combatId);
      if (previous !== undefined && previous !== generation) {
        deferredDeletes.push(combatFile(run, stored.combatId, previous));
      }
      const currentName = path.basename(combatFile(run, stored.combatId, generation));
      for (const name of fs.existsSync(run.paths.combats) ? fs.readdirSync(run.paths.combats) : []) {
        const prefix = `${safeId(stored.combatId)}-g`;
        if (name.startsWith(prefix) && name !== currentName) {
          deferredDeletes.push(path.join(run.paths.combats, name));
        }
      }
    }
    run.manifest.combats[stored.combatId] = combat;
  }

  function ingest(fact, { replay = false } = {}) {
    const validation = validateFactEvent(fact);
    if (!validation.ok) return { accepted: false, durable: false, reason: validation.reason };
    let run = null;
    let snapshot = null;
    const appended = [];
    try {
      run = loadRun(fact.runId);
      persistRecoveryIfNeeded(run);
      if (run.eventIds.has(fact.eventId)) {
        const session = ensureSession(run, fact.sourceSessionId);
        if (fact.eventType !== 'capture.gap_detected') {
          return { accepted: true, durable: true, duplicate: true, ackSourceSeq: session.ackSourceSeq };
        }
        snapshot = cloneRunState(run);
        const changed = declareGap(run, fact);
        if (!changed) {
          return { accepted: true, durable: true, duplicate: true, ackSourceSeq: session.ackSourceSeq };
        }
        commitDurable(run, snapshot);
        return {
          accepted: true,
          durable: true,
          duplicate: true,
          ackSourceSeq: run.manifest.sourceSessions[fact.sourceSessionId].ackSourceSeq
        };
      }
      snapshot = cloneRunState(run);
      const stored = { ...fact, receivedAt: now(), ingestSeq: run.eventIds.size + 1, replay: Boolean(replay) };
      const deferredDeletes = [];
      if (stored.combatId) appendCombatFact(run, stored, appended, deferredDeletes);
      else trackAppend(appended, run.paths.events, stored);
      run.eventIds.add(stored.eventId);
      run.manifest.replay = run.manifest.replay || Boolean(replay);
      const ackSourceSeq = updateSourceProgress(run, stored);
      updateCoverage(run, stored);
      commitDurable(run, snapshot);
      for (const filePath of deferredDeletes) {
        try {
          if (fs.existsSync(filePath)) fs.rmSync(filePath);
        } catch {
          // The new attempt is already durable. Leftover files are not a second attempt.
        }
      }
      return { accepted: true, durable: true, duplicate: false, ackSourceSeq };
    } catch (error) {
      rollbackAppended(appended);
      if (run && snapshot) restoreRunState(run, snapshot);
      if (run) {
        try {
          run.coverage.health.push({
            at: now(),
            type: 'write_failed',
            message: String(error && error.message ? error.message : error)
          });
          atomicWriteJson(run.paths.coverage, run.coverage);
        } catch {
          // Failure to record health must not escape or block the caller.
        }
      }
      return { accepted: false, durable: false, reason: 'write_failed' };
    }
  }

  function appendSnapshot(runId, snapshot) {
    const run = loadRun(runId);
    if (!snapshot || snapshot.schema !== 'gamebuddy.recap-snapshot.v1'
      || snapshot.runId !== runId || typeof snapshot.snapshotId !== 'string'
      || !snapshot.snapshotId) throw new Error('invalid recap snapshot');
    appendJsonl(run.paths.snapshots, snapshot);
  }

  function getSnapshots(runId) {
    const run = loadRun(runId);
    return readFileWithHealth(run, run.paths.snapshots);
  }

  function readFileWithHealth(run, filePath) {
    const result = readJsonlRecover(filePath);
    if (result.recovered) {
      run.coverage.health.push({ at: now(), type: 'recovered_corrupt_tail', file: path.basename(filePath) });
      persistMetadata(run);
    }
    return result.rows;
  }

  function getEffectiveFacts(runId) {
    const run = loadRun(runId);
    try {
      persistRecoveryIfNeeded(run);
    } catch {
      // Reading the in-memory attempt pointer must continue when recovery metadata cannot be saved.
    }
    const facts = readFileWithHealth(run, run.paths.events);
    for (const [combatId, combat] of Object.entries(run.manifest.combats)) {
      const live = run.livePending.get(combatId);
      const generation = live ?? combat.activeGeneration;
      if (generation === undefined || generation === null) continue;
      facts.push(...readFileWithHealth(run, combatFile(run, combatId, generation)));
    }
    return facts.sort((a, b) => a.occurredAt - b.occurredAt || a.sourceSeq - b.sourceSeq);
  }

  function getCoverage(runId) {
    return JSON.parse(JSON.stringify(loadRun(runId).coverage));
  }

  function rebuildIndex() {
    const entries = [];
    for (const name of fs.readdirSync(runsDir)) {
      const manifest = readJson(path.join(runsDir, name, 'manifest.json'), null);
      if (!manifest || manifest.schema !== MANIFEST_SCHEMA) continue;
      entries.push({
        runId: manifest.runId,
        updatedAt: manifest.updatedAt,
        replay: Boolean(manifest.replay),
        directory: name
      });
    }
    entries.sort((a, b) => b.updatedAt - a.updatedAt);
    const index = { schema: INDEX_SCHEMA, rebuiltAt: now(), runs: entries };
    atomicWriteJson(indexPath, index);
    return index;
  }

  function clearAll() {
    cache.clear();
    fs.rmSync(runsDir, { recursive: true, force: true });
    fs.mkdirSync(runsDir, { recursive: true });
    rebuildIndex();
  }

  return {
    appendSnapshot,
    clearAll,
    flush: () => {},
    getCoverage,
    getEffectiveFacts,
    getSnapshots,
    ingest,
    rebuildIndex,
    rootDir
  };
}

module.exports = {
  COVERAGE_SCHEMA,
  INDEX_SCHEMA,
  MANIFEST_SCHEMA,
  createLocalFactStore,
  factFamily
};
