const { inspectSubject, fixedMetrics, observedPayload, observedRelations } = require('./facts');
const get = (object, path) => String(path || '').split('.').reduce((v, k) =>
  !['__proto__', 'constructor', 'prototype'].includes(k) && v != null && Object.hasOwn(v, k) ? v[k] : undefined, object);
const verdict = (ok, evidenceIds = [], reason) => ({ status: ok === null ? 'insufficient_evidence' : ok ? 'supported' : 'contradicted', evidenceIds, ...(reason ? { reason } : {}) });
function checkClaim(t, c) {
  if (!c || typeof c !== 'object') return verdict(null, [], 'invalid_claim');
  const f = t.byId.get(c.eventId);
  if (c.type === 'occurred') return verdict(f ? (!c.eventType || f.eventType === c.eventType) : null, f ? [f.eventId] : []);
  if (c.type === 'event_field' || c.type === 'damage_value' || c.type === 'snapshot_field') {
    const object = c.type === 'snapshot_field' ? t.snapshotsById.get(c.snapshotId) : f;
    const id = c.type === 'snapshot_field' ? c.snapshotId : c.eventId;
    const path = c.type === 'snapshot_field' ? c.field : `payload.${c.field}`;
    const observed = get(c.type === 'snapshot_field' ? object : { ...object, payload: observedPayload(object) }, path);
    if (observed == null || (object?.quality?.unknownFields || []).some(k => path === k || path.startsWith(`${k}.`) || path === `payload.${k}` || path.startsWith(`payload.${k}.`))) return verdict(null, [], 'unknown_field');
    return { ...verdict(JSON.stringify(observed) === JSON.stringify(c.value), [id]), value: observed };
  }
  if (c.type === 'recorded_relation') {
    const relation = observedRelations(t).find(r => r.relationId === c.relationId);
    const observed = relation?.fields[c.field];
    return observed == null ? verdict(null, [], 'unknown_relation_field')
      : { ...verdict(observed === c.value, relation.evidenceIds), value: observed, scope: 'recorded' };
  }
  if (c.type === 'metric') {
    const m = fixedMetrics(t).find(row => row.id === c.metricId);
    return m?.value == null ? verdict(null, [], 'metric_unavailable')
      : { ...verdict(m.value === c.value), value: m.value };
  }
  if (c.type === 'entity_name') {
    const r = inspectSubject(t, c.subjectId, c.combatId);
    return r.name ? { ...verdict(r.name === c.value, r.eventIds), value: r.name, source: r.nameSource } : verdict(null, [], 'unknown_entity_name');
  }
  if (c.type === 'combat_outcome') {
    const combat = t.combats.get(c.combatId);
    const p = observedPayload(combat?.ended);
    const wanted = c.victory ?? c.value;
    if (!p || typeof p.victory !== 'boolean') return verdict(null);
    if (wanted === 'death') {
      const end = t.facts.find(row => row.eventType === 'run.ended');
      const last = [...t.combats.values()].at(-1);
      const died = p.playerDied === true || p.outcome === 'death' || last?.combatId === c.combatId && end?.payload?.reason === 'death';
      return verdict(died ? true : null, [combat.ended.eventId, ...(end && died ? [end.eventId] : [])]);
    }
    if (wanted === 'defeat' && p.outcome === 'abandoned') return verdict(false, [combat.ended.eventId], 'abandonment_is_not_defeat');
    return verdict(p.victory === (wanted === true || wanted === 'victory'), [combat.ended.eventId]);
  }
  if (['zero_plays', 'never_entered_hand', 'subject_count'].includes(c.type)) {
    const r = inspectSubject(t, c.subjectId, c.combatId);
    if (c.type === 'zero_plays') return verdict(r.neverPlayed ? true : r.playCount ? false : null, r.eventIds, r.coverage.missing.join(','));
    if (c.type === 'never_entered_hand') return verdict(r.neverEnteredHand ? true : r.handObserved || r.handEntryCount || r.playCount ? false : null, r.eventIds, r.coverage.missing.join(','));
    if (!['playCount', 'drawCount', 'handEntryCount'].includes(c.field)) return verdict(null);
    const complete = c.field === 'playCount' ? r.coverage.complete : r.coverage.entryComplete;
    return { ...verdict(complete ? r[c.field] === c.value : null, r.eventIds, complete ? undefined : 'incomplete_subject_range'), value: complete ? r[c.field] : null };
  }
  if (c.type === 'sequence') {
    const positions = (c.eventIds || []).map(id => t.facts.findIndex(fact => fact.eventId === id));
    return verdict(positions.length >= 2 && positions.every(n => n >= 0) ? positions.every((n, i) => !i || n > positions[i - 1]) : null, c.eventIds || []);
  }
  if (c.type === 'action_link') {
    const cause = t.byId.get(c.causeEventId), effect = t.byId.get(c.effectEventId);
    return verdict(cause?.actionId && effect ? effect.actionId === cause.actionId || effect.parentActionId === cause.actionId : null,
      [cause?.eventId, effect?.eventId].filter(Boolean));
  }
  return verdict(null, [], 'unsupported_claim_type_or_counterfactual');
}
module.exports = { checkClaim, get };
