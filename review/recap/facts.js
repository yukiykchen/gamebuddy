const crypto = require('node:crypto');
const METRIC_LABELS = ['最高回合实际爆发', '最高斩杀', '实际抗伤', 'SL次数'];
const PLAYER = /^(player|players|hero|ally|friendly)$/i;
const ENEMY = /^(enemy|enemies|monster|hostile)$/i;
const value = n => Number.isFinite(n) && n >= 0 ? n : null;
const key = f => `${f.sourceSessionId}:${f.sourceSeq}`;
const idOf = p => p?.originDeckCardInstanceId || p?.deckCardInstanceId || p?.cardInstanceId || p?.combatCardInstanceId || p?.potionInstanceId || null;
const subjectIdOf = f => idOf(f.payload);
function observedPayload(f) {
  const payload = { ...(f?.payload || {}) };
  for (const raw of f?.quality?.unknownFields || []) {
    const field = raw.startsWith('payload.') ? raw.slice(8) : raw;
    const parts = field.split('.');
    if (parts.some(k => ['__proto__', 'constructor', 'prototype'].includes(k))) continue;
    let parent = payload;
    for (const part of parts.slice(0, -1)) {
      if (!Object.hasOwn(parent, part) || !parent[part] || typeof parent[part] !== 'object') { parent = null; break; }
      parent[part] = Array.isArray(parent[part]) ? [...parent[part]] : { ...parent[part] };
      parent = parent[part];
    }
    if (parent) delete parent[parts.at(-1)];
  }
  // Historical AfterCombatEnd used FirstOrDefault<bool>(); absence of a bool
  // was serialized as false. That payload is an observation, not a defeat proof.
  if (f?.eventType === 'combat.ended' && payload.victory === false
    && payload.details?.hook === 'AfterCombatEnd' && !payload.outcome && payload.playerDied !== true)
    delete payload.victory;
  return payload;
}
const isHand = name => /^(hand|手牌)$/i.test(String(name || ''));

function makeTimeline(runId, facts, coverage = {}, snapshots = []) {
  const unique = [...new Map(facts.filter(f => f.runId === runId).map(f => [f.eventId, f])).values()];
  // Sequence numbers and milliseconds must never be compared as one quantity.
  const sessions = new Map();
  for (const f of unique) {
    const at = f.receivedAt ?? f.occurredAt ?? 0;
    sessions.set(f.sourceSessionId, Math.min(sessions.get(f.sourceSessionId) ?? Infinity, at));
  }
  unique.sort((a, b) => a.sourceSessionId === b.sourceSessionId ? a.sourceSeq - b.sourceSeq
    : sessions.get(a.sourceSessionId) - sessions.get(b.sourceSessionId)
      || String(a.sourceSessionId).localeCompare(String(b.sourceSessionId)));
  const generations = new Map();
  for (const f of unique) if (f.combatId && Number.isInteger(f.attemptGeneration)) {
    generations.set(f.combatId, Math.max(generations.get(f.combatId) ?? 0, f.attemptGeneration));
  }
  const ordered = unique.filter(f => !f.combatId || f.eventType === 'run.reload_observed'
    || f.attemptGeneration === generations.get(f.combatId));
  const gaps = coverage.gaps || [];
  const resumedWithoutContinuousCapture = ordered.some(f => f.eventType === 'run.resumed'
    && !ordered.some(start => start.eventType === 'run.started' && start.sourceSessionId === f.sourceSessionId));
  const blocked = resumedWithoutContinuousCapture || gaps.length > 0 || (coverage.health || []).some(f => ['recovered_corrupt_tail', 'write_failed'].includes(f.type));
  const available = family => coverage.families?.[family]?.state === 'available';
  const combats = new Map();
  for (const f of ordered) {
    if (!f.combatId || f.eventType === 'run.reload_observed') continue;
    const c = combats.get(f.combatId) || { combatId: f.combatId, events: [], started: null, ended: null };
    c.events.push(f);
    if (f.eventType === 'combat.started') c.started = f;
    if (f.eventType === 'combat.ended') c.ended = f;
    combats.set(f.combatId, c);
  }
  const allSnapshots = [...snapshots, ...ordered.filter(f => f.eventType === 'context.snapshot').map(f => f.payload?.snapshot)].filter(Boolean);
  const snapshotsById = new Map(allSnapshots.filter(s => s.runId === runId).map(s => [s.snapshotId, s]));
  const revision = crypto.createHash('sha256').update(JSON.stringify({ facts: ordered, coverage,
    snapshots: [...snapshotsById.values()] })).digest('hex').slice(0, 24);
  const completeRun = ordered.some(f => f.eventType === 'run.started') && ordered.some(f => f.eventType === 'run.ended') && !blocked;
  const completeCombat = (combatId, family) => {
    const c = combats.get(combatId);
    return Boolean(c?.started && c?.ended && !blocked && available(family)
      && c.events.every(f => f.attemptGeneration === c.ended.attemptGeneration));
  };
  return { runId, facts: ordered, byId: new Map(ordered.map(f => [f.eventId, f])), combats,
    snapshotsById, revision, coverage, blocked, available, completeRun, completeCombat };
}

