const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { makeTimeline, fixedMetrics, inspectSubject } = require('./facts');
const { selectStories } = require('./stories');
const { createTools } = require('./tools');
const { buildRecap } = require('./runner');
const { createRecapStore } = require('./store');
const base = () => JSON.parse(fs.readFileSync(path.join(__dirname, '../../harness/fixtures/recap-evals/upgrade-never-drawn.json')));
const clone = value => structuredClone(value);
const timeline = f => makeTimeline(f.runId, f.facts, f.coverage, f.snapshots || []);
function insert(f, eventType, payload) {
  const i = f.facts.findIndex(e => e.combatId === 'elite-bygone-effigy' && e.eventType === 'combat.ended');
  const event = { ...clone(f.facts[i]), eventId: `added-${f.facts.length}`, eventType, payload };
  f.facts.splice(i, 0, event); f.facts.forEach((e, i) => { e.sourceSeq = i + 1; }); return event;
}

test('source ordering is stable with a mixture of legacy and newly ingested facts', () => {
  const f = base(); f.facts[1].ingestSeq = 2; f.facts[1].receivedAt = Date.now();
  assert.deepEqual(timeline(f).facts.map(e => e.sourceSeq), f.facts.map(e => e.sourceSeq));
});
test('returning a card to hand prevents a never-entered-hand story', () => {
  const f = base(); insert(f, 'card.moved', { cardId: 'BASH', cardInstanceId: 'deck-bash', toPile: 'Hand', fromPile: 'Discard' });
  assert.equal(inspectSubject(timeline(f), 'deck-bash', 'elite-bygone-effigy').neverEnteredHand, false);
  assert.deepEqual(selectStories(timeline(f), [f.expected.candidate]), []);
});
test('an ambiguous same-model play prevents zero-use proof', () => {
  const f = base(); const play = f.facts.find(e => e.combatId === 'elite-bygone-effigy' && e.eventType === 'card.played');
  play.payload.cardInstanceId = null; play.payload.cardId = 'BASH';
  assert.equal(inspectSubject(timeline(f), 'deck-bash', 'elite-bygone-effigy').neverPlayed, false);
});
test('enemy-phase poison does not erase or inflate player-turn actual damage', () => {
  const f = base(), before = fixedMetrics(timeline(f))[0];
  insert(f, 'damage.resolved', { sourceSide: 'Player', targetSide: 'Enemy', turn: 2, side: 'Enemy', hpLoss: 9999, fatal: false });
  assert.deepEqual(fixedMetrics(timeline(f))[0], before);
});
test('unknown fields cannot be validated as known values', () => {
  const f = base(), e = f.facts.find(e => e.eventType === 'rest.action_completed');
  e.quality.unknownFields = ['payload.cardId'];
  const tools = createTools(timeline(f));
  const result = tools.call('check_claims', { claims: [{ type: 'event_field', eventId: e.eventId, field: 'cardId', value: e.payload.cardId }] });
  assert.equal(result.data.results[0].status, 'insufficient_evidence');
});
function candidate(f) {
  const e = f.facts.find(e => e.eventType === 'rest.action_completed');
  return { pattern: 'new_story_type', title: '这次升级', bodyTemplate: '{{card}}升级后，直到战斗结束也没打出。',
    evidenceIds: [e.eventId], assertions: [{ type: 'event_field', eventId: e.eventId, field: 'cardId', value: e.payload.cardId }, { type: 'zero_plays', subjectId: 'deck-bash', combatId: 'elite-bygone-effigy' }], bindings: { card: { claimIndex: 0 } } };
}
test('new grounded story types bind names before checking final length without truncation', () => {
  const f = base(), c = candidate(f);
  assert.equal(selectStories(timeline(f), [c])[0].body, '痛击升级后，直到战斗结束也没打出。');
  f.facts.find(e => e.eventType === 'rest.action_completed').payload.cardId = '很长的卡牌名字'.repeat(10);
  c.assertions[0].value = f.facts.find(e => e.eventType === 'rest.action_completed').payload.cardId;
  assert.deepEqual(selectStories(timeline(f), [c]), []);
});
test('counterfactual blame and raw numbers are rejected, ordinary battle completion is not a card', () => {
  const f = base(), c = candidate(f);
  assert.deepEqual(selectStories(timeline(f), [{ ...c, bodyTemplate: '本来可以赢。' }, { ...c, bodyTemplate: '这次造成999伤害。' },
    { pattern: 'combat_finished', eventId: f.facts.find(e => e.eventType === 'combat.ended').eventId }]), []);
});
test('decision-time query excludes the chosen outcome and future events', () => {
  const f = base(), e = f.facts.find(e => e.eventType === 'rest.action_completed');
  const result = createTools(timeline(f)).call('read_event_window', { anchorEventId: e.eventId, before: 0, after: 10, visibilityMode: 'decision-time', includeSnapshots: true });
  assert.equal(result.data.events.length, 1);
  assert.equal(result.data.events[0].payload, undefined);
});
test('multiple snapshots prove presence but never multiply the hand-entry count', () => {
  const f = base(); f.snapshots = [1, 2].map(n => ({ snapshotId: `s${n}`, runId: f.runId, combatId: 'elite-bygone-effigy', attemptGeneration: 0, hand: [{ combatCardInstanceId: 'deck-bash' }] }));
  const r = inspectSubject(timeline(f), 'deck-bash', 'elite-bygone-effigy');
  assert.equal(r.handEntryCount, 0); assert.equal(r.handObserved, true); assert.equal(r.neverEnteredHand, false);
});
test('the real HTTP adapter carries every prior result and full tool contracts into later turns', async t => {
  t.mock.method(console, 'log', () => {});
  const { createOpenAiClient } = require('../../agent/llm/openai');
  const f = base(), requests = [], c = candidate(f);
  const responses = [ { tool_calls: [{ name: 'find_events', args: { eventTypes: ['rest.action_completed'] } }] },
    { tool_calls: [{ name: 'inspect_subject', args: { subjectId: 'deck-bash', combatId: 'elite-bygone-effigy' } }] },
    { candidates: [c] }, { closing: '这次的选择，也留下了值得回味的一笔。' } ];
  const llm = createOpenAiClient({ enabled: true, apiKey: 'test-not-a-secret', baseURL: 'https://example.invalid/v1', model: 'mock', wireApi: 'chat' }, { fetchImpl: async (url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(responses.shift()) } }] }) };
  } });
  const recap = await buildRecap({ runId: f.runId, facts: f.facts, coverage: f.coverage, llm });
  assert.equal(recap.status, 'ready'); assert.equal(recap.cards.length, 1); assert.equal(requests.length, 4);
  const third = JSON.parse(requests[2].messages.find(m => m.role === 'user').content);
  assert.equal(third.history.length, 2); assert.equal(third.history[0].results[0].name, 'find_events');
  assert.ok(third.tools.every(t => t.parameters && t.description)); assert.ok(recap.closing);
});
test('temporary model failures retry, concurrent reads deduplicate, successful recaps cache', async t => {
  const f = base(), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'recap-regression-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let calls = 0, fail = true;
  const store = createRecapStore({ directory, factStore: { getEffectiveFacts: () => f.facts, getCoverage: () => f.coverage, getSnapshots: () => [] },
    llmFactory: () => ({ enabled: true, cacheKey: 'mock', completeRecapTurn: async input => {
      calls++; if (fail) throw Error('temporary'); return input.stage === 'closing' ? { closing: '选择之后，总有回响。' } : input.stage === 'validate' ? { verdicts: [{ index: 0, supported: true }] } : { candidates: [candidate(f)] };
    } }) });
  await Promise.all([store.get(f.runId), store.get(f.runId)]); assert.equal(calls, 1);
  fail = false; await store.get(f.runId); assert.equal(calls, 3);
  await store.get(f.runId); assert.equal(calls, 3);
});
test('clearing a pending generation aborts it without recreating deleted run data', async t => {
  const f = base(), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'recap-clear-')); let reads = 0, finish;
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = createRecapStore({ directory,
    factStore: { getEffectiveFacts: () => { reads++; return f.facts; }, getCoverage: () => f.coverage, getSnapshots: () => [] },
    llmFactory: () => ({ enabled: true, completeRecapTurn: () => new Promise(resolve => { finish = resolve; }) }) });
  const job = store.get(f.runId); store.clear(); finish({ candidates: [] });
  const recap = await job; assert.equal(recap.status, 'stale'); assert.equal(reads, 1); assert.deepEqual(fs.readdirSync(directory), []);
});

