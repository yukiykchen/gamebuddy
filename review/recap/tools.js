const { fixedMetrics, queryMetrics, inspectSubject, subjectIdOf, observedPayload, observedRelations } = require('./facts');
const { checkClaim } = require('./claims');
const integer = (n, maximum) => ({ type: 'integer', minimum: n, ...(maximum === undefined ? {} : { maximum }) });
const tool = (name, description, properties = {}, required = []) => ({ name, description,
  parameters: { type: 'object', properties, required, additionalProperties: false } });
const str = { type: 'string' }, strings = { type: 'array', items: str };
const DEFINITIONS = [
  tool('get_run_overview', '查看全部战斗、重要选择、分幕状态与已记录关系线索。战斗、选择、状态分别分页；状态每页最多12条。', { cursor: integer(0), choiceCursor: integer(0), observationCursor: integer(0) }),
  tool('find_events', '按overview.eventTypes中的真实事件类型、对象或战斗筛选；每页最多30条，支持分页。', { eventTypes: strings, subjectIds: strings, combatId: str, cursor: integer(0), limit: integer(1, 30) }),
  tool('read_event_window', '读取锚点前后连续事件和已记录快照。前后各最多15条，建议先各2–4条。decision-time仅给锚点之前信息。', { anchorEventId: str, before: integer(0, 15), after: integer(0, 15), includeSnapshots: { type: 'boolean' }, visibilityMode: { enum: ['narrative', 'decision-time'] } }, ['anchorEventId']),
  tool('inspect_subject', '查看对象整场进入手牌/抽牌/使用轨迹与零次覆盖证明；未使用不等于没上手。', { subjectId: str, combatId: str }, ['subjectId', 'combatId']),
  tool('get_mechanic_facts', '读取本地卡牌/遗物/药水和套路知识。版本未匹配仅作参考，不能证明实际触发。', { objectId: str, character: str, anchorEventId: str }, ['objectId']),
  tool('check_claims', '检查结构化断言。支持occurred、event_field、snapshot_field、metric、entity_name、combat_outcome、zero_plays、never_entered_hand、subject_count、sequence、action_link、recorded_relation；关系仅证明记录范围内确定字段，不证明自由因果或反事实。', { claims: { type: 'array', items: { type: 'object' } } }, ['claims'])
];
const sanitize = data => JSON.parse(JSON.stringify(data, (name, value) => /^(seed|seedHash|apiKey|token|secret|password|localPath|sharedMessages)$/i.test(name) ? undefined : value));
const pick = (value, fields) => Object.fromEntries(fields.filter(field => Object.hasOwn(value || {}, field)).map(field => [field, value[field]]));
function queryPayload(f) {
  const payload = observedPayload(f);
  if (f.eventType !== 'run.observed') return payload;
  if (Array.isArray(payload.deck)) payload.deck = payload.deck.map(card => card && pick(card, ['id', 'name', 'upgraded', 'type', 'cost']));
  for (const field of ['relics', 'potions']) {
    if (Array.isArray(payload[field])) payload[field] = payload[field].map(item => item && pick(item, ['id', 'name']));
  }
  return payload;
}
const projection = f => f.eventType === 'run.observed'
  ? { projection: 'compact_run_observed', projectionNote: '保留牌组数组原索引与id/name/upgraded/type/cost；牌面描述请查get_mechanic_facts，缺失字段保持未知。' } : {};