function fixedMetrics(t) {
  const turns = new Map(), phase = new Map();
  let maximumKill = null, absorbed = 0, fields = true, sides = true, lethal = true;
  for (const f of t.facts) {
    const p = observedPayload(f);
    if (f.eventType === 'turn.started') {
      phase.set(f.combatId, { turn: p.turn, side: p.side });
      if (PLAYER.test(p.side || '') && Number.isInteger(p.turn)) turns.set(`${f.combatId}:${f.attemptGeneration}:${p.turn}`, turns.get(`${f.combatId}:${f.attemptGeneration}:${p.turn}`) || 0);
    }
    if (f.eventType !== 'damage.resolved') continue;
    if (!(PLAYER.test(p.sourceSide || '') || ENEMY.test(p.sourceSide || ''))
      || !(PLAYER.test(p.targetSide || '') || ENEMY.test(p.targetSide || ''))) sides = false;
    if (PLAYER.test(p.sourceSide || '') && ENEMY.test(p.targetSide || '')) {
      const turn = p.turn ?? phase.get(f.combatId)?.turn;
      const side = p.side || phase.get(f.combatId)?.side;
      if (!(PLAYER.test(side || '') || ENEMY.test(side || ''))) fields = false;
      // Known enemy-phase poison/retaliation is outside the player-turn metric, not missing data.
      else if (PLAYER.test(side)) {
        if (value(p.hpLoss) === null || !Number.isInteger(turn)) fields = false;
        else { const k = `${f.combatId}:${f.attemptGeneration}:${turn}`; turns.set(k, (turns.get(k) || 0) + p.hpLoss); }
      }
      if (p.fatal === true) {
        if (value(p.resolvedDamageBeforeHpCap) === null) lethal = false;
        else maximumKill = Math.max(maximumKill ?? 0, p.resolvedDamageBeforeHpCap);
      } else if (p.fatal !== false) lethal = false;
    }
    if (PLAYER.test(p.targetSide || '') && ENEMY.test(p.sourceSide || '')) {
      if (value(p.blocked) === null) absorbed = null;
      else if (absorbed !== null) absorbed += p.blocked;
    }
  }
  const complete = t.completeRun && (t.available('damage') || t.available('combat_resolution')) && sides
    && t.combats.size > 0 && [...t.combats.keys()].every(id => t.completeCombat(id, t.available('damage') ? 'damage' : 'combat_resolution'));
  const reloads = new Set(t.facts.filter(f => f.eventType === 'run.reload_observed').map(f => f.payload?.observationId).filter(Boolean));
  const metrics = [complete && fields && turns.size ? Math.max(...turns.values()) : null,
    complete && lethal ? maximumKill === null ? '无斩杀' : maximumKill : null,
    complete ? absorbed : null,
    t.completeRun && t.available('reload_observation') ? reloads.size : reloads.size ? `已记录SL ${reloads.size}次` : null];
  return METRIC_LABELS.map((label, i) => ({ id: ['turn_damage', 'lethal_hit', 'absorbed', 'reloads'][i], label,
    value: metrics[i], display: metrics[i] === null ? '未记录' : String(metrics[i]) }));
}

