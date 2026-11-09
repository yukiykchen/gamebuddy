const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { makeTimeline } = require('./facts');
const { buildRecap, PROMPT_VERSION, TOOL_VERSION } = require('./runner');
const { knowledgeRevision } = require('./versions');
const { runSummary } = require('./presentation');
function createRecapStore({ directory, factStore, llmFactory }) {
  const pending = new Map(); let epoch = 0;
  fs.mkdirSync(directory, { recursive: true });
  async function get(runId, run = {}) {
    const startedEpoch = epoch;
    const facts = factStore.getEffectiveFacts(runId), coverage = factStore.getCoverage(runId), snapshots = factStore.getSnapshots(runId);
    const timeline = makeTimeline(runId, facts, coverage, snapshots), llm = llmFactory();
    const summaryRevision = crypto.createHash('sha256').update(JSON.stringify(runSummary(timeline, run))).digest('hex').slice(0, 16);
    const version = `${timeline.revision}:${summaryRevision}:${PROMPT_VERSION}:${TOOL_VERSION}:${knowledgeRevision()}:${llm?.cacheKey || 'no-model'}`;
    const file = path.join(directory, `${crypto.createHash('sha256').update(runId).digest('hex')}.json`);
    try { const cached = JSON.parse(fs.readFileSync(file, 'utf8')); if (cached.version === version) return cached.recap; } catch { /* Rebuild missing or invalid cache. */ }
    const taskKey = `${runId}:${version}`;
    if (pending.has(taskKey)) return pending.get(taskKey).job;
    for (const [key, task] of pending) if (task.runId === runId && key !== taskKey) { task.controller.abort(); pending.delete(key); }
    const controller = new AbortController();
    const job = (async () => {
      const recap = await buildRecap({ runId, facts, coverage, snapshots, run, llm, signal: controller.signal });
      // Do not read from a cleared fact store: reading can recreate a deleted run directory.
      if (startedEpoch !== epoch || controller.signal.aborted) return { ...recap, status: 'stale', cards: [], closing: '' };
      const latest = makeTimeline(runId, factStore.getEffectiveFacts(runId), factStore.getCoverage(runId), factStore.getSnapshots(runId)).revision;
      if (latest !== timeline.revision) return { ...recap, status: 'stale', cards: [], closing: '' };
      if (!['retryable', 'cancelled'].includes(recap.status)) {
        const temporary = `${file}.${crypto.randomUUID()}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify({ version, recap })); fs.renameSync(temporary, file);
      }
      return recap;
    })();
    pending.set(taskKey, { job, controller, runId });
    try { return await job; } finally { if (pending.get(taskKey)?.job === job) pending.delete(taskKey); }
  }
  function clear() {
    epoch++;
    for (const task of pending.values()) task.controller.abort();
    pending.clear(); fs.rmSync(directory, { recursive: true, force: true }); fs.mkdirSync(directory, { recursive: true });
  }
  return { get, clear };
}
module.exports = { createRecapStore };
