const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { makeTimeline, observedRelations } = require('./facts');
const { localRecap, buildRecap } = require('./runner');
const { battleMetrics, recapFixedMetrics } = require('./presentation');
const { createRecapStore } = require('./store');

function fixture() {
  const runId = 'synthetic-scenic', facts = [];
  const add = (eventType, payload = {}, extra = {}) => {
    const seq = facts.length + 1;
    const f = { runId, eventId: `s:${seq}`, sourceSessionId: 's', sourceSeq: seq,
      occurredAt: seq * 1000, eventType, payload, ...extra };
    facts.push(f); return f;
  };
  const state = (hp, maxHp, floor, potionIds = ['FAIRY_IN_A_BOTTLE']) => add('run.observed', {
    character: 'IRONCLAD', ascension: 2, act: 2, floor, hp, maxHp, gold: 380,
    potions: potionIds.map(id => ({ id })), deck: []
  });
  const choice = (id, options, label) => {
    const decisionId = `decision:${id}`;
    add('event.options_offered', { eventId: id, options: options.map(o => ({ locked: false, ...o })) }, { decisionId });
    add('event.option_selected', { label }, { decisionId });
  };
  add('run.started');
  state(52, 109, 6);
  choice('ROOM_FULL_OF_CHEESE', [{ label: '拿牌', description: '选择2张普通牌。' },
    { label: '遗物', description: '失去14点生命，获得天选芝士。' }], '拿牌');
  state(55, 119, 12);
  choice('CRYSTAL_SPHERE', [{ label: '付钱', description: '支付98金币。占卜3次。' },
    { label: '背债', description: '获得一张债务。占卜6次。' }], '背债');
  state(55, 119, 13, ['SPEED_POTION', 'FAIRY_IN_A_BOTTLE']);
  choice('THE_FUTURE_OF_POTIONS', [{ label: '普通', description: '失去速度药水。获得升级普通攻击牌。' },
    { label: '稀有', description: '失去瓶中精灵。获得升级稀有攻击牌。' }], '普通');
  state(55, 119, 13);
  for (const [floor, hp, maxHp] of [[13, 61, 80], [14, 41, 109], [15, 44, 119]]) {
    state(hp, maxHp, floor);
    add('rest.options_offered', { canHeal: true, smithCandidates: [{ id: 'BASH', upgraded: false }] });
    add('rest.action_completed', { action: 'heal' });
  }
  state(99, 124, 16, ['ASHWATER', 'FAIRY_IN_A_BOTTLE']);
  const combat = { combatId: 'boss', attemptGeneration: 0 };
  add('combat.started', { boss: true, enemies: [{ name: '碾碎爪' }, { name: '火箭' }] }, combat);
  state(13, 124, 16, ['ASHWATER', 'FAIRY_IN_A_BOTTLE']);
  state(0, 124, 16, ['ASHWATER']);
  add('heal.resolved', { amount: 37, currentHp: 37 }, combat);
  state(37, 124, 16, ['ASHWATER']);
  add('potion.used', {}, combat);
  add('combat.ended', { victory: true }, combat);
  add('run.ended', { cleared: false });
  const timeline = () => makeTimeline(runId, facts, { gaps: [], families: {} });
  return { runId, facts, add, timeline };
}

test('choice evidence produces a rescue callback, contextual rest style and resource portrait', () => {
  const f = fixture(), r = localRecap(f.timeline(), { finalFloor: 39, finalAct: 3, result: 'loss' });
  assert.deepEqual(r.cards.map(c => c.verifiedKind), ['fairy_kept_rescue', 'rest_choice_style', 'resource_choice_style']);
  assert.match(r.cards[0].body, /3层后99血进双Boss战/);
  assert.match(r.cards[1].body, /61\/80血也不打铁/);
  assert.match(r.cards[2].body, /14血.*380金币/);
  assert.equal(r.portrait, '惜命不惜债');
  assert.ok(r.cards.every(c => [...c.body].length <= 40 && [...c.title].length <= 10));
  assert.ok([...r.closing].length <= 40);
  assert.equal(observedRelations(f.timeline()).find(r => r.kind === 'fairy_kept_rescue').inference, 'mechanism_correlated');
  assert.equal(r.runSummary.totalFloor, 39);
  assert.equal(r.runSummary.durationLabel, '记录覆盖');
  assert.deepEqual(r.battleMetrics.map(m => m.value), [null, null, null, null]);
});

