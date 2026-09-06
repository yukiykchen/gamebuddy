const { SCHEMA } = require('../recommendation');

function eventOptions(state) {
  return Array.isArray(state?.event?.options)
    ? state.event.options.filter(option => option && typeof option.label === 'string' && option.label.trim())
    : [];
}

function buildEventRecommendation(state, { source = 'rules', reason, now = Date.now(), index = 0 } = {}) {
  const options = eventOptions(state);
  if (!options.length) return null;
  const safeIndex = Math.max(0, Math.min(options.length - 1, Number(index) || 0));
  const chosen = options[safeIndex];
  return {
    schema: SCHEMA,
    task: 'event_choice',
    timestamp: now,
    source,
    confidence: source === 'llm' ? 0.74 : 0.45,
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
  return {
    title: state?.event?.title || '',
    description: state?.event?.description || '',
    hp: state?.player?.hp,
    maxHp: state?.player?.maxHp,
    gold: state?.player?.gold,
    relics: state?.player?.relics || [],
    deck: state?.player?.cards || [],
    options: eventOptions(state).map((option, index) => ({
      index: Number(option.index ?? index),
      label: option.label,
      description: option.description || ''
    }))
  };
}

async function recommendEvent(state, { llm, now = Date.now() } = {}) {
  const options = eventOptions(state);
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
    title: state?.event?.title || null,
    description: state?.event?.description || null,
    options: eventOptions(state).map(option => [option.index, option.label, option.description])
  });
}

module.exports = { eventOptions, eventPromptPayload, recommendEvent, eventSignature };