test('local preview discovers a late-run story after many ordinary damage events', () => {
  const f = base();
  const { localStories } = require('./stories');
  const cards = localStories(timeline(f));
  assert.ok(cards.some(c => c.pattern === 'upgrade_not_used'));
});
test('generated cards publish without a later semantic review', async () => {
  const f = base(), c = candidate(f); const stages = [];
  const recap = await buildRecap({ ...f, llm: { enabled: true, completeRecapTurn: async input => {
    stages.push(input.stage);
    if (input.stage === 'closing') return { closing: '这次选择留下了回响。' };
    return { candidates: [{ ...c, title: '普通经过' }, { ...c, title: '值得记住' }] };
  } } });
  assert.equal(recap.cards.length, 1); assert.equal(recap.cards[0].title, '普通经过');
  assert.deepEqual(stages, ['investigate', 'closing']);
});
test('fully observed no-damage player turns produce a known zero rather than unknown', () => {
  const f = base(); f.facts = f.facts.filter(e => e.eventType !== 'damage.resolved' || e.payload.sourceSide !== 'player');
  assert.equal(fixedMetrics(timeline(f))[0].value, 0);
});
test('an unobserved resumed session prevents complete-run and zero-use claims', () => {
  const f = base(); f.facts.push({ ...f.facts[0], eventId: 'resumed', sourceSessionId: 'new-session', sourceSeq: 1, occurredAt: 10000000, eventType: 'run.resumed' });
  assert.equal(fixedMetrics(timeline(f))[0].display, '未记录');
  assert.equal(inspectSubject(timeline(f), 'deck-bash', 'elite-bygone-effigy').neverPlayed, false);
});
test('overkill 9999 on 10 HP counts 10 actual burst and 9999 lethal hit', () => {
  const f = base(); f.facts = f.facts.filter(e => e.eventType !== 'damage.resolved');
  insert(f, 'damage.resolved', { sourceSide: 'Player', targetSide: 'Enemy', turn: 1, side: 'Player', hpLoss: 10,
    resolvedDamageBeforeHpCap: 9999, targetHpBefore: 10, fatal: true });
  const metrics = fixedMetrics(timeline(f)); assert.equal(metrics[0].value, 10); assert.equal(metrics[1].value, 9999);
});

