const { inspectSubject, observedPayload, observedRelations } = require('./facts');
const { checkClaim } = require('./claims');

function story(timeline, candidate) {
  const p = candidate || {};
  const fact = timeline.byId.get(p.eventId);
  if (!fact || fact.runId !== timeline.runId) return null;
  if ((p.pattern === 'upgrade_not_used' || p.pattern === 'upgrade_no_energy') && fact.eventType === 'rest.action_completed'
    && observedPayload(fact).action === 'smith' && observedPayload(fact).cardInstanceId) {
    const after = timeline.facts.indexOf(fact);
    const next = timeline.facts.slice(after + 1).find(row => row.eventType === 'combat.started');
    const combat = next && timeline.combats.get(next.combatId);
    if (!combat || observedPayload(combat.ended).victory !== false) return null;
    const id = fact.payload.cardInstanceId;
    const inspection = inspectSubject(timeline, id, next.combatId);
    if (!inspection.neverPlayed) return null;
    const name = String(fact.payload.cardName || fact.payload.cardId || '那张牌');
    if (p.pattern === 'upgrade_no_energy') {
      const draw = combat.events.find(row => row.eventType === 'card.drawn' && row.payload?.cardInstanceId === id
        && row.payload?.unavailableReason === 'insufficient_energy' && row.payload?.playable === false
        && Number.isFinite(row.payload?.cost) && Number.isFinite(row.payload?.energyAtDraw)
        && row.payload.energyAtDraw < row.payload.cost);
      if (!draw) return null;
      return { pattern: p.pattern, verifiedKind: p.pattern, title: '终于等到，没能量',
        body: `${name}终于上手，当时能量不足，这场直到结束也没打出。`,
        evidenceIds: [fact.eventId, draw.eventId, combat.ended.eventId],
        subjectId: id, location: next.combatId };
    }
    if (!inspection.neverEnteredHand) return null;
    return { pattern: p.pattern, verifiedKind: p.pattern, title: '升级了，没用上',
      body: `刚升级的${name}，下一场战斗直到结束也没上手。`,
      evidenceIds: [fact.eventId, next.eventId, combat.ended.eventId],
      subjectId: id, location: next.combatId };
  }
  if (p.pattern === 'overkill' && fact.eventType === 'damage.resolved') {
    const data = observedPayload(fact);
    const resolved = data.resolvedDamageBeforeHpCap;
    const hp = data.targetHpBefore;
    if (!Number.isFinite(resolved) || !Number.isFinite(hp) || hp <= 0 || resolved <= hp
      || data.fatal !== true || !/^(player|hero|ally)$/i.test(String(data.sourceSide || ''))
      || !/^(enemy|monster|hostile)$/i.test(String(data.targetSide || ''))) return null;
    return { pattern: p.pattern, verifiedKind: p.pattern, title: '有点用力过猛',
      body: `目标只剩${hp}血，这次命中结算了${resolved}点伤害。`,
      evidenceIds: [fact.eventId], subjectId: data.targetEntityId || fact.eventId, location: fact.combatId };
  }
  return null;
}

