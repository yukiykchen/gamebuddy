const { observedPayload, observedRelations, fixedMetrics, queryMetrics, PLAYER, ENEMY } = require('./facts');

const BATTLE_METRICS = [
  ['total_damage', '累计输出'], ['total_absorbed', '实际抗伤'],
  ['total_taken', '累计受伤'], ['total_healed', '实际恢复']
];

function runHasEnded(t, run) {
  return ['win', 'loss', 'abandoned'].includes(run.result) || t.facts.some(f => f.eventType === 'run.ended');
}

function recordedMetric(id, label, value, ended) {
  if (value == null) return { id, label, value: null, display: '未记录' };
  return { id, label, value, scope: 'recorded', display: ended ? String(value) : `已记录 ${value}` };
}

function recapFixedMetrics(t, run = {}) {
  const metrics = fixedMetrics(t);
  const turnDamage = metrics[0];
  if (turnDamage.value !== null) return metrics;
  const topTurn = queryMetrics(t).find(metric => metric.id === 'highest_turn_actual');
  if (!topTurn) return metrics;
  return [recordedMetric(turnDamage.id, turnDamage.label, topTurn.value, runHasEnded(t, run)), ...metrics.slice(1)];
}

function battleMetrics(t, run = {}) {
  const totals = [null, null, null, null];
  const add = (index, n) => { totals[index] = (totals[index] ?? 0) + n; };
  const roles = new Map();
  const amount = n => Number.isFinite(n) && n >= 0;
  for (const f of t.facts.filter(f => f.eventType === 'damage.resolved')) {
    const p = observedPayload(f);
    for (const [id, side] of [[p.sourceEntityId, p.sourceSide], [p.targetEntityId, p.targetSide]]) {
      if (id && (PLAYER.test(side || '') || ENEMY.test(side || ''))) roles.set(`${f.combatId}:${id}`, side);
    }
    if (PLAYER.test(p.sourceSide || '') && ENEMY.test(p.targetSide || '') && amount(p.hpLoss)) add(0, p.hpLoss);
    if (ENEMY.test(p.sourceSide || '') && PLAYER.test(p.targetSide || '')) {
      if (amount(p.blocked)) add(1, p.blocked);
      if (amount(p.hpLoss)) add(2, p.hpLoss);
    }
  }
  // Healing requests can include overheal. Use only explicit player HP deltas.
  for (const f of t.facts.filter(f => f.eventType === 'heal.resolved')) {
    const p = observedPayload(f), side = p.targetSide || roles.get(`${f.combatId}:${p.targetEntityId}`);
    if (PLAYER.test(side || '') && amount(p.hpBefore) && amount(p.hpAfter) && p.hpAfter >= p.hpBefore) add(3, p.hpAfter - p.hpBefore);
  }
  const ended = runHasEnded(t, run);
  return BATTLE_METRICS.map(([id, label], index) => recordedMetric(id, label, totals[index], ended));
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

module.exports = { BATTLE_METRICS, battleMetrics, recapFixedMetrics, runSummary, choiceStats };
