const {
  scoreIroncladArchetypes,
  impactIroncladArchetypes,
  decorateIroncladArchetypes,
  isIronclad
} = require('./ironclad-archetypes');

function autoStrikeScore(deck, relics = []) {
  return scoreIroncladArchetypes(deck, relics)
    .find(score => score.id === 'auto_strike').score;
}

function legacyImpact(impact) {
  if (!impact) return null;
  const reason = {
    gate: '启动',
    engine: '循环',
    payoff: '输出',
    support: '过牌辅助',
    softAnti: '支线冲突'
  }[impact.role] || (impact.reason === '仅增加牌组厚度' ? '稀释'
    : /打击弹药|打击牌供给/.test(impact.reason) ? '弹药'
    : impact.deltaPoints < 0 ? '稀释'
      : impact.reason);
  return { ...impact, reason };
}

function autoStrikeImpact(deck, relics, candidate) {
  return legacyImpact(impactIroncladArchetypes(deck, relics, candidate)
    ?.find(impact => impact.id === 'auto_strike') || null);
}

function decorateAutoStrikeCards(character, deck, relics, candidates) {
  const decorated = decorateIroncladArchetypes(character, deck, relics, candidates);
  if (decorated === candidates) return candidates;
  return decorated.map(card => card?.archetypeImpact
    ? { ...card, archetypeImpact: legacyImpact(card.archetypeImpact) }
    : card);
}

const DRAFT_ARCHETYPE_IDS = Object.freeze(['auto_strike', 'exhaust', 'strength', 'block']);
const DRAFT_ARCHETYPE_STAGES = new Set(['unformed', 'started', 'formed']);

function draftArchetypes(card) {
  if (!Array.isArray(card?.archetypeImpacts) || card.archetypeImpacts.length !== DRAFT_ARCHETYPE_IDS.length) {
    return null;
  }
  const byId = new Map(card.archetypeImpacts.map(impact => [impact?.id, impact]));
  if (byId.size !== DRAFT_ARCHETYPE_IDS.length) return null;
  const archetypes = DRAFT_ARCHETYPE_IDS.map(id => {
    const impact = byId.get(id);
    if (!impact || !Number.isInteger(impact.deltaPoints)
      || impact.deltaPoints < -100 || impact.deltaPoints > 100) return null;
    if (!Number.isInteger(impact.beforeScore) || impact.beforeScore < 0 || impact.beforeScore > 100
      || !Number.isInteger(impact.afterScore) || impact.afterScore < 0 || impact.afterScore > 100
      || impact.deltaPoints !== impact.afterScore - impact.beforeScore
      || !DRAFT_ARCHETYPE_STAGES.has(impact.beforeStage)
      || !DRAFT_ARCHETYPE_STAGES.has(impact.afterStage)
      || !Array.isArray(impact.completedAxes)
      || impact.completedAxes.some(axis => typeof axis !== 'string' || !axis)) return null;
    const entry = {
      id,
      deltaPoints: impact.deltaPoints,
      reason: typeof impact.reason === 'string' && impact.reason ? impact.reason : undefined,
      beforeScore: impact.beforeScore,
      afterScore: impact.afterScore,
      beforeStage: impact.beforeStage,
      afterStage: impact.afterStage,
      completedAxes: [...impact.completedAxes]
    };
    if (typeof impact.started === 'boolean') entry.started = impact.started;
    if (Number.isInteger(impact.readiness)) entry.readiness = impact.readiness;
    if (typeof impact.status === 'string') entry.status = impact.status;
    if (typeof impact.beforeStatus === 'string') entry.beforeStatus = impact.beforeStatus;
    if (typeof impact.afterStatus === 'string') entry.afterStatus = impact.afterStatus;
    for (const field of ['presentFunctions', 'missingFunctions', 'completedFunctions', 'beforePresentFunctions', 'beforeMissingFunctions']) {
      if (Array.isArray(impact[field])) entry[field] = impact[field].map(item => ({ ...item }));
    }
    for (const field of ['affinity', 'deltaExact', 'referenceId', 'referenceName', 'beforeReferenceName', 'confidence', 'beforeConfidence', 'learningTag', 'beforeIdentity', 'afterIdentity', 'ruleVersion']) {
      if (impact[field] !== undefined) entry[field] = impact[field];
    }
    return entry;
  });
  return archetypes.includes(null) ? null : archetypes;
}

function draftImpactMessage(rewardEvent, character, cards) {
  if (rewardEvent?.name !== 'card.reward.opened'
    || !isIronclad(character)
    || !rewardEvent.data?.signature
    || !Array.isArray(cards)) return null;
  const impacts = cards.map(card => {
    const archetypes = draftArchetypes(card);
    if (!card?.id || !archetypes) return null;
    const impact = legacyImpact(card.archetypeImpacts.find(item => item.id === 'auto_strike'));
    return {
      cardId: card.id,
      deltaPoints: archetypes[0].deltaPoints,
      reason: impact.reason || undefined,
      archetypes
    };
  });
  return impacts.length && !impacts.includes(null)
    ? { type: 'draft_impact', signature: rewardEvent.data.signature, impacts }
    : null;
}

module.exports = {
  autoStrikeScore,
  autoStrikeImpact,
  decorateAutoStrikeCards,
  DRAFT_ARCHETYPE_IDS,
  draftImpactMessage,
  isIronclad
};
