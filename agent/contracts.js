function createDecision(agent, state) {
  return {
    schema: 'runmate.decision.v1',
    agent,
    source: 'deterministic',
    status: 'ready',
    validFor: stateSignature(state),
    observedAt: state.timestamp,
    title: '',
    summary: '',
    confidence: null,
    payload: {},
    evidence: [],
    warnings: []
  };
}

function unavailable(agent, state, summary, warnings = []) {
  const decision = createDecision(agent, state);
  return { ...decision, status: 'unavailable', title: '暂无可靠建议', summary, confidence: 0, warnings };
}

function stateSignature(state) {
  return JSON.stringify({
    run: state?.run ?? null,
    player: state?.player ?? null,
    combat: state?.combat ?? null,
    map: state?.map ?? null
  });
}

function powerValue(effectText, name) {
  const patterns = [
    new RegExp(`获得\\s*(\\d+)\\s*点?\\s*${name}`),
    new RegExp(`获得\\s*(\\d+)\\s*层\\s*${name}`),
    new RegExp(`(${name})\\s*(\\d+)`),
    new RegExp(`${name}\\s*(\\d+)`)
  ];
  for (const pattern of patterns) {
    const match = effectText.match(pattern);
    if (match) return Number(match[1] ?? match[2]);
  }
  return null;
}

function numberOr(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

module.exports = {
  createDecision,
  unavailable,
  stateSignature,
  powerValue,
  numberOr
};
