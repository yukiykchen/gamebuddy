// Offline by default. --mode=model explicitly runs the configured model on the input logs.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { makeTimeline, fixedMetrics } = require('../review/recap/facts');
const { selectStories, storyKeys } = require('../review/recap/stories');
const { buildRecap, PROMPT_VERSION, TOOL_VERSION } = require('../review/recap/runner');
const { knowledgeRevision } = require('../review/recap/versions');
const { validateFactEvent } = require('./fact-protocol');
const { createOpenAiClient, readLlmConfig } = require('../agent/llm/openai');
const arg = (name, fallback) => process.argv.find(v => v.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
async function run() {
  const mode = arg('mode', 'local');
  if (!['local', 'model'].includes(mode)) throw Error('mode must be local or model');
  const directory = path.resolve(arg('input', path.join(__dirname, 'fixtures/recap-evals')));
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json')));
  const oracleFile = path.join(directory, 'metric-oracles.json');
  const oracles = fs.existsSync(oracleFile) ? JSON.parse(fs.readFileSync(oracleFile)).values : {};
  const config = mode === 'model' ? readLlmConfig() : null;
  if (mode === 'model' && !config.enabled) throw Error('Model mode requires an existing configured API key');
  const llm = config ? createOpenAiClient({ ...config, thinking: 'disabled', temperature: 0.1, stream: false, maxTokens: 3500 }, { timeoutMs: 90000 }) : null;
  const cases = [];
  const requested = arg('cases', '').split(',').filter(Boolean);
  if (requested.some(id => !manifest.cases.some(row => row.id === id))) throw Error('Unknown case id');
  for (const row of manifest.cases.filter(row => !requested.length || requested.includes(row.id))) {
    const bytes = fs.readFileSync(path.join(directory, `${row.id}.json`));
    const input = JSON.parse(bytes), started = performance.now();
    const t = makeTimeline(input.runId, input.facts, input.coverage, input.snapshots || []);
    const metrics = fixedMetrics(t), expected = oracles[row.id];
    const predicate = input.expected?.candidate ? selectStories(t, [input.expected.candidate]).length > 0 : null;
    const recap = await buildRecap({ ...input, llm });
    const text = recap.cards.map(c => `${c.title}${c.body}`).join('') + recap.closing;
    const checks = {
      validEvents: input.facts.every(f => validateFactEvent(f).ok),
      metricsExact: expected ? JSON.stringify(metrics.map(m => m.value)) === JSON.stringify(expected) : null,
      labeledCandidateGate: predicate === null ? null : predicate === input.expected.allowed,
      fixedSlots: metrics.length === 4 && metrics.map(m => m.id).join() === 'turn_damage,lethal_hit,absorbed,reloads',
      lengths: recap.cards.length <= 3 && recap.cards.every(c => [...c.title].length <= 10 && [...c.body].length <= 40) && [...recap.closing].length <= 40,
      forbiddenConclusions: !(input.expected?.forbidden || []).some(phrase => text.includes(phrase)),
      distinctEvidence: new Set(recap.cards.flatMap(c => storyKeys(t, c))).size === recap.cards.flatMap(c => storyKeys(t, c)).length
    };
    cases.push({ id: row.id, runId: input.runId, synthetic: input.synthetic === true,
      inputHash: crypto.createHash('sha256').update(bytes).digest('hex'), factsRevision: t.revision,
      elapsedMs: Math.round(performance.now() - started), checks, fixedMetrics: metrics,
      status: recap.status, cards: recap.cards, closing: recap.closing,
      calls: recap.trace.filter(r => ['model', 'validation', 'closing'].includes(r.phase)).length,
      toolReads: recap.trace.filter(r => r.phase === 'tool').length,
      providerUsage: recap.trace.filter(r => r.phase === 'usage'), cost: null,
      renderedCharacters: [...text].length, targetLength: [...text].length >= 120 && [...text].length <= 220,
      humanReview: { factualSemantics: null, importantMoments: null, missedMoments: null, falseBlame: null, interest1to5: null, notes: '' },
      trace: recap.trace });
  }
  const failureCases = cases.filter(c => Object.values(c.checks).includes(false));
  const report = { schema: 'gamebuddy.recap-evaluation.v1', generatedAt: new Date().toISOString(), mode,
    promptVersion: PROMPT_VERSION, toolVersion: TOOL_VERSION, knowledgeRevision: knowledgeRevision(), model: config?.model || null,
    budget: { maxReads: 10, investigationRounds: 5, maxMs: 90000 },
    summary: { cases: cases.length, hardCheckFailures: failureCases.map(c => c.id),
      modelEvaluated: mode === 'model', humanReviewed: false, allSynthetic: cases.every(c => c.synthetic) },
    limitations: ['自动检查不证明文案所有语义成立', '120–220字为观察目标，证据少允许更短', '趣味、重要片段命中与失误误判须独立人工填写', '不将合成样本当作真实游戏验收'], cases };
  const output = path.resolve(arg('output', path.join('.runtime', 'recap-evals', `recap-eval-${mode}.json`)));
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, ...report.summary }));
  if (failureCases.length) process.exitCode = 1;
  return report;
}
if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { run };