test('numeric payload values marked unknown never become a record or overkill story', () => {
  const f = base(); const e = insert(f, 'damage.resolved', { sourceSide: 'Player', targetSide: 'Enemy', turn: 1, side: 'Player', hpLoss: 10,
    resolvedDamageBeforeHpCap: 9999, targetHpBefore: 10, fatal: true });
  e.quality.unknownFields = ['payload.resolvedDamageBeforeHpCap'];
  e.quality.unknownReasons = { 'payload.resolvedDamageBeforeHpCap': 'unsupported' };
  assert.equal(fixedMetrics(timeline(f))[1].display, '未记录');
  assert.deepEqual(selectStories(timeline(f), [{ pattern: 'overkill', eventId: e.eventId }]), []);
});
test('a play count cannot be bound as card hits or confirmed damage attribution', () => {
  const f = base(), e = f.facts.find(e => e.eventType === 'rest.action_completed');
  const c = { pattern: 'unverified_damage', title: '卡牌贡献', bodyTemplate: '{{card}}反复命中{{hits}}次，每次{{damage}}点。',
    bindings: { card: { claimIndex: 0 }, hits: { claimIndex: 1 }, damage: { claimIndex: 2 } }, evidenceIds: [e.eventId],
    assertions: [{ type: 'event_field', eventId: e.eventId, field: 'cardName', value: '痛击' },
      { type: 'subject_count', subjectId: 'deck-bash', combatId: 'elite-bygone-effigy', field: 'playCount', value: 0 },
      { type: 'event_field', eventId: e.eventId, field: 'upgraded', value: true }] };
  assert.deepEqual(selectStories(timeline(f), [c]), []);
});
test('a made-up object name cannot accompany an otherwise supported subject count', () => {
  const f = base(), c = candidate(f); c.bodyTemplate = '飞剑打击升级后没打出。'; c.bindings = {};
  assert.deepEqual(selectStories(timeline(f), [c]), []);
});
test('plain upgrade followed by defeat is background rather than an independent story', () => {
  const f = base(), e = f.facts.find(e => e.eventType === 'rest.action_completed');
  assert.deepEqual(selectStories(timeline(f), [{ pattern: 'background', title: '升级后失败', bodyTemplate: '升级后，下一战没能打赢。',
    evidenceIds: [e.eventId], assertions: [{ type: 'event_field', eventId: e.eventId, field: 'action', value: 'smith' }] }]), []);
});

test('a boolean cannot be rendered as a count and machine IDs never enter story prose', () => {
  const f = base(), c = candidate(f), e = f.facts.find(e => e.eventType === 'rest.action_completed');
  assert.deepEqual(selectStories(timeline(f), [{ ...c, bodyTemplate: '抽到{{n}}次。', bindings: { n: { claimIndex: 0 } },
    assertions: [{ type: 'event_field', eventId: e.eventId, field: 'upgraded', value: true }] }]), []);
  e.payload.cardId = 'INTERNAL_CARD_ID'; c.assertions[0].value = 'INTERNAL_CARD_ID';
  assert.deepEqual(selectStories(timeline(f), [c]), []);
});
test('the summary receives selected cards only and rejects unselected card names', async () => {
  const f = base(), c = candidate(f); let closingInput;
  const recap = await buildRecap({ ...f, llm: { enabled: true, completeRecapTurn: async input => {
    if (input.stage === 'validate') return { verdicts: [{ index: 0, supported: true }] };
    if (input.stage === 'closing') { closingInput = input; return { closing: '剑柄打击带来了胜利。' }; }
    return { candidates: [c] };
  } } });
  assert.deepEqual(Object.keys(closingInput).sort(), ['selectedCards', 'stage']);
  assert.ok(!recap.closing.includes('剑柄打击'));
});

