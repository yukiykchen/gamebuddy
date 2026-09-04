const { validateRecommendation } = require('./recommendation');
const { recommendRoute, routeSignature, ensureMapRoutes } = require('./tasks/route');
const { isRestSite, recommendRest, restSignature } = require('./tasks/rest');
const { createOpenAiClient, readLlmConfig } = require('./llm/openai');

function hasRoutableMap(state) {
  const map = ensureMapRoutes(state?.map || {});
  return Array.isArray(map.routes) && map.routes.length > 0;
}

function selectTask(observation) {
  const state = observation?.state;
  if (!state) return null;
  if (!state.combat) {
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

function signatureFor(task, state) {
  if (task === 'rest_site') return restSignature(state);
  if (task === 'map_route') return routeSignature(state);
  return '';
}

function createOrchestrator({
  llm,
  onRecommendation,
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

    const signature = `${task}:${signatureFor(task, observation.state)}`;
    if (!force && signature === lastSignature && lastRecommendation) return lastRecommendation;

    const current = ++generation;
    try {
      const recommendation = task === 'rest_site'
        ? await recommendRest(observation.state, { llm: client, now: now() })
        : await recommendRoute(observation.state, { llm: client, now: now() });
      if (current !== generation) return lastRecommendation;
      const validation = recommendation ? validateRecommendation(recommendation) : { ok: false };
      if (!validation.ok) return lastRecommendation;
      lastSignature = signature;
      lastRecommendation = recommendation;
      onRecommendation?.(recommendation);
      return recommendation;
    } catch (error) {
      if (current === generation) {
        console.error('GameBuddy agent failed:', error.message);
      }
      return lastRecommendation;
    }
  }

  return {
    consider,
    getRecommendation: () => lastRecommendation,
    selectTask
  };
}

module.exports = { createOrchestrator, selectTask };