for (const mode of ['wrong_heal', 'wrong_potion', 'resume', 'no_fairy_before', 'no_trade_choice', 'sequence_gap']) {
  test(`rescue attribution is rejected with ${mode}`, () => {
    const f = fixture();
    const heal = f.facts.find(e => e.eventType === 'heal.resolved');
    if (mode === 'wrong_heal') heal.payload.amount = 50;
    if (mode === 'wrong_potion') f.facts.find(e => e.eventType === 'potion.used').payload.potionId = 'HEALING_POTION';
    if (mode === 'resume') { heal.eventType = 'run.resumed'; heal.payload = {}; }
    if (mode === 'no_fairy_before') f.facts.find(e => e.eventType === 'run.observed' && e.payload.hp === 13).payload.potions = [];
    if (mode === 'no_trade_choice') f.facts.find(e => e.eventType === 'event.option_selected' && e.payload.label === '普通').payload.label = '稀有';
    if (mode === 'sequence_gap') f.facts.splice(f.facts.indexOf(heal), 1);
    assert.ok(!observedRelations(f.timeline()).some(r => r.kind === 'fairy_kept_rescue'));
  });
}

test('unavailable upgrades and an unaffordable alternative cannot support a choice portrait', () => {
  const f = fixture();
  for (const e of f.facts) {
    if (e.eventType === 'rest.options_offered') e.payload.smithCandidates = [];
    if (e.eventType === 'run.observed') e.payload.gold = 50;
  }
  const kinds = observedRelations(f.timeline()).map(r => r.kind);
  assert.ok(!kinds.includes('rest_choice_style'));
  assert.ok(!kinds.includes('resource_choice_style'));
});
test('a locked alternative is not a choice the player declined', () => {
  const f = fixture();
  f.facts.find(e => e.eventType === 'event.options_offered' && e.payload.eventId === 'THE_FUTURE_OF_POTIONS')
    .payload.options.find(o => o.label === '稀有').locked = true;
  assert.ok(!observedRelations(f.timeline()).some(r => r.kind === 'fairy_kept_rescue'));
});
test('unknown rest actions cannot become a zero-upgrade claim or all-rest personality', () => {
  const f = fixture();
  f.facts.find(e => e.eventType === 'rest.action_completed').payload = {};
  const r = localRecap(f.timeline());
  assert.ok(!r.cards.some(c => c.verifiedKind === 'rest_choice_style'));
  assert.equal(r.choiceStats.find(s => s.label === '火堆升级').display, '未记录');
});

function metricFixture() {
  const facts = [], runId = 'synthetic-totals';
  const add = (eventType, payload = {}, combat = true) => facts.push({ runId, eventId: `m:${facts.length}`,
    sourceSessionId: 'm', sourceSeq: facts.length, occurredAt: facts.length * 1000, eventType, payload,
    ...(combat ? { combatId: 'c', attemptGeneration: 0 } : {}) });
  add('run.started', {}, false); add('combat.started');
  add('damage.resolved', { sourceSide: 'Player', targetSide: 'Enemy', hpLoss: 10, requested: 9999, blocked: 0 });
  add('damage.resolved', { sourceSide: 'Enemy', targetSide: 'Player', targetEntityId: 'player', hpLoss: 4, blocked: 6 });
  add('damage.resolved', { sourceSide: 'Player', targetSide: 'Player', hpLoss: 2, blocked: 0 });
  add('damage.resolved', { sourceSide: 'Enemy', targetSide: 'Enemy', hpLoss: 3, blocked: 0 });
  add('heal.resolved', { targetEntityId: 'player', hpBefore: 70, hpAfter: 80, amount: 20 });
  add('combat.ended', { victory: true }); add('run.ended', {}, false);
  const coverage = { families: { damage: { state: 'available' }, combat_resolution: { state: 'available' } } };
  return { facts, timeline: () => makeTimeline(runId, facts, coverage) };
}

