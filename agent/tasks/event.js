const { SCHEMA } = require('../recommendation');
const { analyzeEventChoices } = require('../knowledge/event-rules');

function eventOptions(state) {
  return Array.isArray(state?.event?.options)
    ? state.event.options.filter(option => option && typeof option.label === 'string' && option.label.trim())
    : [];
}

function choosableEventOptions(state) {
  return eventOptions(state).filter(option => option.locked !== true);
}

function namedList(items) {
  return (Array.isArray(items) ? items : [])
    .map(item => {
      if (!item) return '';
      if (typeof item === 'string') return item;
      const name = item.name || item.label || item.id || '';
      return item.upgraded ? `${name}+` : name;
    })
    .filter(Boolean);
}

function recommendationOption(option) {
  return {
    action: 'CHOOSE_EVENT',
    optionIndex: option.index,
    optionId: option.optionId,
    label: option.label,
    description: option.description,
    analysis: option.analysis
  };
}

function eventReason(chosen) {
  const pros = chosen.analysis?.pros || [];
  const cons = chosen.analysis?.cons || [];
  const benefit = pros.length ? `主要收益是${pros.slice(0, 2).join('、')}` : '该选项没有额外的已确认收益';
  const risk = cons.length ? `；需要承担${cons.slice(0, 2).join('、')}` : '；当前没有识别到直接代价';
  return `建议选择「${chosen.label}」：${benefit}${risk}。`;
}

function buildEventRecommendation(state, analyzed, { source = 'rules', reason, now = Date.now(), selectedIndex } = {}) {
  const options = analyzed?.options || [];
  const chosen = options.find(option => option.index === selectedIndex) || null;
  if (!chosen) return null;
  const eventKind = state?.event?.kind === 'ancient' ? 'ancient' : 'event';
  return {
    schema: SCHEMA,
    task: 'event_choice',
    timestamp: now,
    source,
    confidence: Math.min(0.95, Math.max(0.25, (chosen.analysis?.confidence || 0.45) + (source === 'llm' ? 0.04 : 0))),
    eventKind,
    eventTitle: state?.event?.title || '',
    eventKnowledge: analyzed.eventKnowledge,
    reason: reason || eventReason(chosen),
    primary: recommendationOption(chosen),
    alternatives: options
      .filter(option => option.index !== chosen.index)
      .map(recommendationOption)
  };
}

function eventPromptPayload(state, analyzed = analyzeEventChoices(state)) {
  return {
    kind: state?.event?.kind === 'ancient' ? 'ancient' : 'event',
    title: state?.event?.title || '',
    description: state?.event?.description || '',
    hp: state?.player?.hp,
    maxHp: state?.player?.maxHp,
    gold: state?.player?.gold,
    energyPerTurn: state?.player?.maxEnergy,
    relics: namedList(state?.player?.relics),
    potions: namedList(state?.player?.potions),
    deck: namedList(state?.player?.cards),
    eventKnowledge: analyzed.eventKnowledge,
    allowedIndexes: analyzed.options.filter(option => option.analysis?.eligible).map(option => option.index),
    options: analyzed.options.map(option => ({
      index: option.index,
      optionId: option.optionId,
      label: option.label,
      description: option.description,
      analysis: option.analysis
    }))
  };
}

async function recommendEvent(state, { llm, now = Date.now() } = {}) {
  if (!choosableEventOptions(state).length) return null;
  const analyzed = analyzeEventChoices(state);
  const ranked = analyzed.options
    .filter(option => option.analysis?.eligible && option.analysis?.comparable)
    .sort((left, right) => right.analysis.score - left.analysis.score || left.index - right.index);
  const rulesPick = ranked[0] || null;
  if (!rulesPick) return null;
  if (llm?.enabled && typeof llm.completeEvent === 'function') {
    try {
      const pick = await llm.completeEvent(eventPromptPayload(state, analyzed));
      const index = Number(pick?.index);
      const modelPick = analyzed.options.find(option => option.index === index && option.analysis?.eligible);
      if (Number.isInteger(index) && modelPick) {
        return buildEventRecommendation(state, analyzed, {
          source: 'llm',
          reason: typeof pick.reason === 'string' && pick.reason.trim() ? pick.reason.trim() : undefined,
          now,
          selectedIndex: index
        });
      }
    } catch {
      // Fall through to the deterministic, safety-gated rules result.
    }
  }
  return buildEventRecommendation(state, analyzed, { now, selectedIndex: rulesPick.index });
}

function eventSignature(state) {
  return JSON.stringify({
    room: state?.run?.room || null,
    eventId: state?.event?.eventId || null,
    pageId: state?.event?.pageId || null,
    kind: state?.event?.kind || null,
    title: state?.event?.title || null,
    description: state?.event?.description || null,
    options: choosableEventOptions(state).map(option => [option.index, option.optionId || null, option.label, option.description])
  });
}

function eventChoicePending(observation) {
  const state = observation?.state;
  if (!state || state.combat) return false;
  if (choosableEventOptions(state).length > 0) return true;
  const events = observation?.recentEvents || [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const name = events[index]?.name;
    if (name === 'event.closed' || name === 'combat.started' || name === 'card.reward.opened' || name === 'shop.opened') return false;
    if (name === 'event.opened') return true;
  }
  if (state.event && typeof state.event === 'object') return true;
  const node = String(state.run?.currentNode || '');
  const room = String(state.run?.room || '');
  return /ancient/i.test(node) || /^event$/i.test(room);
}

module.exports = {
  eventOptions,
  choosableEventOptions,
  eventPromptPayload,
  recommendEvent,
  eventSignature,
  eventChoicePending
};
