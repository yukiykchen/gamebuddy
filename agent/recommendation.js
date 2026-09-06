const SCHEMA = 'gamebuddy.recommendation.v1';

function validateRecommendation(recommendation) {
  if (!recommendation || typeof recommendation !== 'object') return { ok: false, reason: 'recommendation must be an object' };
  if (recommendation.schema !== SCHEMA) return { ok: false, reason: `unsupported schema ${recommendation.schema || 'missing'}` };
  if (typeof recommendation.task !== 'string' || !recommendation.task) return { ok: false, reason: 'task must be a string' };
  if (!Number.isFinite(recommendation.timestamp)) return { ok: false, reason: 'timestamp must be a number' };
  if (recommendation.source !== 'rules' && recommendation.source !== 'llm') return { ok: false, reason: 'source must be rules or llm' };
  if (typeof recommendation.reason !== 'string' || !recommendation.reason.trim()) return { ok: false, reason: 'reason must be a non-empty string' };
  if (!Number.isFinite(recommendation.confidence) || recommendation.confidence < 0 || recommendation.confidence > 1) {
    return { ok: false, reason: 'confidence must be between 0 and 1' };
  }
  const primary = recommendation.primary;
  if (!primary || typeof primary !== 'object') return { ok: false, reason: 'primary must be an object' };
  if (typeof primary.action !== 'string' || !primary.action) return { ok: false, reason: 'primary.action must be a string' };
  if (recommendation.task === 'map_route') {
    if (primary.action !== 'TAKE_ROUTE') return { ok: false, reason: 'map_route action must be TAKE_ROUTE' };
    if (typeof primary.targetId !== 'string' || !primary.targetId) return { ok: false, reason: 'map_route needs targetId' };
    if (!Array.isArray(primary.route) || primary.route.some(id => typeof id !== 'string')) {
      return { ok: false, reason: 'map_route primary.route must be an id array' };
    }
  }
  if (recommendation.task === 'rest_site') {
    if (primary.action !== 'HEAL' && primary.action !== 'SMITH') return { ok: false, reason: 'rest_site action must be HEAL or SMITH' };
    if (primary.action === 'SMITH' && (typeof primary.cardName !== 'string' || !primary.cardName)) {
      return { ok: false, reason: 'rest_site SMITH needs cardName' };
    }
  }
  if (recommendation.task === 'event_choice') {
    if (primary.action !== 'CHOOSE_EVENT') return { ok: false, reason: 'event_choice action must be CHOOSE_EVENT' };
    if (!Number.isInteger(primary.optionIndex) || primary.optionIndex < 0) return { ok: false, reason: 'event_choice needs optionIndex' };
    if (typeof primary.label !== 'string' || !primary.label.trim()) return { ok: false, reason: 'event_choice needs label' };
  }
  if (recommendation.alternatives !== undefined) {
    if (!Array.isArray(recommendation.alternatives)) return { ok: false, reason: 'alternatives must be an array' };
  }
  return { ok: true };
}

module.exports = { SCHEMA, validateRecommendation };