function inspectSubject(t, subjectId, combatId) {
  const c = t.combats.get(combatId);
  const scope = combatId ? c?.events || [] : t.facts;
  const aliases = new Set([subjectId]);
  for (const f of t.facts) {
    const p = observedPayload(f);
    if ([p.originDeckCardInstanceId, p.deckCardInstanceId, p.cardInstanceId, p.combatCardInstanceId, p.potionInstanceId].includes(subjectId)) {
      for (const id of [p.originDeckCardInstanceId, p.deckCardInstanceId, p.cardInstanceId, p.combatCardInstanceId, p.potionInstanceId]) if (id) aliases.add(id);
    }
  }
  const matches = f => [idOf(f.payload), f.payload?.cardInstanceId, f.payload?.combatCardInstanceId].some(id => aliases.has(id));
  const events = scope.filter(matches);
  const modelId = t.facts.find(f => matches(f) && (f.payload?.cardId || f.payload?.potionId))?.payload;
  const model = modelId?.cardId || modelId?.potionId;
  const runtimeName = events.find(f => f.payload?.cardName || f.payload?.potionName)?.payload;
  const catalog = model ? require('../../agent/data/codex/cards.json').find(card => card.id === model) : null;
  const relevant = f => /^(card\.|potion\.)/.test(f.eventType);
  const ambiguous = scope.some(f => relevant(f) && (!idOf(f.payload) || (f.quality?.unknownFields || []).some(k => /instance|identity/i.test(k)))
    && (!model || !(f.payload?.cardId || f.payload?.potionId) || (f.payload.cardId || f.payload.potionId) === model));
  const playEvents = events.filter(f => f.eventType === 'card.played' && f.payload?.executed !== false);
  const entries = events.filter(f => f.eventType === 'card.drawn'
    || /^(card.moved|card.generated)$/.test(f.eventType) && (isHand(f.payload?.toPile) || f.payload?.enteredHand === true));
  const snapshotEntries = [...t.snapshotsById.values()].filter(s => s.combatId === combatId
    && s.attemptGeneration === c?.ended?.attemptGeneration
    && (s.hand || []).some(card => [idOf(card), card.combatCardInstanceId].some(id => aliases.has(id))));
  const movementUnknown = events.some(f => /^(card.moved|card.generated)$/.test(f.eventType) && !f.payload?.toPile && f.payload?.enteredHand !== true);
  const roster = observedPayload(c?.started).deckInstanceIds;
  const identityKnown = Array.isArray(roster) && roster.some(id => aliases.has(id));
  const complete = Boolean(combatId && t.completeCombat(combatId, 'card_play') && identityKnown && !ambiguous);
  const entryComplete = complete && t.completeCombat(combatId, 'card_movement') && !movementUnknown;
  const playCount = playEvents.length;
  return { subjectId, combatId, modelId: model || null,
    name: runtimeName?.cardName || runtimeName?.potionName || catalog?.name || null,
    nameSource: runtimeName ? 'runtime' : catalog ? 'catalog' : 'unknown', eventIds: events.map(f => f.eventId),
    events: events.map(f => ({ eventId: f.eventId, eventType: f.eventType, payload: f.payload, turn: f.turn ?? f.payload?.turn })),
    playCount, drawCount: events.filter(f => f.eventType === 'card.drawn').length,
    handEntryCount: entries.length, handObserved: snapshotEntries.length > 0,
    neverPlayed: complete && playCount === 0,
    neverEnteredHand: entryComplete && entries.length === 0 && snapshotEntries.length === 0 && playCount === 0,
    coverage: { complete, entryComplete, missing: [
      ...(!identityKnown ? ['card_identity'] : []), ...(!complete ? ['card_play_range_or_identity'] : []),
      ...(!entryComplete ? ['hand_entry_range'] : [])] } };
}

