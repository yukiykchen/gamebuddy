const { validateRecommendation } = require('./recommendation');
const { recommendRoute, routeSignature, routeChoiceCount } = require('./tasks/route');
const { isRestSite, recommendRest, restSignature } = require('./tasks/rest');
const { recommendEvent, eventSignature } = require('./tasks/event');
const { findCardReward, recommendCardReward, cardRewardSignature } = require('./tasks/card-reward');
const { createOpenAiClient, readLlmConfig } = require('./llm/openai');

const SCENE_EVENTS = new Set([
  'combat.started',
  'combat.ended',
  'card.reward.opened',
  'card.reward.closed',
  'rest.opened',
  'event.opened',
  'map.opened'
]);

function latestSceneEvent(observation) {
  const events = observation?.recentEvents || [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (SCENE_EVENTS.has(events[index]?.name)) return events[index].name;
  }
  return '';
}

function isMapScene(observation) {
  const latest = latestSceneEvent(observation);
  if (latest) return latest === 'map.opened';
  return /map/i.test(String(observation?.state?.run?.room || ''));
}

function selectTask(observation) {
  const state = observation?.state;
  if (!state) return null;
  if (state.combat) return null;
  if (findCardReward(observation)) return 'card_reward';
  if (Array.isArray(state.event?.options) && state.event.options.length > 0) return 'event_choice';
  const recent = observation.recentEvents || [];
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const name = recent[i]?.name;
    if (name === 'map.opened') break;
    if (name === 'rest.opened') return 'rest_site';
  }
  if (isRestSite(state)) return 'rest_site';
  if (isMapScene(observation) && routeChoiceCount(state) > 1) return 'map_route';
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
  let inFlight = null;
  let generation = 0;

  async function consider(observation, { force = false } = {}) {
    const task = selectTask(observation);
    if (!task) {
      const scene = latestSceneEvent(observation);
      const cardStillRunning = inFlight?.task === 'card_reward'
        && scene !== 'card.reward.closed'
        && !observation?.state?.combat;
      const mapWithoutFork = isMapScene(observation) && routeChoiceCount(observation?.state) <= 1;
      const leaveScene = observation?.state?.combat
        || scene === 'card.reward.closed'
        || mapWithoutFork;
      if (leaveScene && !cardStillRunning) {
        generation += 1;
        lastSignature = '';
        inFlight = null;
        if (lastRecommendation) {
          lastRecommendation = null;
          onRecommendation?.(null);
        }
        onAgentStatus?.({ status: 'idle', task: null, timestamp: now() });
        return null;
      }
      if (inFlight) return inFlight.promise;
      return lastRecommendation;
    }

    const signature = `${task}:${signatureFor(task, observation, observation.state)}`;
    if (inFlight && inFlight.signature === signature) return inFlight.promise;
    if (inFlight && inFlight.task === task && task === 'card_reward') return inFlight.promise;
    if (!observation?.fresh && !force && lastRecommendation) return lastRecommendation;
    if (!force && signature === lastSignature && lastRecommendation) return lastRecommendation;

    const current = ++generation;
    const promise = (async () => {
      onAgentStatus?.({ status: 'thinking', task, timestamp: now() });
      const taskOptions = {
        llm: client,
        now: now()
      };
      try {
        const recommendation = task === 'card_reward'
          ? await recommendCardReward(observation, taskOptions)
          : task === 'event_choice'
            ? await recommendEvent(observation.state, taskOptions)
            : task === 'rest_site'
              ? await recommendRest(observation.state, taskOptions)
              : await recommendRoute(observation.state, taskOptions);
        if (current !== generation) {
          if (recommendation) {
            console.warn(`GameBuddy dropped ${task} result because a newer consider started`);
          }
          return lastRecommendation;
        }
        if (!recommendation) {
          if (task === 'card_reward' && lastRecommendation?.task === 'card_reward') {
            onAgentStatus?.({ status: 'ready', task, timestamp: now() });
            return lastRecommendation;
          }
          if (task === 'card_reward') {
            lastSignature = '';
            lastRecommendation = null;
            onRecommendation?.(null);
            onAgentStatus?.({ status: 'error', task, timestamp: now() });
          }
          return lastRecommendation;
        }
        const validation = validateRecommendation(recommendation);
        if (!validation.ok) {
          console.error('GameBuddy recommendation invalid:', validation.reason);
          if (lastRecommendation) return lastRecommendation;
          if (task === 'card_reward') {
            lastSignature = '';
            onRecommendation?.(null);
            onAgentStatus?.({ status: 'error', task, timestamp: now() });
          }
          return lastRecommendation;
        }
        lastSignature = signature;
        lastRecommendation = recommendation;
        onRecommendation?.(recommendation);
        onAgentStatus?.({ status: 'ready', task, timestamp: now() });
        return recommendation;
      } catch (error) {
        if (current === generation) {
          console.error('GameBuddy agent failed:', error.message);
          onAgentStatus?.({ status: 'error', task, timestamp: now() });
        }
        return lastRecommendation;
      } finally {
        if (current === generation) inFlight = null;
      }
    })();
    inFlight = { signature, task, promise };
    return promise;
  }

  function clearRecommendation() {
    generation += 1;
    lastSignature = '';
    inFlight = null;
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
