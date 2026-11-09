'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { buildRunDetails, readRunDetails } = require('./run-details');
function fixture() {
  const facts = [], run = { runId: 'r', result: 'loss', finalFloor: 5, finalAct: 1, startedAt: 1000, endedAt: 65000 };
  const add = (eventType, payload = {}, extra = {}) => { const n = facts.length + 1; const f = { runId: 'r', eventType, payload, sourceSessionId: 's', sourceSeq: n, eventId: `e${n}`, occurredAt: n * 1000, ...extra }; facts.push(f); return f; };
  const state = (floor, extra = {}) => add('run.observed', { act: 1, floor, hp: 24, maxHp: 80, gold: 100, ...extra });
  return { facts, run, add, state, build: () => buildRunDetails(run, facts) };
}
test('merges early combat hook into the floor of the enemy snapshot, ignoring legacy false outcome', () => {
  const f = fixture(); f.state(4);
  f.add('combat.started', { hook: 'BeforeCombatStart' }, { combatId: 'c', attemptGeneration: 0 });
  f.state(5); f.add('combat.started', { enemies: [{ name: '精英' }], roomType: 'Elite' }, { combatId: 'c', attemptGeneration: 0 });
  f.add('turn.started', {}, { combatId: 'c' });
  f.add('combat.ended', { victory: false, details: { hook: 'AfterCombatEnd' } }, { combatId: 'c' });
  const d = f.build(); assert.equal(d.acts[0].floors[0].combats.length, 0);
  assert.equal(d.acts[0].floors[1].combats.length, 1); assert.equal(d.acts[0].floors[1].kind, 'elite');
  assert.equal(d.acts[0].floors[1].combats[0].outcome, null); assert.equal(d.acts[0].floors[1].combats[0].turns, null);
  assert.equal(d.summary.lastEncounter, '精英'); assert.equal(d.summary.durationSeconds, 64);
});
test('deduplicates transport notifications and selected reward enrichment without decisionId', () => {
  const f = fixture(); f.state(5);
  f.add('reward.offered', { candidateVersion: 'v', candidates: [{ cardId: 'BASH' }, { cardId: 'ANGER' }] }, { decisionId: 'd' });
  f.add('reward.resolved', { result: 'selected', candidateVersion: 'v' }, { decisionId: 'd' });
  const resolved = f.add('reward.resolved', { result: 'selected', candidateVersion: 'v', cardId: 'BASH' }); f.facts.push(resolved);
  const rows = f.build().acts[0].floors[0].rows;
  assert.equal(rows.length, 1); assert.equal(rows[0].text, '拿取 痛击'); assert.equal(rows[0].detail, '未拿：愤怒');
});
test('uses the selected candidate version rather than the latest reroll and preserves separate decisions', () => {
  const f = fixture(); f.state(5);
  f.add('reward.offered', { candidateVersion: 'a', candidates: [{ cardId: 'BASH' }, { cardId: 'ANGER' }] }, { decisionId: 'd' });
  f.add('reward.updated', { candidateVersion: 'b', candidates: [{ cardId: 'BASH' }, { cardId: 'HEADBUTT' }] }, { decisionId: 'd' });
  f.add('reward.resolved', { candidateVersion: 'a', cardId: 'BASH', result: 'selected' }, { decisionId: 'd' });
  f.add('reward.resolved', { candidateVersion: 'a', cardId: 'BASH', result: 'selected' }, { decisionId: 'd2' });
  const rows = f.build().acts[0].floors[0].rows; assert.equal(rows.length, 2); assert.match(rows[0].detail, /愤怒/); assert.doesNotMatch(rows[0].detail, /头槌/);
});
test('keeps only the latest combat generation and counts explicit player turns once', () => {
  const f = fixture(); f.state(5);
  for (const gen of [0, 1]) {
    const extra = { combatId: 'c', attemptGeneration: gen };
    f.add('combat.started', { roomType: 'Monster', enemies: [{ name: `第${gen}次` }] }, extra);
    f.add('turn.started', { side: 'player', turn: 1 }, extra); f.add('turn.started', { side: 'enemy', turn: 1 }, extra);
    f.add('turn.started', { side: 'player', turn: 1 }, extra);
  }
  const c = f.build().acts[0].floors[0].combats; assert.equal(c.length, 1); assert.equal(c[0].enemies, '第1次'); assert.equal(c[0].turns, 1);
});
test('groups identical cards but preserves upgrade, enchantment and runtime description variants', () => {
  const f = fixture(); f.run.finalState = { deck: [{ id: 'BASH' }, { id: 'BASH' }, { id: 'BASH', upgraded: true },
    { id: 'BASH', enchantment: '黏糊' }, { id: 'BASH', description: '造成999点伤害。' }, { id: 'BASH', cost: 0 }], relics: [] };
  const d = f.build(); assert.equal(d.deck.length, 5); assert.equal(d.deck[0].count, 2); assert.equal(d.deck[1].name, '痛击+');
  assert.match(d.deck[1].description, /10/); assert.equal(d.relics.length, 0); assert.equal(d.potions, null);
  assert.equal(d.deck[0].image, './assets/run-details/cards/faces/bash.webp');
  assert.equal(d.deck[1].image, './assets/run-details/cards/faces/bash_upg.webp');
  f.run.finalState.deck = [{ id: 'WITHER', upgraded: true }];
  assert.equal(f.build().deck[0].image, './assets/run-details/cards/portraits/wither.webp');
});
test('does not bridge resource deltas across reloads and does not invent missing floors', () => {
  const f = fixture(); f.state(2, { hp: 24 }); f.add('run.resumed'); f.state(2, { hp: 80 }); f.state(5, { hp: 40 });
  const d = f.build(); assert.equal(d.acts[0].floors.length, 2); assert.equal(d.acts[0].floors[0].hpBefore, null); assert.equal(d.acts[0].floors[0].hpAfter, 80);
});
test('capture gaps stop inferred floor inventory changes', () => {
  const f = fixture(); f.state(5, { relics: [] }); f.add('capture.gap_detected');
  f.state(5, { relics: [{ id: 'BURNING_BLOOD' }] });
  const d = f.build(); assert.equal(d.relics[0].acquiredAt, null); assert.equal(d.acts[0].floors[0].rows.length, 0);
});
test('unknown reward result stays unknown and replaced attempts stop health deltas', () => {
  const f = fixture(); f.state(5, { hp: 4 });
  f.add('reward.resolved', { result: 'unknown' }, { decisionId: 'd' });
  f.add('combat.attempt_replaced'); f.state(5, { hp: 80 });
  const floor = f.build().acts[0].floors[0]; assert.equal(floor.hpBefore, null); assert.equal(floor.rows[0].text, '选择结果未记录');
});
test('records known choices and local inventory net changes without claiming a causal source', () => {
  const f = fixture(); f.state(5, { relics: [] });
  f.add('rest.action_completed', { action: 'smith', cardId: 'BASH' });
  f.add('shop.transaction_completed', { itemType: 'RunState', status: 'completed', price: 51 });
  f.state(5, { relics: [{ id: 'BURNING_BLOOD' }] });
  const rows = f.build().acts[0].floors[0].rows;
  assert.match(rows[0].text, /痛击\+/); assert.equal(rows[1].text, '物品未记录 · 51 金币'); assert.equal(rows[2].text, '净增：燃烧之血');
  assert.deepEqual(f.build().relics[0].acquiredAt, { act: 1, floor: 5 });
});
test('rejects nonexistent and non-string run IDs before reading facts', () => {
  let reads = 0; const store = { getEffectiveFacts() { reads++; return []; } };
  for (const id of ['../outside', 'absent', null, {}, ['r']]) assert.equal(readRunDetails(id, { runs: [{ runId: 'r' }] }, store), null);
  assert.equal(reads, 0); assert.equal(readRunDetails('r', { runs: [{ runId: 'r' }] }, store).runId, 'r'); assert.equal(reads, 1);
});
test('renders independent, escaped detail section with local assets and accessible floor controls', () => {
  const f = fixture(); f.state(5); f.add('event.options_offered', { eventName: '<script>恶意', options: [{ label: '选择', description: '<img src=x>' }] }, { decisionId: 'd' });
  f.add('event.option_selected', { label: '选择' }, { decisionId: 'd' });
  const window = {}; vm.runInNewContext(fs.readFileSync('src/run-details-ui.js', 'utf8'), { window });
  const html = window.GameBuddyRunDetailsUi.render(f.build());
  assert.match(html, /aria-label="单局详情"/); assert.match(html, /<details class="rd-floor"/); assert.match(html, /data-floor-target="rd-floor-1-5"/);
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>|<img src=x>|死于|evidenceIds|工具|社区|搜索/);
  assert.doesNotMatch(html, /src="https?:/); assert.doesNotMatch(fs.readFileSync('review/run-details.js', 'utf8'), /require\(['"].*recap/);
  const failed = window.GameBuddyRunDetailsUi.render({ status: 'unavailable' }, { deck: [{ name: '已保存的痛击' }], relics: [] });
  assert.match(failed, /已保存的痛击/); assert.match(failed, /重新打开可重试/);
  f.run.finalState = { deck: [{ id: 'BASH' }, { id: 'BASH', upgraded: true }, { id: 'UNKNOWN_MOD_CARD', name: '未知扩展卡' }] };
  const withCards = window.GameBuddyRunDetailsUi.render(f.build());
  assert.match(withCards, /cards\/faces\/bash.webp/); assert.match(withCards, /cards\/faces\/bash_upg.webp/);
  assert.match(withCards, /未知扩展卡/); assert.match(withCards, /rd-card-back/);
});
