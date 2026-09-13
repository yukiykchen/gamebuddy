const { validateRecommendation } = require('./recommendation');
const { recommendRoute, routeSignature, routeChoiceCount } = require('./tasks/route');
const { isRestSite, recommendRest, restSignature } = require('./tasks/rest');
const { recommendEvent, eventSignature, choosableEventOptions, eventChoicePending } = require('./tasks/event');
const { findCardReward, recommendCardReward, cardRewardSignature } = require('./tasks/card-reward');
const { createOpenAiClient, readLlmConfig } = require('./llm/openai');

const SCENE_EVENTS = new Set([
  'combat.started',
  'combat.ended',
  'card.reward.opened',
  'card.reward.closed',
  'rest.opened',
  'rest.closed',
  'event.opened',
  'map.opened'
]);

const REST_CHOICE_DONE = new Set(['rest.closed', 'map.opened', 'combat.started', 'card.reward.opened']);

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

function restChoicePending(observation) {
  const events = observation?.recentEvents || [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const name = events[index]?.name;
    if (REST_CHOICE_DONE.has(name)) return false;
    if (name === 'rest.opened') return true;
  }
  return isRestSite(observation?.state);
}

function restChoiceFinished(observation) {
  const events = observation?.recentEvents || [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const name = events[index]?.name;
    if (name === 'rest.closed') return true;
    if (name === 'rest.opened' || name === 'combat.started' || name === 'card.reward.opened' || name === 'event.opened') {
      return false;
    }
  }
  return false;
}

function eventChoiceFinished(observation) {
  const events = observation?.recentEvents || [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const name = events[index]?.name;
    if (name === 'event.closed') return true;
    if (name === 'event.opened' || name === 'combat.started' || name === 'card.reward.opened') return false;
  }
  return false;
}

function selectTask(observation) {
  const state = observation?.state;
  if (!state) return null;
  if (state.combat) return null;
  if (findCardReward(observation)) return 'card_reward';
  if (choosableEventOptions(state).length > 0) return 'event_choice';
  if (eventChoicePending(observation)) return null;
  if (restChoicePending(observation)) return 'rest_site';
  if (routeChoiceCount(state) > 1 && (isMapScene(observation) || isRestSite(state) || restChoiceFinished(observation) || eventChoiceFinished(observation))) {
    return 'map_route';
  }
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

  async function consider(observation, { force = false, reason } = {}) {
    const task = selectTask(observation);
    if (!task) {
      if (eventChoicePending(observation)) {
        const dropMap = lastRecommendation?.task === 'map_route' || inFlight?.task === 'map_route';
        if (dropMap || lastRecommendation) {
          generation += 1;
          lastSignature = '';
          inFlight = null;
          if (lastRecommendation) {
            lastRecommendation = null;
            onRecommendation?.(null);
          }
          onAgentStatus?.({ status: 'idle', task: null, timestamp: now() });
        }
        return null;
      }
      const scene = latestSceneEvent(observation);
      const cardStillRunning = inFlight?.task === 'card_reward'
        && scene !== 'card.reward.closed'
        && !observation?.state?.combat;
      const mapWithoutFork = isMapScene(observation) && routeChoiceCount(observation?.state) <= 1;
      const restFinishedIdle = !restChoicePending(observation)
        && isRestSite(observation?.state)
        && routeChoiceCount(observation?.state) <= 1;
      const leaveScene = observation?.state?.combat
        || scene === 'card.reward.closed'
        || scene === 'rest.closed'
        || mapWithoutFork
        || restFinishedIdle;
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
    const refresh = reason === 'refresh';
    if (inFlight && inFlight.signature === signature && !refresh) return inFlight.promise;
    if (inFlight && inFlight.task === task && task === 'card_reward' && !refresh) return inFlight.promise;
    if (!observation?.fresh && !force && !refresh && lastRecommendation) return lastRecommendation;
    if (signature === lastSignature && lastRecommendation) {
      if (!refresh && (task === 'card_reward' || !force)) return lastRecommendation;
    }

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

  function hasPublishedFor(observation) {
    const task = selectTask(observation);
    if (!task || !lastRecommendation) return false;
    return lastSignature === `${task}:${signatureFor(task, observation, observation.state)}`;
  }

  return {
    consider,
    getRecommendation: () => lastRecommendation,
    hasPublishedFor,
    clearRecommendation,
    selectTask
  };
}

module.exports = { createOrchestrator, selectTask, restChoicePending, eventChoicePending };
