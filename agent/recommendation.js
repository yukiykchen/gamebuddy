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
  if (recommendation.task === 'card_reward') {
    if (primary.action === 'CHOOSE_CARD') {
      if (!Number.isInteger(primary.cardIndex) || primary.cardIndex < 0) return { ok: false, reason: 'card_reward CHOOSE_CARD needs cardIndex' };
      if (typeof primary.cardName !== 'string' || !primary.cardName.trim()) return { ok: false, reason: 'card_reward CHOOSE_CARD needs cardName' };
      if (typeof primary.cardId !== 'string' || !primary.cardId.trim()) return { ok: false, reason: 'card_reward CHOOSE_CARD needs cardId' };
    } else if (primary.action === 'TAKE_CARD') {
      if (typeof primary.cardId !== 'string' || !primary.cardId) return { ok: false, reason: 'card_reward TAKE_CARD needs cardId' };
      if (typeof primary.cardName !== 'string' || !primary.cardName) return { ok: false, reason: 'card_reward TAKE_CARD needs cardName' };
    } else if (primary.action !== 'SKIP') {
      return { ok: false, reason: 'card_reward action must be CHOOSE_CARD, TAKE_CARD, or SKIP' };
    }
    const options = Array.isArray(recommendation.options) ? recommendation.options : recommendation.alternatives;
    if (recommendation.action !== 'SKIP' && !Array.isArray(options)) {
      return { ok: false, reason: 'card_reward needs candidate options' };
    }
  }
  if (recommendation.task === 'shop_choice') {
    if (!['BUY_ITEM', 'REMOVE_CARD', 'SAVE_GOLD'].includes(primary.action)) {
      return { ok: false, reason: 'shop_choice action must be BUY_ITEM, REMOVE_CARD, or SAVE_GOLD' };
    }
    if (!Number.isFinite(primary.totalSpend) || primary.totalSpend < 0 || !Number.isFinite(primary.remainingGold) || primary.remainingGold < 0) {
      return { ok: false, reason: 'shop_choice needs valid spend and remaining gold' };
    }
    if (!Array.isArray(primary.plan)) return { ok: false, reason: 'shop_choice needs a plan array' };
    if (Number.isFinite(recommendation.context?.gold) && primary.totalSpend > recommendation.context.gold) {
      return { ok: false, reason: 'shop_choice plan exceeds current gold' };
    }
    if (primary.action === 'SAVE_GOLD' && primary.plan.length !== 0) {
      return { ok: false, reason: 'shop_choice SAVE_GOLD plan must be empty' };
    }
    if (primary.action === 'BUY_ITEM') {
      if (!Number.isInteger(primary.itemIndex) || typeof primary.itemId !== 'string' || !primary.itemId || typeof primary.itemName !== 'string' || !primary.itemName) {
        return { ok: false, reason: 'shop_choice BUY_ITEM needs current item identity' };
      }
    }
    if (primary.action === 'REMOVE_CARD' && (typeof primary.removeCardName !== 'string' || !primary.removeCardName)) {
      return { ok: false, reason: 'shop_choice REMOVE_CARD needs removeCardName' };
    }
  }
  if (recommendation.alternatives !== undefined && !Array.isArray(recommendation.alternatives)) {
    return { ok: false, reason: 'alternatives must be an array' };
  }
  return { ok: true };
}

module.exports = { SCHEMA, validateRecommendation };
