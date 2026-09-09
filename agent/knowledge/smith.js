const {
  strategy,
  cardKnowledge,
  evaluateUpgrade,
  strategyForPrompt
} = require('../skills/rest-site-strategy/scripts/evaluate-upgrade');

function isStrike(card) {
  const values = [card?.id, card?.name].map(value => String(value || '').toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, ''));
  return values.some(value => value === '打击' || /^strike(?:r|g|b|p|ironclad|silent|defect|necrobinder|regent)?$/.test(value));
}

function isDefend(card) {
  const values = [card?.id, card?.name].map(value => String(value || '').toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, ''));
  return values.some(value => value === '防御' || /^defend(?:r|g|b|p|ironclad|silent|defect|necrobinder|regent)?$/.test(value));
}

function smithAnalysis(card, context) {
  return evaluateUpgrade(card, context);
}

function smithScore(card, context) {
  return smithAnalysis(card, context).score;
}

function smithReason(card, context) {
  return smithAnalysis(card, context).summary;
}

module.exports = {
  strategy,
  cardKnowledge,
  isStrike,
  isDefend,
  smithAnalysis,
  smithScore,
  smithReason,
  strategyForPrompt
};