test('an entity name cannot be rendered as a numeric count', () => {
  const f = base(), c = candidate(f);
  c.bodyTemplate = '{{card}}次抽牌均未上手。';
  assert.deepEqual(selectStories(timeline(f), [c]), []);
});
test('Chinese numeral claims cannot bypass binding checks', () => {
  const f = base(), c = candidate(f); c.bodyTemplate = '{{card}}抽到三次。';
  assert.deepEqual(selectStories(timeline(f), [c]), []);
});
test('a power final amount cannot prove that the power increased', () => {
  const f = base(), e = insert(f, 'power.changed', { powerId: 'STRENGTH', amount: 18 });
  const c = { pattern: 'power', title: '力量暴涨', bodyTemplate: '力量涨到了{{n}}层。', evidenceIds: [e.eventId],
    bindings: { n: { claimIndex: 0 } }, assertions: [{ type: 'event_field', eventId: e.eventId, field: 'amount', value: 18 }] };
  assert.deepEqual(selectStories(timeline(f), [c]), []);
});

test('replaying actual weak-model responses keeps rejected stories out even if its semantic judge approves', async () => {
  const rows = require('../../harness/fixtures/recap-evals/model-response-regressions.json');
  for (const row of rows.cases) {
    const f = JSON.parse(fs.readFileSync(path.join(__dirname, `../../harness/fixtures/recap-evals/${row.fixtureId}.json`)));
    const recap = await buildRecap({ ...f, llm: { enabled: true, completeRecapTurn: async input => {
      if (input.stage === 'validate') return { verdicts: input.supportPackets.map(p => ({ index: p.index, supported: true })) };
      if (input.stage === 'closing') return { closing: '这些片段留下了本局的选择与转折。' };
      return { candidates: row.candidates };
    } } });
    assert.ok(recap.cards.length > 0);
    assert.ok(recap.cards.every(c => !row.forbiddenTitles.includes(c.title)));
    assert.ok(recap.cards.every(c => !/痛击次|true次|飞剑打击/.test(c.body)));
  }
});

// Iteration 01 tools: bounded legacy observations, meaningful choice discovery and field quality.
test('overview pages compact observations while keeping late-act extrema visible', () => {
  const f = base(), prototype = clone(f.facts[0]);
  f.facts = [prototype];
  for (let i = 0; i < 28; i++) {
    f.facts.push({ ...clone(prototype), eventId: `state-${i}`, sourceSeq: i + 2, eventType: 'run.observed',
      payload: { act: i < 14 ? 1 : 2, floor: i % 14, hp: 80 - i, maxHp: 80 + i, gold: 100 + i,
        deck: [{ id: 'BASH', name: '痛击', description: 'very long repeated description' }],
        potions: [{ id: 'FIRE_POTION', name: '火焰药水', description: 'unneeded description' }] } });
  }
  const tools = createTools(timeline(f));
  const overview = tools.call('get_run_overview').data;
  assert.equal(overview.observations.length, 12);
  assert.equal(overview.observationCount, 28);
  assert.equal(overview.observationNextCursor, 12);
  assert.equal(overview.observationsTruncated, true);
  assert.equal(overview.observationSummary.first.eventId, 'state-0');
  assert.equal(overview.observationSummary.last.eventId, 'state-27');
  assert.equal(overview.observationSummary.byAct[1].ranges.hp.min.value, 53);
  assert.equal(overview.observationSummary.byAct[1].ranges.hp.min.eventId, 'state-27');
  assert.equal(overview.observations[0].deckSize, 1);
  assert.equal(overview.observations[0].deck, undefined);
  assert.equal(overview.observations[0].potions[0].description, undefined);
  const next = tools.call('get_run_overview', { observationCursor: 24 }).data;
  assert.equal(next.observations.length, 4);
  assert.equal(next.observationNextCursor, null);
  assert.equal(next.observationsTruncated, false);
  assert.equal(tools.call('get_run_overview', { observationCursor: -1 }).data.error, 'invalid_observationCursor');
});

