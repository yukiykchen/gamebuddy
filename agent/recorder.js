const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(process.cwd(), 'runs');

function appendJsonl(filePath, row) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(row)}\n`);
}

function runDirectory(seed = null, now = Date.now()) {
  const id = seed || new Date(now).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return path.join(ROOT, id);
}

function recordDecision({ runId, observation, decision, accepted = null, now = Date.now() }) {
  const row = {
    schema: 'runmate.decision_log.v1',
    timestamp: now,
    runId,
    observationSignature: observation?.schema,
    validFor: decision.validFor,
    agent: decision.agent,
    source: decision.source,
    status: decision.status,
    title: decision.title,
    summary: decision.summary,
    payload: decision.payload,
    accepted
  };
  appendJsonl(path.join(ROOT, runId, 'decisions.jsonl'), row);
  return row;
}

module.exports = { runDirectory, recordDecision, appendJsonl };