function groundedStory(timeline, candidate, diagnostic = {}, { canonicalizeRelations = true } = {}) {
  const reject = (reason, detail) => { Object.assign(diagnostic, { reason, ...(detail ? { detail } : {}) }); return null; };
  if (!candidate || typeof candidate !== 'object') return reject('invalid_candidate');
  if (!candidate.bodyTemplate) {
    const card = story(timeline, candidate);
    return card || reject('insufficient_story_evidence');
  }
  const { title, bodyTemplate, assertions, evidenceIds, bindings = {} } = candidate;
  if (typeof title !== 'string' || typeof bodyTemplate !== 'string'
    || !Array.isArray(assertions) || !assertions.length || assertions.length > 12
    || !Array.isArray(evidenceIds) || !evidenceIds.length || evidenceIds.length > 20) return reject('invalid_schema');
  if (!evidenceIds.every(id => timeline.byId.has(id) || timeline.snapshotsById.has(id))) return reject('unknown_evidence');
  if (!assertions.every(c => checkClaim(timeline, c).status === 'supported')) return reject('unsupported_assertion');
  // Every direct assertion must cite the actual object it validates, not an unrelated ID.
  if (assertions.some(c => [c.eventId, c.snapshotId, c.causeEventId, c.effectEventId, ...(c.eventIds || [])]
    .filter(Boolean).some(id => !evidenceIds.includes(id)))) return reject('missing_direct_evidence');
  const missing = [...new Set(assertions.filter(c => c.type === 'recorded_relation')
    .flatMap(c => checkClaim(timeline, c).evidenceIds).filter(id => !evidenceIds.includes(id)))];
  if (missing.length) return reject('missing_relation_evidence', { missingEvidenceIds: missing });
  // Narrative observations are supported; unverified normative/counterfactual blame is not.
  const prohibited = /必胜|一定(?:能赢|获胜|打过)|本来(?:能|可以|应该)|操作失误|你(?:打错|选错)|如果[^。！？]*(?:就能|必能)/;
  const chineseNumber = /第[零一二三四五六七八九十百千万两〇、和]+[场次回幕章]|[零一二三四五六七八九十百千万两〇]+(?:次|点|血|层|张|回合|场|刀|击|幕|章)/;
  const literalBody = bodyTemplate.replace(/\{\{[a-zA-Z][\w]*\}\}/g, '');
  if (prohibited.test(title + bodyTemplate)) return reject('unsupported_counterfactual_or_blame');
  if (/死亡|阵亡|牺牲|临死|死前|宁死|战死/.test(title + bodyTemplate)
    && !assertions.some(c => c.type === 'combat_outcome' && (c.value === 'death' || c.victory === 'death')))
    return reject('unproved_player_death');
  if (/\d/.test(title) || /\d/.test(literalBody) || chineseNumber.test((title + literalBody).replace(/下一场|这一场|这一次|那一次|最后一击/g, '')))
    return reject('unbound_number', '标题不得自由写数值；正文包括中文次数、章节等均须绑定。收窄“一次治疗”为“随后恢复”可避免无证次数。');
  const namedClaims = Object.entries(bindings).filter(([name]) => bodyTemplate.includes(`{{${name}}}`))
    .map(([, b]) => assertions[b?.claimIndex]).filter(c => c && (c.type === 'entity_name'
      || c.type === 'event_field' && /^(cardName|cardId|potionName|potionId)$/.test(c.field)));
  const subjects = assertions.filter(c => ['zero_plays', 'never_entered_hand', 'subject_count'].includes(c.type));
  // Identity claims must bind an actual name; the model cannot rename POMMEL_STRIKE
  // as a made-up card in otherwise valid prose.
  if (subjects.some(subject => !namedClaims.some(name => name.type === 'entity_name'
    ? name.subjectId === subject.subjectId
    : inspectSubject(timeline, subject.subjectId, subject.combatId).eventIds.includes(name.eventId)
      || timeline.byId.get(name.eventId)?.payload?.cardId === inspectSubject(timeline, subject.subjectId, subject.combatId).modelId))) return reject('unbound_subject_name');
  // A play count is not a hit count or proof that a particular card caused damage.
  if (subjects.some(c => c.type === 'subject_count') && /命中|每次|每一|削血|造成|伤害|收尾|终结|带飞/.test(bodyTemplate)
    && !assertions.some(c => c.type === 'action_link')) return reject('count_is_not_effect');
  const cardPlays = evidenceIds.map(id => timeline.byId.get(id)).filter(f => f?.eventType === 'card.played');
  const effects = evidenceIds.map(id => timeline.byId.get(id)).filter(f => /^(damage.resolved|block.changed|power.changed)$/.test(f?.eventType || ''));
  if (cardPlays.length && effects.length && /获|提供|造成|挡住|削血|叠加/.test(bodyTemplate)
    && !assertions.some(c => c.type === 'action_link' && cardPlays.some(f => f.eventId === c.causeEventId)
      && effects.some(f => f.eventId === c.effectEventId))) return reject('unproven_effect_attribution');
  let valid = true;
  const body = bodyTemplate.replace(/\{\{([a-zA-Z][\w]*)\}\}/g, (match, name, offset) => {
    const binding = bindings[name];
    if (!binding || !Number.isInteger(binding.claimIndex) || !assertions[binding.claimIndex]) { valid = false; return ''; }
    const claim = assertions[binding.claimIndex];
    const checked = checkClaim(timeline, claim);
    if (!['string', 'number'].includes(typeof checked.value)) { valid = false; return ''; }
    const tail = bodyTemplate.slice(offset + match.length), head = bodyTemplate.slice(0, offset);
    if (/^(?:次|点|血|层|张|回合|场|刀|击)/.test(tail) || /第$/.test(head)) {
      if (typeof checked.value !== 'number') { valid = false; return ''; }
      if (/^次/.test(tail) && !/count|times|index/i.test(claim.field || '') && !(claim.type === 'metric' && claim.metricId === 'reloads')) { valid = false; return ''; }
    }
    if (claim.type === 'event_field' && /^(cardId|potionId|relicId)$/.test(claim.field)) {
      const catalogs = [require('../../agent/data/codex/cards.json'), require('../../agent/data/codex/potions.json'), require('../../agent/data/codex/relics.json')];
      const named = catalogs.flat().find(row => row.id === checked.value)?.name;
      if (!named) { valid = false; return ''; }
      return named;
    }
    return String(checked.value);
  });
  if (!valid) return reject('invalid_binding', '占位符须指向有效断言的标量value；合并potionNames应绑定一个完整字符串，不能拆成两个不同名字。');
  if (/\{\{|\}\}|\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*\b|\b(?:true|false)\b/.test(body)) return reject('machine_identifier_or_unresolved_placeholder');
  const direct = evidenceIds.map(id => timeline.byId.get(id)).filter(Boolean);
  const upgradeOnly = direct.some(f => f.eventType === 'rest.action_completed' && f.payload?.action === 'smith')
    && direct.every(f => ['rest.action_completed', 'combat.started', 'combat.ended', 'run.ended'].includes(f.eventType))
    && assertions.every(c => ['event_field', 'occurred', 'combat_outcome', 'sequence'].includes(c.type));
  if (upgradeOnly) return reject('ordinary_upgrade_background');
  const ordinaryHpChange = direct.length > 0 && direct.every(f => /^event\./.test(f.eventType))
    && assertions.every(c => c.type === 'occurred' || c.type === 'event_field'
      && ['eventId', 'hpLoss', 'hpAfter', 'optionId', 'choice'].includes(c.field));
  if (ordinaryHpChange) return reject('ordinary_health_background');
  const ordinaryMoneyChange = direct.some(f => /^shop\./.test(f.eventType))
    && direct.every(f => /^shop\./.test(f.eventType) || f.eventType === 'run.observed')
    && assertions.every(c => ['occurred', 'sequence'].includes(c.type)
      || c.type === 'event_field' && ['price', 'gold', 'status'].includes(c.field));
  if (ordinaryMoneyChange) return reject('ordinary_transaction_background', '交易金额与余额变化本身不成故事；需补具体用途、代价或后续兑现关系，否则放弃。');
  if (direct.some(f => f.eventType === 'power.changed') && /涨|暴增|增加|增强|提升|叠/.test(title + bodyTemplate)
    && !direct.some(f => f.eventType === 'power.changed' && (observedPayload(f).delta > 0
      || observedPayload(f).amountAfter > observedPayload(f).amountBefore))) return reject('unproven_power_growth');
  // The known relation is a typed positive proposition, not a license to add
  // absence, motive or engineering commentary. The model chooses the relation;
  // its factual sentence is rendered from that relation's checked fields.
  const relationIds = [...new Set(assertions.filter(c => c.type === 'recorded_relation').map(c => c.relationId))];
  if (canonicalizeRelations && relationIds.length === 1
    && assertions.every(c => ['recorded_relation', 'event_field', 'sequence', 'occurred'].includes(c.type))) {
    const relation = observedRelations(timeline).find(r => r.relationId === relationIds[0]);
    const canonical = relation && relationCandidate(relation);
    if (canonical) {
      const rendered = groundedStory(timeline, canonical, diagnostic, { canonicalizeRelations: false });
      return rendered && { ...rendered, rendering: 'canonical_known_relation', verifiedKind: relation.kind };
    }
  }
  if (/证据|未证|只证明|字段|工具|快照|诊断|来源(?:不足|未知|不明)|未核实/.test(title + body)) return reject('engineering_commentary');
  return { pattern: candidate.pattern || 'observed_moment', title, body, evidenceIds,
    assertions, relationId: relationIds.length === 1 ? relationIds[0] : null,
    location: candidate.combatId || '', subjectId: candidate.subjectId || null };
}

