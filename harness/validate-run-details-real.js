'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { buildRunDetails } = require('../review/run-details');
const value = (flag, fallback) => { const index = process.argv.indexOf(flag); return index < 0 ? fallback : process.argv[index + 1]; };
const inputDir = value('--input-dir', path.join(__dirname, '..', '.runtime', 'recap-real', 'inputs'));
const sourceRoot = value('--source-root', path.join(os.homedir(), 'Library', 'Application Support', 'gamebuddy'));
const historyPath = value('--history', path.join(sourceRoot, 'review-history.v2.json'));
const outputDir = value('--output', path.join(__dirname, '..', '.runtime', 'run-details'));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const manifest = read(path.join(inputDir, 'manifest.json')), history = read(historyPath);
function sourceHashes() {
  return manifest.originalFiles.map(entry => { const bytes = fs.readFileSync(path.join(sourceRoot, entry.file));
    return { file: entry.file, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }; });
}
const before = sourceHashes(); assert.deepEqual(before, manifest.originalFiles, 'Original source files must match the prepared baseline');
assert.equal(manifest.cases.length, 4);
const cases = manifest.cases.map(entry => {
  const input = read(path.join(inputDir, `${entry.id}.json`)), run = history.runs.find(r => r.runId === entry.id);
  assert.equal(input.synthetic, false); assert.equal(run.result, 'loss'); assert.ok(input.facts.some(f => f.eventType === 'run.ended'));
  const details = buildRunDetails(run, input.facts), floors = details.acts.flatMap(a => a.floors);
  assert.ok(floors.length); assert.equal(new Set(floors.map(f => f.key)).size, floors.length);
  assert.equal(details.deck.reduce((n, c) => n + c.count, 0), run.finalState.deck.length);
  assert.equal(details.summary.hp, run.finalState.hp); assert.equal(details.summary.gold, run.finalState.gold);
  assert.ok(floors.every(f => f.combats.every(c => c.turns === null)), 'Legacy empty turn payloads must not become invented counts');
  fs.mkdirSync(outputDir, { recursive: true }); fs.writeFileSync(path.join(outputDir, `${entry.id}.json`), JSON.stringify(details, null, 2));
  return { runId: entry.id, facts: input.facts.length, floors: floors.length, combats: floors.reduce((n, f) => n + f.combats.length, 0),
    choices: floors.reduce((n, f) => n + f.rows.filter(r => ['选牌', '火堆', '购买'].includes(r.label)).length, 0),
    deckSize: details.deck.reduce((n, c) => n + c.count, 0), summary: details.summary };
});
const after = sourceHashes(); assert.deepEqual(after, before);
const report = { cases, originalFileCount: after.length, originalSourcesUnchanged: true, remoteModelCalls: 0, databaseAccess: false };
fs.writeFileSync(path.join(outputDir, 'verification.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