test('overview excludes restoration noise without hiding raw lookup events', () => {
  const f = base(), prototype = clone(f.facts[0]);
  f.facts = [prototype];
  for (let i = 0; i < 60; i++) f.facts.push({ ...clone(prototype), eventId: `noise-${i}`, sourceSeq: i + 2,
    eventType: i % 2 ? 'reward.updated' : 'deck.card_upgraded', payload: { cardId: 'BASH', description: 'not a new player choice' } });
  f.facts.push({ ...clone(prototype), eventId: 'choice', sourceSeq: 62, eventType: 'reward.resolved',
    payload: { cardId: 'PERFECTED_STRIKE', result: 'selected', candidates: ['unneeded full offer'] } });
  const tools = createTools(timeline(f)), overview = tools.call('get_run_overview').data;
  assert.deepEqual(overview.choices.map(e => e.eventId), ['choice']);
  assert.equal(overview.choiceCount, 1);
  assert.equal(overview.choices[0].payload.candidates, undefined);
  assert.equal(tools.call('find_events', { eventTypes: ['deck.card_upgraded'], limit: 30 }).data.total, 30);
});

test('event lookup and windows mask unknown nested fields and legacy false outcomes', () => {
  const f = base(), e = insert(f, 'card.played', { cardInstanceId: 'unknown-instance', cardId: 'BASH',
    payment: { energySpent: 2, energyValue: 2 } });
  e.quality.unknownFields = ['payload.cardInstanceId', 'payload.payment.energySpent'];
  const ended = f.facts.find(row => row.eventType === 'combat.ended');
  ended.payload = { victory: false, details: { hook: 'AfterCombatEnd' } };
  const tools = createTools(timeline(f));
  const found = tools.call('find_events', { subjectIds: ['unknown-instance'] });
  assert.equal(found.data.total, 0);
  const window = tools.call('read_event_window', { anchorEventId: e.eventId, before: 0, after: 0 }).data.events[0];
  assert.equal(window.payload.cardInstanceId, undefined);
  assert.equal(window.payload.payment.energySpent, undefined);
  assert.equal(window.payload.payment.energyValue, 2);
  assert.equal(e.payload.payment.energySpent, 2);
  const outcome = tools.call('read_event_window', { anchorEventId: ended.eventId, before: 0, after: 0 }).data.events[0];
  assert.equal(outcome.payload.victory, undefined);
  assert.equal(tools.call('get_run_overview').data.combats.find(c => c.endId === ended.eventId).victory, undefined);
});

test('overview exposes bounded relation proof and explicit legacy limitations', () => {
  const f = base(), prototype = clone(f.facts[0]), ended = clone(f.facts.at(-1));
  f.facts = [prototype,
    { ...clone(prototype), eventId: 'low', sourceSeq: 2, eventType: 'run.observed',
      payload: { hp: 8, maxHp: 75, act: 1, floor: 7, potions: [{ id: 'FIRE_POTION', name: '火焰药水' }, { id: 'SPEED_POTION', name: '速度药水' }] } },
    { ...ended, eventId: 'ended', sourceSeq: 3, eventType: 'run.ended', payload: { cleared: false, reason: 'game_ended_not_cleared' } }];
  const overview = createTools(timeline(f)).call('get_run_overview').data;
  assert.equal(overview.relationLeads.length, 1);
  assert.equal(overview.relationLeads[0].kind, 'low_hp_inventory');
  assert.equal(overview.relationLeads[0].fields.hp, 8);
  assert.ok(overview.relationLeads[0].evidenceIds.includes('low'));
  assert.ok(overview.relationLeads[0].evidenceIds.includes('ended'));
  assert.ok(overview.limitations.some(s => s.includes('不证明死亡')));
  assert.ok(overview.limitations.some(s => s.includes('不是唯一牌实例')));
  assert.ok(overview.limitations.some(s => s.includes('victory:false')));
});

test('potion mechanics are reference knowledge rather than confirmed trigger evidence', () => {
  const data = createTools(timeline(base())).call('get_mechanic_facts', { objectId: 'FAIRY_IN_A_BOTTLE' }).data;
  assert.equal(data.name, '瓶中精灵');
  assert.equal(data.status, 'reference_only');
  assert.ok(data.description.includes('30%'));
  assert.ok(data.limitation.includes('不证明本场已触发'));
});

test('query projections remove repeated descriptions but preserve deck indices and source facts', () => {
  const f = base(), e = insert(f, 'run.observed', { hp: 20, maxHp: 80, deck: [
    { id: 'STRIKE_IRONCLAD', name: '打击', upgraded: false, type: 'Attack', cost: 1, description: 'long repeated card text' },
    { id: 'BASH', name: '痛击', upgraded: true, type: 'Attack', cost: 2, description: 'another long repeated card text' }
  ] });
  e.quality.unknownFields = ['payload.deck.1.cost'];
  const tools = createTools(timeline(f));
  const row = tools.call('find_events', { eventTypes: ['run.observed'], limit: 30 }).data.events.find(row => row.eventId === e.eventId);
  assert.equal(row.projection, 'compact_run_observed');
  assert.equal(row.payload.deck.length, 2);
  assert.equal(row.payload.deck[1].id, 'BASH');
  assert.equal(row.payload.deck[1].cost, undefined);
  assert.equal(row.payload.deck[0].cost, 1);
  assert.equal(row.payload.deck[0].description, undefined);
  const window = tools.call('read_event_window', { anchorEventId: e.eventId, before: 0, after: 0 }).data.events[0];
  assert.deepEqual(window.payload.deck, row.payload.deck);
  assert.equal(e.payload.deck[1].cost, 2);
  assert.equal(e.payload.deck[0].description, 'long repeated card text');
});