// Compact anchors cover the whole run before the model spends its read budget.
// Partial records remain useful story leads without pretending to be all-run records.
function queryMetrics(t) {
  const best = new Map(), turns = new Map();
  const record = (id, n, evidenceId, combatId, direction = 'max') => {
    if (!Number.isFinite(n) || n < 0) return;
    const previous = best.get(id);
    if (!previous || (direction === 'min' ? n < previous.value : n > previous.value))
      best.set(id, { id, value: n, evidenceIds: [evidenceId], combatId, scope: 'recorded' });
  };
  const phase = new Map();
  for (const f of t.facts) {
    const p = observedPayload(f);
    if (f.eventType === 'turn.started') phase.set(f.combatId, p);
    if (f.eventType === 'damage.resolved' && PLAYER.test(p.sourceSide || '') && ENEMY.test(p.targetSide || '')) {
      record('highest_single_hit', p.resolvedDamageBeforeHpCap, f.eventId, f.combatId);
      if (p.fatal === true) record('highest_lethal_hit', p.resolvedDamageBeforeHpCap, f.eventId, f.combatId);
      if (p.fatal === true && Number.isFinite(p.targetHpBefore) && p.targetHpBefore > 0
        && Number.isFinite(p.resolvedDamageBeforeHpCap) && p.resolvedDamageBeforeHpCap > p.targetHpBefore)
        record('highest_overkill', p.resolvedDamageBeforeHpCap - p.targetHpBefore, f.eventId, f.combatId);
      const turn = p.turn ?? phase.get(f.combatId)?.turn, side = p.side || phase.get(f.combatId)?.side;
      if (PLAYER.test(side || '') && Number.isInteger(turn) && value(p.hpLoss) !== null) {
        const key = `${f.combatId}:${f.attemptGeneration}:${turn}`;
        const row = turns.get(key) || { id: 'highest_turn_actual', value: 0, evidenceIds: [], combatId: f.combatId, turn, scope: 'recorded' };
        row.value += p.hpLoss; row.evidenceIds.push(f.eventId); turns.set(key, row);
      }
    }
    if (f.eventType === 'block.changed' && PLAYER.test(p.entitySide || '')) record('maximum_block', p.current, f.eventId, f.combatId);
  }
  const topTurn = [...turns.values()].sort((a, b) => b.value - a.value)[0];
  if (topTurn) best.set(topTurn.id, topTurn);
  for (const s of t.snapshotsById.values()) {
    const c = t.combats.get(s.combatId);
    if (!c || s.attemptGeneration !== c.ended?.attemptGeneration) continue;
    record('maximum_block', s.player?.block, s.snapshotId, s.combatId);
    if (s.player?.hp > 0) record('lowest_positive_hp', s.player.hp, s.snapshotId, s.combatId, 'min');
  }
  return [...best.values()];
}

function observedStateRows(t) {
  let combat = null, session = null;
  const rows = [];
  t.facts.forEach((f, index) => {
    if (session !== f.sourceSessionId || /^(run.resumed|run.reload_observed)$/.test(f.eventType)) combat = null;
    session = f.sourceSessionId;
    if (f.eventType === 'combat.started') combat = { combatId: f.combatId, attemptGeneration: f.attemptGeneration };
    if (f.eventType === 'combat.ended') combat = null;
    if (f.eventType === 'run.observed') rows.push({ fact: f, payload: observedPayload(f), index, combat });
  });
  return rows;
}

