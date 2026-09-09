const { validateRecommendation } = require('./recommendation');
const { recommendRoute, routeSignature, ensureMapRoutes } = require('./tasks/route');
const { isRestSite, recommendRest, restSignature } = require('./tasks/rest');
const { recommendEvent, eventSignature } = require('./tasks/event');
const { findCardReward, recommendCardReward, cardRewardSignature } = require('./tasks/card-reward');
const { createOpenAiClient, readLlmConfig } = require('./llm/openai');

function hasRoutableMap(state) {
  const map = ensureMapRoutes(state?.map || {});
  return Array.isArray(map.routes) && map.routes.length > 0;
}

function selectTask(observation) {
  const state = observation?.state;
  if (!state) return null;
  if (Array.isArray(state.cardReward?.options) && state.cardReward.options.length > 0) return 'card_reward';
  if (Array.isArray(state.event?.options) && state.event.options.length > 0) return 'event_choice';
  if (!state.combat) {
    if (findCardReward(observation)) return 'card_reward';
    const recent = observation.recentEvents || [];
    for (let i = recent.length - 1; i >= 0; i -= 1) {
      const name = recent[i]?.name;
      if (name === 'map.opened') break;
      if (name === 'rest.opened') return 'rest_site';
    }
    if (isRestSite(state)) return 'rest_site';
  }
  if (hasRoutableMap(state)) return 'map_route';
  return null;
}

function signatureFor(task, observation, state) {
  if (task === 'card_reward') return cardRewardSignature(observation);
  if (task === 'rest_site') return restSignature(state);
  if (task === 'map_route') return routeSignature(state);
  if (task === 'event_choice') return eventSignature(state);
  return '';
}

function createOrchestrator({
  llm,
  onRecommendation,
  onAgentStatus,
  now = () => Date.now()
} = {}) {
  const client = llm || createOpenAiClient(readLlmConfig());
  let lastSignature = '';
  let lastRecommendation = null;
  let generation = 0;

  async function consider(observation, { force = false } = {}) {
    const task = selectTask(observation);
    if (!task) return lastRecommendation;
    if (!observation?.fresh && !force && lastRecommendation) return lastRecommendation;

    const signature = `${task}:${signatureFor(task, observation, observation.state)}`;
    if (!force && signature === lastSignature && lastRecommendation) return lastRecommendation;

    const current = ++generation;
    onAgentStatus?.({ status: 'thinking', task, timestamp: now() });
    try {
      const recommendation = task === 'card_reward'
        ? await recommendCardReward(observation, { llm: client, now: now() })
        : task === 'event_choice'
          ? await recommendEvent(observation.state, { llm: client, now: now() })
          : task === 'rest_site'
            ? await recommendRest(observation.state, { llm: client, now: now() })
            : await recommendRoute(observation.state, { llm: client, now: now() });
      if (current !== generation) return lastRecommendation;
      const validation = recommendation ? validateRecommendation(recommendation) : { ok: false };
      if (!validation.ok) return lastRecommendation;
      lastSignature = signature;
      lastRecommendation = recommendation;
      onRecommendation?.(recommendation);
      onAgentStatus?.({ status: 'ready', task, timestamp: now() });
      return recommendation;
    } catch (error) {
      if (current === generation) {
        console.error('GameBuddy agent failed:', error.message);
        onAgentStatus?.({ status: 'error', task, detail: error.message, timestamp: now() });
      }
      return lastRecommendation;
    }
  }

  function clearRecommendation() {
    generation += 1;
    lastSignature = '';
    lastRecommendation = null;
    onRecommendation?.(null);
  }

  return {
    consider,
    getRecommendation: () => lastRecommendation,
    clearRecommendation,
    selectTask
  };
}

module.exports = { createOrchestrator, selectTask };
