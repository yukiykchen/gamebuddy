const test = require('node:test');
const assert = require('node:assert/strict');
const { makeTimeline } = require('./facts');
const { candidateDiagnostics } = require('./stories');
const { assessStoryQuality } = require('./editorial');
const facts = [{ eventId: 'e', eventType: 'run.observed', runId: 'r', sourceSessionId: 's', sourceSeq: 1,
  payload: { hp: 28, maxHp: 80, totalFloor: 17, combat: { enemies: [{ hp: 1, name: '灵魂异鱼' }], turn: 10 } } }];
const t = makeTimeline('r', facts);
const candidate = { title: '1血异鱼与28血的我', bodyTemplate: '灵魂异鱼只剩{{enemy}}血，你还剩{{hp}}血，双方都在等最后一击。',
  evidenceIds: ['unknown_optional_reference'], bindings: { enemy: { claimIndex: 0 }, hp: { claimIndex: 1 } },
  assertions: [{ type: 'event_field', eventId: 'e', field: 'combat.enemies.0.hp', value: 1 },
    { type: 'event_field', eventId: 'e', field: 'hp', value: 28 }, { type: 'entity_name', subjectId: 'unknown', value: '灵魂异鱼' }] };
const review = (score, wordingOk = true) => async () => ({ reviews: [{ index: 0, score, wordingOk, reason: '具体血线对峙' }] });
test('supported numbers and good story survive missing name lookup and optional reference', async () => {
  assert.equal((await assessStoryQuality(t, [candidate], review(2)))[0].accepted, true);
});
test('ordinary story and poor wording cannot pass even with correct numbers', async () => {
  assert.equal((await assessStoryQuality(t, [candidate], review(1)))[0].reason, 'insufficient_interest');
  assert.equal((await assessStoryQuality(t, [candidate], review(3, false)))[0].reason, 'wording_needs_revision');
});
test('absent or duplicate judge verdicts cannot silently approve cards', async () => {
  assert.equal((await assessStoryQuality(t, [candidate], async () => ({})))[0].accepted, false);
  const v = { index: 0, score: 3, wordingOk: true, reason: '对峙' };
  assert.equal((await assessStoryQuality(t, [candidate], async () => ({ reviews: [v, v] })))[0].accepted, false);
});
test('wrong numeric claim and absolute value presented as gain fail before judging', async () => {
  const wrong = { ...candidate, assertions: candidate.assertions.map((c, i) => i === 1 ? { ...c, value: 29 } : c) };
  assert.equal(candidateDiagnostics(t, [wrong])[0].accepted, false);
  const delta = { ...candidate, title: '涨上限', bodyTemplate: '上限增加{{n}}', bindings: { n: { claimIndex: 0 } }, assertions: [{ type: 'event_field', eventId: 'e', field: 'maxHp', value: 80 }] };
  assert.equal(candidateDiagnostics(t, [delta])[0].reason, 'absolute_value_used_as_delta');
});
test('length and machine wording trigger repair, without requiring identity lookup', async () => {
  assert.equal(candidateDiagnostics(t, [{ ...candidate, title: '长'.repeat(17) }])[0].accepted, false);
  assert.equal(candidateDiagnostics(t, [{ ...candidate, bodyTemplate: '长'.repeat(81) }])[0].accepted, false);
  assert.equal(candidateDiagnostics(t, [{ ...candidate, bodyTemplate: '它准备StatusIntent' }])[0].reason, 'unreadable_wording');
});

test('partial health must not be called full health', () => {
  const partial = { ...candidate, title: '先回满血', bodyTemplate: '现在{{hp}}/{{max}}',
    evidenceIds: ['e'], bindings: { hp: { claimIndex: 0 }, max: { claimIndex: 1 } },
    assertions: [{ type: 'event_field', eventId: 'e', field: 'hp', value: 28 },
      { type: 'event_field', eventId: 'e', field: 'maxHp', value: 80 }] };
  assert.equal(candidateDiagnostics(t, [partial])[0].reason, 'full_health_does_not_match_numbers');
});

test('chapter labels can use the run overview without duplicating card references', () => {
  const withAct = makeTimeline('r', [...facts, { eventId: 'act2', eventType: 'run.observed', runId: 'r', sourceSessionId: 's', sourceSeq: 2, payload: { act: 2, totalFloor: 18 } }]);
  assert.equal(candidateDiagnostics(withAct, [{ ...candidate, bodyTemplate: candidate.bodyTemplate + '随后进入第二幕。' }])[0].accepted, true);
});
