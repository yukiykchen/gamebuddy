const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateFactEvent } = require('../../harness/fact-protocol');
const { makeTimeline, fixedMetrics } = require('./facts');
const { selectStories } = require('./stories');
const { createTools } = require('./tools');
const { buildRecap } = require('./runner');

const directory = path.join(__dirname, '../../harness/fixtures/recap-evals');
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));

test('recap voice is a natural game partner rather than a battlefield reporter', () => {
  const source = fs.readFileSync(path.join(__dirname, 'runner.js'), 'utf8');
  assert.match(source, /复盘搭子/);
  assert.doesNotMatch(source, /战地记者/);
});

for (const row of manifest.cases) {
  test(`synthetic ${row.id}: validates evidence and outcome`, () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(directory, `${row.id}.json`), 'utf8'));
    assert.equal(fixture.synthetic, true);
    assert.ok(fixture.facts.length > 100);
    assert.equal(fixture.facts.length, row.eventCount);
    assert.ok(fixture.facts.every(fact => validateFactEvent(fact).ok));
    const timeline = makeTimeline(fixture.runId, fixture.facts, fixture.coverage);
    const cards = selectStories(timeline, [fixture.expected.candidate]);
    assert.equal(cards.length === 1, fixture.expected.allowed);
    const metrics = fixedMetrics(timeline);
    assert.deepEqual(metrics.map(metric => metric.label), [
      '最高回合实际爆发', '最高斩杀', '实际抗伤', 'SL次数'
    ]);
    if (row.id.includes('reload')) assert.equal(metrics[3].value, 2);
    if (row.id === 'capture-gap') assert.equal(metrics[0].display, '未记录');
    if (row.id === 'requested-not-resolved') assert.equal(metrics[1].display, '未记录');
    if (row.id === 'block-gain-vs-absorb') assert.equal(metrics[2].value, 16);
    assert.ok(cards.every(card => fixture.expected.forbidden.every(text =>
      !card.body.includes(text) && !card.title.includes(text))));
    const tools = createTools(timeline);
    const first = tools.call('get_run_overview');
    assert.equal(first.runId, fixture.runId);
    assert.ok(first.data.combatCount >= 5);
  });
}

test('the model can investigate and retain a valid story while dropping a fabricated event', async () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(directory, 'upgrade-never-drawn.json'), 'utf8'));
  let rounds = 0;
  const llm = { enabled: true, completeRecapTurn: async input => {
    if (input.stage === 'interest_review') return { reviews: [{ index: 0, score: 2, reason: '升级后整场没上手' }] };
    if (input.stage === 'closing') return { portrait: '', closing: '升级刚落锤，下一战却没等到它上手。' };
    rounds++;
    return rounds === 1
      ? { tool_calls: [{ name: 'find_events', args: { eventTypes: ['rest.action_completed'] } }] }
      : { candidates: [{ ...fixture.expected.candidate, interest: 'contrast' },
        { pattern: 'upgrade_not_used', eventId: 'fabricated-event' }] };
  } };
  const recap = await buildRecap({ runId: fixture.runId, facts: fixture.facts,
    coverage: fixture.coverage, llm });
  assert.equal(recap.cards.length, 1);
  assert.equal(recap.status, 'ready');
  assert.ok(recap.trace.some(row => row.name === 'find_events'));
});