function selectStories(timeline, candidates, { deduplicate = true } = {}) {
  const seenEvidence = new Set(), selected = [];
  for (const candidate of Array.isArray(candidates) ? candidates.slice(0, 12) : []) {
    const card = groundedStory(timeline, candidate);
    if (!card || !card.title.trim() || !card.body.trim() || [...card.title].length > 10 || [...card.body].length > 40
      || deduplicate && storyKeys(timeline, card).some(id => seenEvidence.has(id))) continue;
    storyKeys(timeline, card).forEach(id => seenEvidence.add(id)); selected.push(card);
    if (selected.length === (deduplicate ? 3 : 12)) break;
  }
  return selected;
}
function storyKeys(timeline, card) {
  const actionIds = card.evidenceIds.filter(id => !/^(combat\.(started|ended)|run\.ended|context\.snapshot)$/.test(timeline.byId.get(id)?.eventType || ''));
  return actionIds.length ? actionIds : card.evidenceIds;
}
function storyPriority(card) {
  return ({ fairy_kept_rescue: 110, rest_choice_style: 92, resource_choice_style: 91,
    health_recovery: 100, overkill: 95, upgrade_not_used: 90, upgrade_no_energy: 90,
    rest_max_hp_growth: 75, low_hp_inventory: 20 })[card.verifiedKind] ?? 80;
}
function localStories(timeline) {
  const candidates = timeline.facts.flatMap(f => f.eventType === 'rest.action_completed'
    ? [{ pattern: 'upgrade_no_energy', eventId: f.eventId }, { pattern: 'upgrade_not_used', eventId: f.eventId }]
    : f.eventType === 'damage.resolved' ? [{ pattern: 'overkill', eventId: f.eventId }] : []);
  // Filter before the bounded model-candidate selector. A long run can contain
  // hundreds of ordinary damage events before its first actual story.
  const relations = observedRelations(timeline).map(relationCandidate).filter(Boolean);
  const all = [...relations, ...candidates.filter(candidate => story(timeline, candidate))]
    .sort((a, b) => storyPriority({ verifiedKind: b.pattern }) - storyPriority({ verifiedKind: a.pattern }));
  return selectStories(timeline, all);
}
function relationCandidate(relation) {
  const { kind, fields, relationId, evidenceIds } = relation;
  const definitions = {
    fairy_kept_rescue: { title: '瓶中精灵，留对了', bodyTemplate: '没拿{{potionName}}换稀有牌。{{floorGap}}层后{{entryHp}}血进双Boss战仍归零，幸好它来捞人。', fields: ['potionName', 'floorGap', 'entryHp'] },
    rest_choice_style: { title: '火堆是你的家', bodyTemplate: '{{restCount}}次火堆全选回血，{{healthyHp}}/{{healthyMaxHp}}血也不打铁。升级能等，养生不能耽误。', fields: ['restCount', 'healthyHp', 'healthyMaxHp'] },
    resource_choice_style: { title: '惜命不惜债', bodyTemplate: '半血不拿{{bloodCost}}血换遗物，揣着{{gold}}金币却选背债。血得护着，债先欠着。', fields: ['bloodCost', 'gold'] },
    health_recovery: { title: '血条归零又亮起', bodyTemplate: '生命一度降到{{hpBefore}}，随后又回到{{hpAfter}}血。', fields: ['hpBefore', 'hpAfter'] },
    rest_max_hp_growth: { title: '休息也在长血条', bodyTemplate: '记录内{{restCount}}次休息，生命上限每次增加{{perRestGain}}，合计增加{{totalGain}}。', fields: ['restCount', 'perRestGain', 'totalGain'] },
    low_hp_inventory: { title: '药水还在背包', bodyTemplate: '结束前最后记录只剩{{hp}}血，背包仍有{{potionCount}}瓶药水。', fields: ['hp', 'potionCount'] }
  };
  const d = definitions[kind];
  if (!d) return null;
  if (kind === 'health_recovery' && Number.isInteger(fields.nextAct)) {
    d.bodyTemplate = '生命从{{hpBefore}}回到{{hpAfter}}血，接着走进了第{{nextAct}}幕。';
    d.fields = ['hpBefore', 'hpAfter', 'nextAct'];
  }
  // Two concrete names make a short inventory contrast more personal. The final
  // length gate remains authoritative; longer inventories use their observed count.
  if (kind === 'low_hp_inventory' && fields.potionNames && fields.potionCount === 2
    && [...`最后记录只剩${fields.hp}血，${fields.potionNames}仍在背包。`].length <= 40) {
    d.bodyTemplate = '最后记录只剩{{hp}}血，{{potionNames}}仍在背包。'; d.fields = ['hp', 'potionNames'];
  }
  if (kind === 'low_hp_inventory' && Number.isFinite(fields.hpEarlier) && fields.hpEarlier > fields.hp) {
    d.title = '血掉了，药还在';
    d.bodyTemplate = '这场记录从{{hpEarlier}}血降到{{hp}}血，背包仍有{{potionCount}}瓶药水。';
    d.fields = ['hpEarlier', 'hp', 'potionCount'];
    if (fields.enemyName && [...`对上${fields.enemyName}，${fields.hpEarlier}血降到${fields.hp}血，背包仍有${fields.potionCount}瓶药水。`].length <= 40) {
      d.bodyTemplate = '对上{{enemyName}}，{{hpEarlier}}血降到{{hp}}血，背包仍有{{potionCount}}瓶药水。';
      d.fields = ['enemyName', ...d.fields];
    }
  }
  return { pattern: kind, relationId, title: d.title, bodyTemplate: d.bodyTemplate, evidenceIds,
    assertions: d.fields.map(field => ({ type: 'recorded_relation', relationId, field, value: fields[field] })),
    bindings: Object.fromEntries(d.fields.map((field, claimIndex) => [field, { claimIndex }])) };
}