// Projected windows from the four real failed-run development logs. These are
// frozen source evidence, not generated gameplay; mutations below test guards.
const realObservationCases = require('../../harness/fixtures/recap-evals/real-observation-regressions.json');
const realLong = () => clone(realObservationCases.cases.find(c => c.runId.startsWith('309ec')));
test('real legacy observations recover the three grounded long-run relations without inventing metrics', async () => {
  const f = realLong(), recap = await buildRecap({ ...f, llm: null });
  assert.deepEqual(recap.fixedMetrics.map(m => m.value), [null, null, null, null]);
  assert.deepEqual(recap.cards.map(c => c.pattern), ['health_recovery', 'rest_choice_style', 'low_hp_inventory']);
  assert.ok(recap.cards[0].body.includes('37'));
  assert.ok(recap.cards[1].body.includes('6次') && recap.cards[1].body.includes('61/80'));
  assert.ok(recap.choiceStats.some(s => s.label === '休息增加生命上限' && s.display === '+30'));
  assert.ok(!/死亡|牺牲|忘记|必胜/.test(recap.cards.map(c => c.body).join('')));
});
test('recovery relations cannot cross a resume, source session change or missing sequence', () => {
  const { observedRelations } = require('./facts');
  for (const mode of ['resume', 'session', 'missing']) {
    const f = realLong(), heal = f.facts.find(e => e.eventType === 'heal.resolved' && e.payload.currentHp === 37);
    if (mode === 'resume') { heal.eventType = 'run.resumed'; heal.payload = {}; }
    if (mode === 'session') f.facts.find(e => e.sourceSeq === 3008).sourceSessionId = 'new-session';
    if (mode === 'missing') f.facts = f.facts.filter(e => e !== heal);
    assert.ok(!observedRelations(timeline(f)).some(r => r.kind === 'health_recovery'), mode);
  }
});
test('relation facts require their complete source proof and diagnose missing evidence', () => {
  const { localStories, candidateDiagnostics } = require('./stories');
  const f = realLong(), t = timeline(f), card = localStories(t).find(c => c.pattern === 'rest_choice_style');
  const c = { ...card, bodyTemplate: '{{n}}次火堆回血，{{hp}}血仍选择休息。',
    bindings: { n: { claimIndex: 0 }, hp: { claimIndex: 1 } }, evidenceIds: card.evidenceIds.slice(0, 2) };
  assert.deepEqual(selectStories(t, [c]), []);
  const diagnostic = candidateDiagnostics(t, [c])[0];
  assert.equal(diagnostic.reason, 'missing_relation_evidence');
  assert.ok(diagnostic.detail.missingEvidenceIds.length > 0);
});
test('the actual misattributed thirty-block model response stays rejected even when its judge approves', async () => {
  const f = realLong();
  const recap = await buildRecap({ ...f, maxRounds: 0, llm: { enabled: true, completeRecapTurn: async input => {
    if (input.stage === 'validate') return { verdicts: input.supportPackets.map(p => ({ index: p.index, supported: true })) };
    if (input.stage === 'closing') return { closing: '强化壁垒提供了30格挡。' };
    return { candidates: realObservationCases.rejectedModelCandidates };
  } } });
  assert.ok(recap.cards.every(c => !c.title.includes('强化壁垒') && !c.body.includes('IMPERVIOUS')));
  assert.ok(!recap.closing.includes('强化壁垒'));
});
test('a candidate submitted on the last investigation response still gets one bounded repair', async () => {
  const { localStories } = require('./stories');
  const f = realLong(), validCard = localStories(timeline(f)).find(c => c.pattern === 'health_recovery');
  const good = { ...validCard, bodyTemplate: '生命从{{zero}}回到{{hp}}血。',
    bindings: { zero: { claimIndex: 0 }, hp: { claimIndex: 1 } } };
  let repairCalls = 0;
  const recap = await buildRecap({ ...f, maxRounds: 0, llm: { enabled: true, completeRecapTurn: async input => {
    if (input.stage === 'repair') { repairCalls++; assert.equal(input.remainingReads, 0); return { candidates: [good] }; }
    if (input.stage === 'validate') return { verdicts: input.supportPackets.map(p => ({ index: p.index, supported: true, issues: [] })) };
    if (input.stage === 'closing') return { closing: '血条重新亮了起来。' };
    return { candidates: [{ ...good, bodyTemplate: '一次治疗后，生命回到{{hp}}血。' }] };
  } } });
  assert.equal(repairCalls, 1);
  assert.equal(recap.status, 'ready');
  assert.ok(recap.trace.some(x => x.phase === 'repair'));
  assert.ok(recap.cards.some(c => c.verifiedKind === 'health_recovery' && c.body.includes('37') && c.rendering === 'canonical_known_relation'));
});
test('a grounded candidate publishes even when a later review would have asked for edits', async () => {
  const { localStories } = require('./stories');
  const f = realLong(), card = localStories(timeline(f))[0];
  const c = { ...card, title: '模型待修版', bodyTemplate: '生命从{{a}}回到{{b}}血。', bindings: { a: { claimIndex: 0 }, b: { claimIndex: 1 } } };
  const stages = [];
  const recap = await buildRecap({ ...f, maxRounds: 0, llm: { enabled: true, completeRecapTurn: async input => {
    stages.push(input.stage);
    if (input.stage === 'closing') return { closing: '血条重新亮了起来。' };
    return { candidates: [c] };
  } } });
  assert.ok(recap.cards.length > 0);
  assert.ok(!stages.includes('validate'));
});
test('holding potions cannot be rewritten as confirmed death', () => {
  const { localStories, candidateDiagnostics } = require('./stories');
  const f = clone(realObservationCases.cases.find(c => c.runId.startsWith('0da9'))), t = timeline(f), card = localStories(t)[0];
  const c = { ...card, bodyTemplate: '死前只剩{{hp}}血，药水还在。', bindings: { hp: { claimIndex: 0 } } };
  assert.deepEqual(selectStories(t, [c]), []);
  assert.equal(candidateDiagnostics(t, [c])[0].reason, 'unproved_player_death');
});