function compactObservation(f) {
  const p = observedPayload(f);
  const state = { eventId: f.eventId, sourceSessionId: f.sourceSessionId, sourceSeq: f.sourceSeq,
    ...pick(p, ['act', 'floor', 'totalFloor', 'hp', 'maxHp', 'gold']) };
  if (Array.isArray(p.deck)) state.deckSize = p.deck.length;
  for (const field of ['relics', 'potions']) {
    if (Array.isArray(p[field])) state[field] = p[field].map(item => pick(item, ['id', 'name']));
  }
  return state;
}
function observationSummary(observations) {
  const acts = new Map();
  for (const observation of observations) {
    const act = observation.act ?? null;
    const row = acts.get(act) || { act, scope: 'recorded', observations: 0,
      first: observation, last: observation, ranges: {} };
    row.observations++; row.last = observation;
    for (const field of ['floor', 'totalFloor', 'hp', 'maxHp', 'gold', 'deckSize']) {
      const n = observation[field];
      if (!Number.isFinite(n) || n < 0) continue;
      const range = row.ranges[field] || { min: { value: n, eventId: observation.eventId }, max: { value: n, eventId: observation.eventId } };
      if (n < range.min.value) range.min = { value: n, eventId: observation.eventId };
      if (n > range.max.value) range.max = { value: n, eventId: observation.eventId };
      row.ranges[field] = range;
    }
    acts.set(act, row);
  }
  return { scope: 'recorded', first: observations[0] || null, last: observations.at(-1) || null,
    byAct: [...acts.values()], limitation: '仅汇总已记录观测；范围极值不是完整战绩，幕内包含重载前后观察，不证明连续成长或治疗。' };
}
function importantChoice(f) {
  const p = observedPayload(f);
  if (f.eventType === 'reward.resolved') return p.result === 'skipped' || p.result === 'selected' && Boolean(p.cardId);
  if (/^(rest\.action_completed|route\.selected|shop\.transaction_completed|event\.option_selected)$/.test(f.eventType)) return true;
  if (f.eventType === 'relic.gained') return Boolean(p.relicId);
  if (/^potion\.(gained|used|discarded)$/.test(f.eventType)) return Boolean(p.potionId);
  return false;
}
function compactChoice(f) {
  const p = observedPayload(f);
  return { eventId: f.eventId, eventType: f.eventType, sourceSeq: f.sourceSeq,
    decisionId: f.decisionId, combatId: f.combatId,
    payload: pick(p, ['action', 'label', 'result', 'cardId', 'upgraded', 'relicId', 'potionId', 'coordinate', 'price', 'status']) };
}
function storyInterestEvidence(t, card) {
  const related = card.relationId ? observedRelations(t).find(relation => relation.relationId === card.relationId) : null;
  const references = new Set(related?.evidenceIds || []);
  const checkedFacts = [];
  for (const claim of (card.assertions || []).slice(0, 16)) {
    if (!claim || claim.type === 'entity_name' || (claim.type === 'sequence' && !Array.isArray(claim.eventIds))) continue;
    const checked = checkClaim(t, claim);
    if (checked.status !== 'supported') continue;
    for (const id of checked.evidenceIds) references.add(id);
    checkedFacts.push({ ...pick(claim, ['type', 'field', 'metricId', 'subjectId', 'combatId', 'eventId', 'snapshotId', 'value']),
      evidenceIds: checked.evidenceIds.slice(0, 8) });
  }
  for (const id of card.evidenceIds || []) references.add(id);
  const events = [], snapshots = [];
  for (const id of references) {
    const fact = t.byId.get(id);
    if (fact && !/^(capture\.|run\.(?:started|resumed|ended)$)/.test(fact.eventType)) {
      if (events.length === 10) continue;
      const payload = queryPayload(fact);
      const state = pick(payload, ['act', 'floor', 'totalFloor', 'turn', 'hp', 'maxHp', 'gold', 'hpBefore', 'hpAfter',
        'hpLoss', 'blocked', 'action', 'cardId', 'cardName', 'cardInstanceId', 'potionId', 'relicId', 'optionId', 'label',
        'result', 'price', 'sourceSide', 'targetSide', 'sourceEntityId', 'targetEntityId', 'victory', 'outcome', 'playerDied']);
      const enemies = payload.combat?.enemies || payload.enemies;
      if (Array.isArray(enemies)) state.enemies = enemies.slice(0, 6).map(enemy => pick(enemy, ['id', 'name', 'hp', 'maxHp', 'intent']));
      if (Array.isArray(payload.potions)) state.potions = payload.potions.slice(0, 5);
      if (Number.isInteger(payload.combat?.turn)) state.turn = payload.combat.turn;
      events.push({ id, type: fact.eventType, combatId: fact.combatId, state });
    }
    const snapshot = t.snapshotsById.get(id);
    if (snapshot && snapshots.length < 4) snapshots.push({ id, ...pick(snapshot, ['combatId', 'turn', 'player', 'enemies']) });
  }
  return sanitize({ events, snapshots, checkedFacts, ...(related ? { relation: related } : {}) });
}