function localClosing(cards) {
  const kinds = new Set(cards.map(c => c.verifiedKind).filter(Boolean));
  if (kinds.has('fairy_kept_rescue') && kinds.has('rest_choice_style') && kinds.has('resource_choice_style'))
    return '火堆边养生，事件里背债，Boss面前靠精灵续命——这局，命是真硬。';
  if (kinds.has('fairy_kept_rescue')) return '当初留下的瓶中精灵，后来真的替你续上了命。';
  if (kinds.has('rest_choice_style') && kinds.has('resource_choice_style')) return '火堆边养生，事件里背债：这局主打一个惜命不惜债。';
  if (kinds.has('rest_choice_style')) return '牌能慢慢升，血得先补好，这局把稳健写在了篝火边。';
  if (kinds.has('resource_choice_style')) return '血条得护着，债可以先欠着：这局的账算得很有个性。';
  if (kinds.has('health_recovery') && kinds.has('rest_max_hp_growth')) return '血条归零后再次亮起，多次休息也积累了更长的生命上限。';
  if (kinds.has('health_recovery')) return '血条曾经归零，随后又重新亮起。';
  if (kinds.has('rest_max_hp_growth')) return '多次休息，积累出了更长的生命上限。';
  if (kinds.has('low_hp_inventory')) return '血量已低，最后记录里仍有留在背包的药水。';
  return cards.length ? '这些选择与转折，留下了值得回味的片段。' : '';
}
function localPortrait(cards) {
  const kinds = new Set(cards.map(c => c.verifiedKind));
  if (kinds.has('rest_choice_style') && kinds.has('resource_choice_style')) return '惜命不惜债';
  if (kinds.has('fairy_kept_rescue')) return '福大命大的爬塔客';
  if (kinds.has('rest_choice_style')) return '篝火边的养生派';
  if (kinds.has('resource_choice_style')) return '血条精打细算，欠债另说';
  return '';
}
function candidateDiagnostics(timeline, candidates) {
  return (Array.isArray(candidates) ? candidates.slice(0, 12) : []).map((c, index) => {
    const diagnostic = {}, card = groundedStory(timeline, c, diagnostic);
    const lengths = card && { title: [...card.title].length, body: [...card.body].length };
    if (card && (lengths.title > 10 || lengths.body > 40 || !card.title.trim() || !card.body.trim())) diagnostic.reason = 'rendered_length_or_empty';
    return { index, title: c?.title, accepted: Boolean(card && !diagnostic.reason), ...diagnostic, ...(lengths ? { renderedLengths: lengths } : {}),
    claims: (Array.isArray(c?.assertions) ? c.assertions : []).map((claim, i) => ({ index: i,
      ...checkClaim(timeline, claim), ...(!claim.type ? { reason: '每条断言必须有type字段；使用扁平对象，不能用{event_field:{...}}' } : {}),
      ...(claim.type === 'snapshot_field' && timeline.byId.get(claim.snapshotId)?.eventType === 'run.observed'
        ? { repairHint: 'run.observed是事件：改用event_field，eventId取原snapshotId，field去掉payload.前缀；不能使用不存在的deckSize字段。' } : {}) })),
    bindings: Object.entries(c?.bindings || {}).map(([name, binding]) => ({ name, claimIndex: binding?.claimIndex,
      valid: Number.isInteger(binding?.claimIndex) && Boolean(c?.assertions?.[binding.claimIndex]),
      field: c?.assertions?.[binding?.claimIndex]?.field })),
    reminder: '按实际绑定后长度检查：标题10字、正文40字；完整引用关系所有evidenceIds；无法支持的候选应放弃，不用普通经过凑数。' };
  });
}
module.exports = { story, groundedStory, selectStories, localStories, candidateDiagnostics, storyKeys, storyPriority, localClosing, localPortrait };