test('known inventory relations render positive possession instead of absence or diagnostic prose', () => {
  const { localStories, groundedStory } = require('./stories');
  const f = clone(realObservationCases.cases.find(c => c.runId.startsWith('0da9'))), t = timeline(f), local = localStories(t)[0];
  const c = { ...local, title: '药水没动', bodyTemplate: '末段还有{{hp}}血，只证明当时持有，未证使用。', bindings: { hp: { claimIndex: local.assertions.findIndex(c => c.field === 'hp') } } };
  const card = groundedStory(t, c);
  assert.equal(card.rendering, 'canonical_known_relation');
  assert.ok(!/没动|未动|证据|未证|只证明/.test(card.title + card.body));
  assert.ok(card.body.includes('63血降到8血') && card.body.includes('立柱构造体'));
});
test('known-relation summaries stay within typed facts and strongest moments come first', async () => {
  const { localStories } = require('./stories');
  const f = realLong(), local = localStories(timeline(f)), candidates = [...local].reverse().map(card => ({ ...card,
    bodyTemplate: '记录{{v}}。', bindings: { v: { claimIndex: 0 } } }));
  let closingCalls = 0;
  const recap = await buildRecap({ ...f, maxRounds: 0, llm: { enabled: true, completeRecapTurn: async input => {
    if (input.stage === 'closing') { closingCalls++; return { closing: '药水没动。' }; }
    if (input.stage === 'validate') return { verdicts: input.supportPackets.map(p => ({ index: p.index, supported: true, issues: [] })) };
    return { candidates };
  } } });
  assert.deepEqual(recap.cards.map(c => c.pattern), ['health_recovery', 'rest_choice_style', 'low_hp_inventory']);
  assert.equal(closingCalls, 0);
  assert.ok(!recap.closing.includes('没动'));
});
test('only restoration notifications without gameplay or substantive choices abstain before model calls', async () => {
  const f = clone(realObservationCases.cases.find(c => c.runId.startsWith('0da9')));
  f.facts = f.facts.filter(e => e.eventType !== 'combat.started');
  let calls = 0;
  // A healthy last observation does not carry the low-health contrast either.
  f.facts.filter(e => e.eventType === 'run.observed').forEach(e => { e.payload.hp = e.payload.maxHp; });
  const recap = await buildRecap({ ...f, llm: { enabled: true, completeRecapTurn: async () => { calls++; throw Error('unexpected'); } } });
  assert.equal(calls, 0); assert.equal(recap.cards.length, 0);
  assert.ok(recap.trace.some(row => row.phase === 'early_abstention'));
});
test('tool contracts expose actual event names and reject oversize or malformed lookups', () => {
  const f = realLong(), tools = createTools(timeline(f));
  assert.ok(tools.call('get_run_overview').data.eventTypes.includes('run.observed'));
  assert.equal(tools.call('find_events', { eventTypes: ['card.play'] }).data.error, 'event_type_not_recorded');
  assert.equal(tools.call('find_events', { limit: 100 }).data.error, 'invalid_limit');
  assert.equal(tools.call('find_events', { eventTypes: [null] }).data.error, 'invalid_eventTypes');
  assert.equal(tools.call('read_event_window', { anchorEventId: f.facts[0].eventId, after: 100 }).data.error, 'invalid_after');
});