test('totals exclude overkill, self damage, enemy self damage and overheal', () => {
  assert.deepEqual(battleMetrics(metricFixture().timeline()).map(m => m.value), [10, 6, 4, 10]);
});
test('uncertain rows do not hide metrics backed by other damage events', () => {
  const f = metricFixture();
  delete f.facts.find(e => e.eventType === 'damage.resolved').payload.sourceSide;
  const heal = f.facts.find(e => e.eventType === 'heal.resolved'); delete heal.payload.hpBefore;
  assert.deepEqual(battleMetrics(f.timeline()).map(m => m.value), [null, 6, 4, null]);
});
test('ended runs display available totals even when the start marker is absent', () => {
  const f = metricFixture(); f.facts[0].eventType = 'run.resumed';
  assert.deepEqual(battleMetrics(f.timeline()).map(m => m.display), ['10', '6', '4', '10']);
});

test('recorded battle values appear when the final combat has no end marker', () => {
  const f = metricFixture();
  f.facts.splice(f.facts.findIndex(event => event.eventType === 'combat.ended'), 1);
  Object.assign(f.facts.find(event => event.eventType === 'damage.resolved').payload, { turn: 1, side: 'Player' });
  const recap = localRecap(f.timeline());
  assert.deepEqual(recap.battleMetrics.slice(0, 3).map(metric => metric.display), ['10', '6', '4']);
  assert.ok(recap.battleMetrics.every(metric => metric.scope === 'recorded'));
  assert.deepEqual(recap.fixedMetrics[0], { id: 'turn_damage', label: '最高回合实际爆发', value: 10,
    display: '10', scope: 'recorded' });
  f.facts.pop();
  assert.equal(battleMetrics(f.timeline())[0].display, '已记录 10');
  assert.equal(battleMetrics(f.timeline(), { result: 'loss' })[0].display, '10');
  assert.equal(recapFixedMetrics(f.timeline(), { result: 'loss' })[0].display, '10');
  f.facts.splice(0, f.facts.length);
  assert.equal(recapFixedMetrics(f.timeline())[0].display, '未记录');
  assert.ok(battleMetrics(f.timeline()).every(metric => metric.display === '未记录'));
});

test('a cached recap refreshes displayed metrics without replacing its cards', async t => {
  const f = metricFixture(), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'recap-recorded-stats-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  f.facts.splice(f.facts.findIndex(event => event.eventType === 'combat.ended'), 1);
  const { runId } = f.facts[0];
  const store = createRecapStore({ directory, llmFactory: () => null, factStore: {
    getEffectiveFacts: () => f.facts, getCoverage: () => f.timeline().coverage, getSnapshots: () => []
  } });
  await store.get(runId);
  const file = path.join(directory, fs.readdirSync(directory)[0]);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  saved.recap.battleMetrics = [];
  saved.recap.cards = [{ title: '火堆忙活完，牌还没醒', body: '已保存的故事。' }];
  fs.writeFileSync(file, JSON.stringify(saved));
  const recap = await store.get(runId);
  assert.equal(recap.battleMetrics[0].display, '10');
  assert.deepEqual(recap.cards, saved.recap.cards);
});

test('model failure shows local metrics and leaves the story area empty', async () => {
  const f = fixture();
  const r = await buildRecap({ runId: f.runId, facts: f.facts, coverage: {}, llm: { enabled: true,
    completeRecapTurn: async () => { throw Error('offline'); } } });
  assert.equal(r.status, 'retryable');
  assert.deepEqual(r.cards, []);
  assert.equal(r.closing, '');
  assert.ok(r.fixedMetrics.length);
});
test('recap cache includes corrected run metadata and does not reuse an old floor', async t => {
  const f = fixture(), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'recap-summary-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = createRecapStore({ directory,
    factStore: { getEffectiveFacts: () => f.facts, getCoverage: () => ({}), getSnapshots: () => [] },
    llmFactory: () => null });
  assert.equal((await store.get(f.runId, { finalFloor: 39 })).runSummary.totalFloor, 39);
  assert.equal((await store.get(f.runId, { finalFloor: 40 })).runSummary.totalFloor, 40);
  assert.deepEqual((await store.get(f.runId, { finalFloor: 40 })).cards, []);
});
