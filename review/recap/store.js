const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { makeTimeline } = require('./facts');
const { buildRecap } = require('./runner');
const { battleMetrics, recapFixedMetrics, runSummary } = require('./presentation');

const PUBLICATION_SCHEMA = 'gamebuddy.recap-publication.v1';
const filename = runId => `${crypto.createHash('sha256').update(runId).digest('hex')}.json`;
const isFinal = recap => recap?.status === 'ready' && Array.isArray(recap.cards);

function readPublishedRecap(file, runId) {
  try {
    const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (entry.schema !== PUBLICATION_SCHEMA || entry.runId !== runId || !isFinal(entry.recap)) {
      throw new Error('Invalid published recap');
    }
    return entry.recap;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function savePublishedRecap(directory, recap) {
  if (!isFinal(recap) || typeof recap.runId !== 'string' || !recap.runId) throw new TypeError('Expected a final recap with a run ID');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, filename(recap.runId));
  const existing = readPublishedRecap(file, recap.runId);
  if (existing) return existing;
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  const entry = { schema: PUBLICATION_SCHEMA, runId: recap.runId, publishedAt: new Date().toISOString(), recap };
  try {
    fs.writeFileSync(temporary, JSON.stringify(entry), { flag: 'wx', flush: true });
    // Publish atomically without replacing another writer's completed recap.
    fs.linkSync(temporary, file);
    return recap;
  } catch (error) {
    if (error.code === 'EEXIST') return readPublishedRecap(file, recap.runId);
    throw error;
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function migrateLegacyRecaps(directory, legacyDirectory) {
  if (!legacyDirectory || !fs.existsSync(legacyDirectory)) return;
  for (const name of fs.readdirSync(legacyDirectory)) {
    if (!/^[0-9a-f]{64}\.json$/.test(name) || fs.existsSync(path.join(directory, name))) continue;
    let recap;
    try { ({ recap } = JSON.parse(fs.readFileSync(path.join(legacyDirectory, name), 'utf8'))); }
    catch { continue; }
    if (isFinal(recap) && typeof recap.runId === 'string' && filename(recap.runId) === name) {
      savePublishedRecap(directory, recap);
    }
  }
}

function createRecapStore({ directory, legacyDirectory, factStore, llmFactory }) {
  const pending = new Map();
  let epoch = 0;
  fs.mkdirSync(directory, { recursive: true });
  migrateLegacyRecaps(directory, legacyDirectory);

  function readFacts(runId) {
    return { facts: factStore.getEffectiveFacts(runId), coverage: factStore.getCoverage(runId), snapshots: factStore.getSnapshots(runId) };
  }

  async function get(runId, run = {}) {
    if (pending.has(runId)) return pending.get(runId).job;
    const published = readPublishedRecap(path.join(directory, filename(runId)), runId);
    if (published) {
      try {
        const { facts, coverage, snapshots } = readFacts(runId);
        if (facts.length === 0) return published;
        const timeline = makeTimeline(runId, facts, coverage, snapshots);
        return { ...published, fixedMetrics: recapFixedMetrics(timeline, run), battleMetrics: battleMetrics(timeline, run),
          runSummary: runSummary(timeline, run) };
      } catch {
        return published;
      }
    }

    const input = readFacts(runId);
    const startedEpoch = epoch;
    const controller = new AbortController();
    const job = (async () => {
      const recap = await buildRecap({ runId, ...input, run, llm: llmFactory(), signal: controller.signal });
      if (startedEpoch !== epoch || controller.signal.aborted) return { ...recap, status: 'stale', cards: [], portrait: '', closing: '' };
      return isFinal(recap) ? savePublishedRecap(directory, recap) : recap;
    })();
    pending.set(runId, { job, controller });
    try { return await job; } finally { if (pending.get(runId)?.job === job) pending.delete(runId); }
  }

  function clear() {
    epoch++;
    for (const task of pending.values()) task.controller.abort();
    pending.clear();
    fs.rmSync(directory, { recursive: true, force: true });
    if (legacyDirectory) fs.rmSync(legacyDirectory, { recursive: true, force: true });
    fs.mkdirSync(directory, { recursive: true });
  }

  return { get, clear };
}

module.exports = { createRecapStore, savePublishedRecap };
