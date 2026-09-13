const { SCHEMA } = require('../recommendation');

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

function buildEventRecommendation(state, { source = 'rules', reason, now = Date.now(), index = 0 } = {}) {
  const options = choosableEventOptions(state);
  if (!options.length) return null;
  const safeIndex = Math.max(0, Math.min(options.length - 1, Number(index) || 0));
  const chosen = options[safeIndex];
  const eventKind = state?.event?.kind === 'ancient' ? 'ancient' : 'event';
  return {
    schema: SCHEMA,
    task: 'event_choice',
    timestamp: now,
    source,
    confidence: source === 'llm' ? 0.74 : 0.45,
    eventKind,
    eventTitle: state?.event?.title || '',
    reason: reason || `建议选择「${chosen.label}」。这是当前事件中可执行的选项。`,
    primary: {
      action: 'CHOOSE_EVENT',
      optionIndex: Number(chosen.index ?? safeIndex),
      label: chosen.label,
      description: chosen.description || ''
    },
    alternatives: options
      .map((option, optionIndex) => ({
        action: 'CHOOSE_EVENT',
        optionIndex: Number(option.index ?? optionIndex),
        label: option.label,
        description: option.description || ''
      }))
      .filter(option => option.optionIndex !== Number(chosen.index ?? safeIndex))
  };
}

function eventPromptPayload(state) {
  const options = choosableEventOptions(state);
  return {
    kind: state?.event?.kind === 'ancient' ? 'ancient' : 'event',
    title: state?.event?.title || '',
    description: state?.event?.description || '',
    hp: state?.player?.hp,
    maxHp: state?.player?.maxHp,
    gold: state?.player?.gold,
    energyPerTurn: state?.player?.maxEnergy,
    relics: namedList(state?.player?.relics),
    deck: namedList(state?.player?.cards),
    options: options.map((option, index) => ({
      index: Number(option.index ?? index),
      label: option.label,
      description: option.description || ''
    }))
  };
}

async function recommendEvent(state, { llm, now = Date.now() } = {}) {
  const options = choosableEventOptions(state);
  if (!options.length) return null;
  if (llm?.enabled && typeof llm.completeEvent === 'function') {
    try {
      const pick = await llm.completeEvent(eventPromptPayload(state));
      const index = Number(pick?.index);
      if (Number.isInteger(index) && options.some((option, optionIndex) => Number(option.index ?? optionIndex) === index)) {
        return buildEventRecommendation(state, {
          source: 'llm',
          reason: typeof pick.reason === 'string' && pick.reason.trim() ? pick.reason.trim() : undefined,
          now,
          index: options.findIndex((option, optionIndex) => Number(option.index ?? optionIndex) === index)
        });
      }
    } catch {
      // Fall through to the deterministic first-option fallback.
    }
  }
  return buildEventRecommendation(state, { now });
}

function eventSignature(state) {
  return JSON.stringify({
    room: state?.run?.room || null,
    kind: state?.event?.kind || null,
    title: state?.event?.title || null,
    description: state?.event?.description || null,
    options: choosableEventOptions(state).map(option => [option.index, option.label, option.description])
  });
}

function eventChoicePending(observation) {
  const state = observation?.state;
  if (!state || state.combat) return false;
  if (choosableEventOptions(state).length > 0) return true;
  const events = observation?.recentEvents || [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const name = events[index]?.name;
    if (name === 'event.closed' || name === 'combat.started' || name === 'card.reward.opened') return false;
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
