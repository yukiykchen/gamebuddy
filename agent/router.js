const { stateSignature } = require('./contracts');
const combatAgent = require('./agents/combat');
const rewardAgent = require('./agents/reward');
const routeAgent = require('./agents/route');
const eventAgent = require('./agents/event');

function decide(observation) {
  const state = observation?.state || null;
  const events = observation?.recentEvents || [];
  if (!state) {
    return { schema: 'runmate.decision.v1', status: 'unavailable', agent: null, title: '暂无建议', summary: '尚未收到游戏状态。' };
  }
  const attempts = [combatAgent, eventAgent, rewardAgent, routeAgent];
  for (const agent of attempts) {
    const [name, decision] = agent.decide(state, events);
    if (decision) return finalize(decision, state, observation);
  }
  return finalize({
    schema: 'runmate.decision.v1', agent: null, source: 'router', status: 'unavailable',
    title: '暂无可靠建议', summary: '当前状态不属于可识别的战斗、奖励、路线或事件场景。',
    validFor: stateSignature(state), observedAt: state.timestamp, payload: {}, evidence: [], warnings: []
  }, state, observation);
}

function finalize(decision, state, observation) {
  const stale = !observation.fresh;
  const changed = decision.validFor && decision.validFor !== stateSignature(state);
  const rejected = stale || changed || decision.status === 'unavailable';
  return {
    ...decision,
    status: rejected ? 'unavailable' : decision.status,
    source: rejected ? (decision.source || 'router') : decision.source,
    title: rejected ? '暂无可靠建议' : decision.title,
    summary: rejected ? (stale ? '观察数据已过期，不生成实时建议。' : decision.summary) : decision.summary,
    confidence: rejected ? 0 : decision.confidence,
    invalidReason: stale ? 'stale' : changed ? 'state_changed' : decision.status === 'unavailable' ? 'no_evidence' : null
  };
}

module.exports = { decide };