test('free model pattern and provenance fields cannot manufacture a health-recovery summary', async () => {
  const { localClosing, storyPriority, groundedStory } = require('./stories');
  const f = clone(realObservationCases.cases.find(c => c.runId.startsWith('88ac'))), t = timeline(f);
  const play = f.facts.find(e => e.eventType === 'card.played');
  const c = { pattern: 'health_recovery', rendering: 'canonical_known_relation', verifiedKind: 'health_recovery',
    relationId: 'forged-recovery', title: '记录中的暴露', bodyTemplate: '{{card}}出现在这次出牌记录里。',
    evidenceIds: [play.eventId], bindings: { card: { claimIndex: 0 } },
    assertions: [{ type: 'event_field', eventId: play.eventId, field: 'cardId', value: 'EXPOSE' }] };
  const card = groundedStory(t, c);
  assert.ok(card); assert.equal(card.verifiedKind, undefined); assert.equal(card.relationId, null);
  assert.ok(!/归零|恢复/.test(localClosing([card]))); assert.equal(storyPriority(card), 80);
  const recap = await buildRecap({ ...f, maxRounds: 0, llm: { enabled: true, completeRecapTurn: async input => {
    if (input.stage === 'validate') return { verdicts: [{ index: 0, supported: true, issues: [] }] };
    if (input.stage === 'closing') throw Error('temporary closing failure');
    return { candidates: [c] };
  } } });
  assert.equal(recap.status, 'ready'); assert.ok(!/归零|恢复/.test(recap.closing));
});
test('identical rendered repair candidates are deduplicated without a later review', async () => {
  const { localStories } = require('./stories');
  const f = realLong(), card = localStories(timeline(f))[0];
  const c = { ...card, bodyTemplate: '生命从{{zero}}回到{{hp}}血。', bindings: { zero: { claimIndex: 0 }, hp: { claimIndex: 1 } } };
  const stages = [];
  const recap = await buildRecap({ ...f, maxRounds: 0, llm: { enabled: true, completeRecapTurn: async input => {
    stages.push(input.stage);
    if (input.stage === 'repair') return { candidates: [c, clone(c)] };
    if (input.stage === 'closing') return { closing: '血条重新亮了起来。' };
    return { candidates: [c, { ...c, bodyTemplate: '一次治疗后恢复。' }] };
  } } });
  assert.ok(!stages.includes('validate'));
  assert.ok(recap.trace.some(x => x.phase === 'exact_deduplication' && x.after === 1));
});
test('real recovery and the later third act form one card, while a reload removes only the continuation', () => {
  const { observedRelations } = require('./facts'), { localStories } = require('./stories');
  const f = realLong(), relation = observedRelations(timeline(f)).find(r => r.kind === 'health_recovery');
  assert.equal(relation.fields.nextAct, 3);
  assert.ok(relation.evidenceIds.some(id => id.endsWith(':3056')));
  const stories = localStories(timeline(f));
  assert.equal(stories.filter(c => c.verifiedKind === 'health_recovery').length, 1);
  assert.ok(stories[0].body.includes('第3幕'));
  const interrupted = clone(f), event = interrupted.facts.find(e => e.sourceSeq === 3039);
  event.eventType = 'run.resumed'; event.payload = {};
  const after = observedRelations(timeline(interrupted)).find(r => r.kind === 'health_recovery');
  assert.ok(after); assert.equal(after.fields.hpAfter, 37); assert.equal(after.fields.nextAct, undefined);
});
test('a true transaction and correct subtraction are background without a meaningful payoff', () => {
  const { candidateDiagnostics } = require('./stories');
  const f = clone(realObservationCases.cases.find(c => c.runId.startsWith('88ac'))), t = timeline(f);
  assert.deepEqual(selectStories(t, realObservationCases.rejectedOrdinaryTransactionCandidates), []);
  assert.equal(candidateDiagnostics(t, realObservationCases.rejectedOrdinaryTransactionCandidates)[0].reason, 'ordinary_transaction_background');
});
test('mechanic lookup rejects an unknown decision anchor instead of using future run state', () => {
  const f = realLong(), tools = createTools(timeline(f));
  const unknown = tools.call('get_mechanic_facts', { objectId: 'BASH', anchorEventId: 'not-recorded' });
  assert.equal(unknown.data.error, 'unknown_anchor'); assert.equal(unknown.data.strategyContext, undefined);
  const reference = tools.call('get_mechanic_facts', { objectId: 'BASH' });
  assert.equal(reference.data.contextScope, 'last_recorded_observation');
});
