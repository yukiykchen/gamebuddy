const { observedPayload, observedRelations, PLAYER, ENEMY } = require('./facts');

const BATTLE_METRICS = [
  ['total_damage', '累计输出'], ['total_absorbed', '实际抗伤'],
  ['total_taken', '累计受伤'], ['total_healed', '实际恢复']
];

function battleMetrics(t) {
  const totals = [0, 0, 0, 0], known = [true, true, true, true];
  const complete = t.completeRun && t.combats.size > 0
    && (t.available('damage') || t.available('combat_resolution'))
    && [...t.combats.keys()].every(id => t.completeCombat(id, t.available('damage') ? 'damage' : 'combat_resolution'));
  const roles = new Map();
  const amount = n => Number.isFinite(n) && n >= 0;
  for (const f of t.facts.filter(f => f.eventType === 'damage.resolved')) {
    const p = observedPayload(f);
    for (const [id, side] of [[p.sourceEntityId, p.sourceSide], [p.targetEntityId, p.targetSide]]) {
      if (id && (PLAYER.test(side || '') || ENEMY.test(side || ''))) roles.set(`${f.combatId}:${id}`, side);
    }
    if (!(PLAYER.test(p.sourceSide || '') || ENEMY.test(p.sourceSide || ''))
      || !(PLAYER.test(p.targetSide || '') || ENEMY.test(p.targetSide || ''))) {
      known[0] = known[1] = known[2] = false;
      continue;
    }
    if (PLAYER.test(p.sourceSide) && ENEMY.test(p.targetSide)) {
      if (amount(p.hpLoss)) totals[0] += p.hpLoss; else known[0] = false;
    }
    if (ENEMY.test(p.sourceSide) && PLAYER.test(p.targetSide)) {
      if (amount(p.blocked)) totals[1] += p.blocked; else known[1] = false;
      if (amount(p.hpLoss)) totals[2] += p.hpLoss; else known[2] = false;
    }
  }
  // A requested healing amount can include overheal. Only explicit HP deltas
  // count as actual recovery, and the target must be identified as the player.
  known[3] = t.available('combat_resolution');
  for (const f of t.facts.filter(f => f.eventType === 'heal.resolved')) {
    const p = observedPayload(f), side = p.targetSide || roles.get(`${f.combatId}:${p.targetEntityId}`);
    if (ENEMY.test(side || '')) continue;
    if (!PLAYER.test(side || '') || !amount(p.hpBefore) || !amount(p.hpAfter) || p.hpAfter < p.hpBefore) {
      known[3] = false; continue;
    }
    totals[3] += p.hpAfter - p.hpBefore;
  }
  return BATTLE_METRICS.map(([id, label], i) => ({ id, label,
    value: complete && known[i] ? totals[i] : null,
    display: complete && known[i] ? String(totals[i]) : '未记录' }));
}

function runSummary(t, run = {}) {
  const observations = t.facts.filter(f => f.eventType === 'run.observed').map(observedPayload);
  const first = observations[0] || {}, last = observations.at(-1) || {};
  const times = t.facts.map(f => f.occurredAt).filter(Number.isFinite);
  const span = times.reduce((range, at) => [Math.min(range[0], at), Math.max(range[1], at)], [Infinity, -Infinity]);
  const seconds = times.length > 1 ? Math.max(0, Math.floor((span[1] - span[0]) / 1000)) : null;
  return {
    character: run.character || first.character || null,
    ascension: Number.isInteger(run.ascension) ? run.ascension : first.ascension ?? null,
    totalFloor: Number.isFinite(run.finalFloor) ? run.finalFloor : last.totalFloor ?? null,
    act: Number.isInteger(run.finalAct) ? run.finalAct : last.act ?? null,
    floor: Number.isInteger(last.floor) ? last.floor : null,
    result: run.result || (observedPayload(t.facts.find(f => f.eventType === 'run.ended')).cleared === true ? 'win' : null),
    durationLabel: '记录覆盖', durationSeconds: seconds,
    durationDisplay: seconds === null ? '未记录' : `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2, '0')}秒`
  };
}

function choiceStats(t) {
  const actions = new Map();
  for (const f of t.facts.filter(f => f.eventType === 'rest.action_completed')) {
    actions.set(f.actionId || f.decisionId || f.eventId, observedPayload(f).action);
  }
  const stats = [];
  const values = [...actions.values()], unknown = values.some(a => typeof a !== 'string' || !a.trim());
  if (values.some(a => a === 'heal' || a === 'smith')) {
    for (const [action, label] of [['heal', '火堆回血'], ['smith', '火堆升级']]) {
      const count = values.filter(a => a === action).length;
      stats.push({ label, display: unknown && count === 0 ? '未记录' : `${count}次` });
    }
  }
  const growth = observedRelations(t).filter(r => r.kind === 'rest_max_hp_growth');
  if (growth.length) stats.push({ label: '休息增加生命上限', display: `+${growth.reduce((n, r) => n + r.fields.totalGain, 0)}` });
  return stats;
}

module.exports = { BATTLE_METRICS, battleMetrics, runSummary, choiceStats };