function createTools(t) {
  const eventTypes = [...new Set(t.facts.map(f => f.eventType))].sort();
  const wrap = (data, extra = {}) => ({ runId: t.runId, factsRevision: t.revision, scope: { view: 'effective' },
    evidenceIds: data?.eventIds || data?.events?.map(f => f.eventId) || [], data: sanitize(data),
    coverage: { complete: t.completeRun && !t.blocked, missing: t.blocked ? ['capture_gap_or_resume'] : !t.completeRun ? ['run_boundary'] : [], families: t.coverage.families || {} }, truncated: false, nextCursor: null, ...extra });
  const page = (rows, offset = 0, limit = 15) => ({ rows: rows.slice(offset, offset + limit),
    truncated: rows.length > offset + limit, nextCursor: rows.length > offset + limit ? offset + limit : null, total: rows.length });
  const handlers = {
    get_run_overview(args) {
      const all = [...t.combats.values()].map(c => {
        const started = observedPayload(c.started), ended = observedPayload(c.ended);
        return { combatId: c.combatId, startId: c.started?.eventId, endId: c.ended?.eventId,
          roomType: started.roomType, victory: ended.victory, outcome: ended.outcome,
          enemies: started.enemies, eventCount: c.events.length };
      });
      const battles = page(all, args.cursor || 0);
      const choices = page(t.facts.filter(importantChoice).map(compactChoice), args.choiceCursor || 0, 40);
      const observations = t.facts.filter(f => f.eventType === 'run.observed').map(compactObservation);
      const observationPage = page(observations, args.observationCursor || 0, 12);
      const relations = observedRelations(t);
      return wrap({ result: observedPayload(t.facts.find(f => f.eventType === 'run.ended')), eventTypes,
        metrics: fixedMetrics(t), recordLeads: queryMetrics(t),
        relationLeads: relations.slice(0, 12), relationLeadCount: relations.length, relationLeadsTruncated: relations.length > 12,
        relationLeadsNote: '仅证明关系字段中的记录事实，使用recorded_relation绑定；不能由前后邻接补造来源或因果。',
        recordLeadsNote: '记录范围内的极值锚点，scope=recorded不代表全局完整纪录；先读现场再选材', combats: battles.rows, combatCount: all.length,
        choices: choices.rows, choiceCount: choices.total, choicesTruncated: choices.truncated, choiceNextCursor: choices.nextCursor,
        observations: observationPage.rows, observationCount: observations.length,
        observationsTruncated: observationPage.truncated, observationNextCursor: observationPage.nextCursor,
        observationSummary: observationSummary(observations),
        limitations: ['loss或game_ended_not_cleared只表示未通关结束，不证明死亡。',
          'CARD.模型ID不是唯一牌实例，不能据此证明某张升级副本从未使用。',
          '旧AfterCombatEnd的默认victory:false不可靠；未明确确认的胜负不能作为故事依据。',
          '未确认source或action_link的结算不能归因某张牌；获得格挡不等于实际抗伤。'] },
      { truncated: battles.truncated, nextCursor: battles.nextCursor });
    },
    find_events(args) {
      const unknown = (args.eventTypes || []).filter(type => !eventTypes.includes(type));
      if (unknown.length) return wrap({ error: 'event_type_not_recorded', unknown, availableEventTypes: eventTypes });
      const rows = t.facts.filter(f => {
        const p = observedPayload(f);
        return (!args.eventTypes || args.eventTypes.includes(f.eventType))
        && (!args.combatId || f.combatId === args.combatId)
        && (!args.subjectIds || args.subjectIds.some(id => [subjectIdOf({ payload: p }), p.cardInstanceId, p.combatCardInstanceId,
          p.originDeckCardInstanceId, p.deckCardInstanceId, p.potionInstanceId, p.entityId, p.sourceEntityId, p.targetEntityId].includes(id)));
      });
      const p = page(rows, args.cursor || 0, Math.min(30, args.limit || 15));
      return wrap({ events: p.rows.map(f => ({ eventId: f.eventId, eventType: f.eventType, combatId: f.combatId,
        subjectId: subjectIdOf({ payload: observedPayload(f) }), sourceSeq: f.sourceSeq, payload: queryPayload(f),
        quality: f.quality, ...projection(f) })), total: p.total }, { truncated: p.truncated, nextCursor: p.nextCursor });
    },
    read_event_window(args) {
      const i = t.facts.findIndex(f => f.eventId === args.anchorEventId);
      if (i < 0) return wrap({ error: 'unknown_anchor' }, { coverage: { complete: false, missing: ['anchor'] } });
      const before = Math.min(15, args.before ?? 4), after = args.visibilityMode === 'decision-time' ? 0 : Math.min(15, args.after ?? 4);
      const rows = t.facts.slice(Math.max(0, i - before), i + after + 1);
      return wrap({ events: rows.map(f => {
        const beforeSnapshot = args.includeSnapshots ? t.snapshotsById.get(f.beforeSnapshotId || f.payload?.beforeSnapshotId) || null : undefined;
        if (args.visibilityMode === 'decision-time' && f.eventId === args.anchorEventId) {
          return { eventId: f.eventId, eventType: f.eventType, decisionId: f.decisionId, combatId: f.combatId,
            beforeSnapshot, limitation: '锚点结果及事后信息已隐藏，只能据此前状态检查选择。' };
        }
        return { ...pick(f, ['eventId', 'eventType', 'sourceSessionId', 'sourceSeq', 'occurredAt', 'combatId', 'attemptGeneration', 'actionId', 'parentActionId', 'decisionId', 'quality']),
          payload: queryPayload(f), ...projection(f), beforeSnapshot,
          afterSnapshot: args.includeSnapshots ? t.snapshotsById.get(f.afterSnapshotId || f.payload?.afterSnapshotId) || null : undefined };
      }) });
    },
    inspect_subject(args) { const r = inspectSubject(t, args.subjectId, args.combatId); return wrap(r, { coverage: r.coverage }); },
    get_mechanic_facts(args) {
      const id = args.objectId.toUpperCase();
      const cards = require('../../agent/data/codex/cards.json'), relics = require('../../agent/data/codex/relics.json'), potions = require('../../agent/data/codex/potions.json');
      const item = cards.find(c => c.id === id) || relics.find(r => r.id === id) || potions.find(p => p.id === id);
      const anchor = t.byId.get(args.anchorEventId);
      if (args.anchorEventId && !anchor) return wrap({ error: 'unknown_anchor', objectId: id }, { coverage: { complete: false, missing: ['anchor'] } });
      const lastObservation = t.facts.slice(0, anchor ? t.facts.indexOf(anchor) + 1 : t.facts.length).filter(f => f.eventType === 'run.observed').at(-1);
      const observed = lastObservation ? observedPayload(lastObservation) : null;
      let strategyContext = null;
      if (observed) {
        try { strategyContext = require('../../agent/knowledge/card-guidance').buildStrategyContext(observed.character, observed.deck || [], observed.relics || []); } catch { /* Unknown game data remains unknown. */ }
      }
      return wrap({ objectId: id, status: item ? 'reference_only' : 'unavailable', name: item?.name,
        description: item?.description || item?.description_raw, source: 'bundled_catalog', strategyContext,
        contextScope: anchor ? 'at_or_before_anchor' : 'last_recorded_observation', contextEvidenceId: lastObservation?.eventId || null,
        limitation: '机制参考不证明本场已触发；版本匹配和实际触发需另查事件。' }, { coverage: { complete: false, missing: ['runtime_version_match'] } });
    },
    check_claims(args) { return wrap({ results: args.claims.map(c => checkClaim(t, c)), checkedScope: 'implemented_predicates_only' }); }
  };
  return { names: DEFINITIONS.map(d => d.name), definitions: DEFINITIONS,
    call(name, args = {}) {
      const d = DEFINITIONS.find(row => row.name === name);
      if (!d) return wrap({ error: 'unknown_tool' });
      if (!args || typeof args !== 'object' || Array.isArray(args)) return wrap({ error: 'invalid_arguments' });
      if (Object.keys(args).some(k => !Object.hasOwn(d.parameters.properties, k))) return wrap({ error: 'unknown_argument' });
      for (const k of d.parameters.required) if (!Object.hasOwn(args, k)) return wrap({ error: `missing_${k}` });
      for (const [k, v] of Object.entries(args)) {
        const p = d.parameters.properties[k];
        if (p.type === 'integer' && (!Number.isInteger(v) || v < p.minimum || p.maximum !== undefined && v > p.maximum)
          || p.type === 'string' && (typeof v !== 'string' || v.length > 256)
          || p.type === 'boolean' && typeof v !== 'boolean'
          || p.type === 'array' && (!Array.isArray(v) || v.length > (k === 'claims' ? 12 : 20)
            || p.items?.type === 'string' && v.some(item => typeof item !== 'string'))
          || p.enum && !p.enum.includes(v)) return wrap({ error: `invalid_${k}` });
      }
      try { return handlers[name](args); } catch { return wrap({ error: 'tool_failed' }, { coverage: { complete: false, missing: ['tool_error'] } }); }
    }
  };
}
module.exports = { createTools, checkClaim, DEFINITIONS, sanitize, queryPayload, storyInterestEvidence };