function observedRelations(t) {
  const states = observedStateRows(t), relations = [];
  const continuous = (a, b) => {
    if (a.fact.sourceSessionId !== b.fact.sourceSessionId || (t.coverage.gaps || []).length
      || !Number.isInteger(a.payload.act) || !Number.isInteger(a.payload.floor)
      || a.payload.act !== b.payload.act || a.payload.floor !== b.payload.floor) return false;
    const rows = t.facts.slice(a.index, b.index + 1);
    return rows.every((f, i) => f.sourceSessionId === a.fact.sourceSessionId
      && !/^(run.resumed|run.reload_observed|run.ended)$/.test(f.eventType)
      && (!i || f.sourceSeq === rows[i - 1].sourceSeq + 1));
  };
  const add = (kind, fields, evidenceIds, anchorEventId = evidenceIds[0]) => relations.push({
    relationId: `${kind}:${anchorEventId}`, kind, fields, evidenceIds: [...new Set(evidenceIds)], scope: 'recorded',
    limitation: '仅证明记录内的状态关系；不证明触发来源、最终死亡、操作错误或反事实。'
  });
  const nextActAfterRecovery = state => {
    let sourceSeq = state.fact.sourceSeq, floor = state.payload.floor, combatEnded = false;
    for (const f of t.facts.slice(state.index + 1)) {
      if (f.sourceSessionId !== state.fact.sourceSessionId || f.sourceSeq !== sourceSeq + 1
        || /^(run.started|run.resumed|run.reload_observed|run.ended)$/.test(f.eventType)) break;
      sourceSeq = f.sourceSeq;
      if (f.combatId && (f.combatId !== state.combat.combatId || f.attemptGeneration !== state.combat.attemptGeneration)) break;
      if (f.eventType === 'combat.started' && combatEnded) break;
      if (f.eventType === 'combat.ended') combatEnded = true;
      if (f.eventType !== 'run.observed') continue;
      const p = observedPayload(f);
      if (!Number.isInteger(p.act) || !Number.isInteger(p.floor) || p.floor < 0
        || p.act < state.payload.act || p.act === state.payload.act && p.floor < floor) break;
      if (p.act > state.payload.act) return f;
      floor = p.floor;
    }
    return null;
  };
  for (let i = 1; i < states.length; i++) {
    const a = states[i - 1], b = states[i];
    if (a.payload.hp === 0 && value(b.payload.hp) > 0 && a.combat
      && a.combat.combatId === b.combat?.combatId && a.combat.attemptGeneration === b.combat?.attemptGeneration
      && continuous(a, b)) {
      const nextAct = nextActAfterRecovery(b);
      add('health_recovery', { hpBefore: 0, hpAfter: b.payload.hp,
        act: b.payload.act, floor: b.payload.floor, ...(nextAct ? { nextAct: observedPayload(nextAct).act } : {}) },
      [a.fact.eventId, b.fact.eventId, ...(nextAct ? [nextAct.eventId] : [])]);
    }
  }
  const growth = new Map();
  for (const f of t.facts.filter(f => f.eventType === 'rest.action_completed' && observedPayload(f).action === 'heal')) {
    const i = t.facts.indexOf(f), a = states.findLast(s => s.index < i), b = states.find(s => s.index > i);
    if (!a || !b || b.index - a.index > 64 || !continuous(a, b)
      || value(a.payload.maxHp) === null || value(b.payload.maxHp) === null || b.payload.maxHp <= a.payload.maxHp) continue;
    const actions = t.facts.slice(a.index + 1, b.index).filter(e => e.eventType === 'rest.action_completed');
    if (actions.length !== 1) continue;
    const gain = b.payload.maxHp - a.payload.maxHp;
    const rows = growth.get(gain) || [];
    rows.push({ before: a.fact.eventId, rest: f.eventId, after: b.fact.eventId }); growth.set(gain, rows);
  }
  for (const [gain, all] of growth) {
    const rows = all.slice(0, 6); // Each group keeps all of its proof within the card evidence budget.
    if (rows.length < 3) continue;
    add('rest_max_hp_growth', { restCount: rows.length, perRestGain: gain, totalGain: rows.length * gain },
      rows.flatMap(r => [r.before, r.rest, r.after]));
  }
  const endIndex = t.facts.findIndex(f => f.eventType === 'run.ended');
  const last = states.findLast(s => s.index < endIndex);
  if (last && last.fact.sourceSessionId === t.facts[endIndex].sourceSessionId
    && value(last.payload.hp) > 0 && value(last.payload.maxHp) > 0 && last.payload.hp / last.payload.maxHp <= 0.25
    && Array.isArray(last.payload.potions) && last.payload.potions.length >= 2) {
    const names = last.payload.potions.map(p => p?.name);
    const fields = { hp: last.payload.hp, maxHp: last.payload.maxHp,
      potionCount: last.payload.potions.length,
      ...(names.every(n => typeof n === 'string' && n.trim()) ? { potionNames: names.join('和') } : {}) };
    const evidenceIds = [];
    if (last.combat && Number.isInteger(last.payload.act) && Number.isInteger(last.payload.floor)) {
      const starts = t.facts.slice(0, last.index).filter(f => f.eventType === 'combat.started'
        && f.combatId === last.combat.combatId && f.attemptGeneration === last.combat.attemptGeneration);
      const start = starts[0], startIndex = start ? t.facts.indexOf(start) : -1;
      const earlier = states.findLast(s => s.index < startIndex && s.fact.sourceSessionId === last.fact.sourceSessionId
        && s.payload.act === last.payload.act && s.payload.floor === last.payload.floor);
      // Two explicit observations can establish a contrast despite missing sequences.
      // Scene/reload ambiguity still forbids assigning a stale observation to this fight.
      const sameScene = earlier && !earlier.combat && t.facts.slice(earlier.index, last.index + 1).every((f, offset) => {
        if (f.sourceSessionId !== last.fact.sourceSessionId || /^(run.resumed|run.reload_observed|run.ended|combat.ended)$/.test(f.eventType)) return false;
        if ((f.eventType === 'combat.started' || earlier.index + offset >= startIndex) && f.combatId
          && (f.combatId !== last.combat.combatId || f.attemptGeneration !== last.combat.attemptGeneration)) return false;
        if (earlier.index + offset > startIndex && /^(route.selected|map.observed)$/.test(f.eventType)) return false;
        const p = observedPayload(f);
        return f.eventType !== 'run.observed' || p.act === last.payload.act && p.floor === last.payload.floor;
      });
      if (sameScene && value(earlier.payload.hp) > last.payload.hp) {
        fields.hpEarlier = earlier.payload.hp;
        evidenceIds.push(earlier.fact.eventId, start.eventId);
        const namedStart = starts.findLast(f => {
          const enemies = observedPayload(f).enemies;
          return Array.isArray(enemies) && enemies.length > 0 && enemies.every(e => typeof e?.name === 'string' && e.name.trim());
        });
        if (namedStart) {
          fields.enemyName = [...new Set(observedPayload(namedStart).enemies.map(e => e.name))].join('、');
          evidenceIds.push(namedStart.eventId);
        }
      }
    }
    evidenceIds.push(last.fact.eventId, t.facts[endIndex].eventId);
    add('low_hp_inventory', fields, evidenceIds, last.fact.eventId);
  }
  return [...relations, ...require('./choice-relations').choiceRelations(t, states, observedPayload)];
}

module.exports = { makeTimeline, fixedMetrics, queryMetrics, inspectSubject, subjectIdOf, key, PLAYER, ENEMY, observedPayload,
  observedStateRows, observedRelations };
