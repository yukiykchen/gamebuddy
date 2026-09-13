const SUPPORTED_SCHEMA = 'gamebuddy.state.v1';
const SUPPORTED_EVENTS = new Set(['combat.started', 'turn.started', 'combat.ended', 'map.opened', 'rest.opened', 'rest.closed', 'event.opened', 'event.closed', 'card.played', 'card.reward.opened', 'card.reward.closed']);

function validateReward(reward, prefix = 'reward') {
  if (!reward || typeof reward !== 'object') return { ok: false, reason: `${prefix} must be an object` };
  const cards = reward.cards || reward.offered || reward.options;
  if (!Array.isArray(cards) || cards.length < 1 || cards.length > 6) {
    return { ok: false, reason: `${prefix} cards must contain 1 to 6 entries` };
  }
  for (const card of cards) {
    if (typeof card === 'string' && card) continue;
    if (!card || typeof card !== 'object' || (!card.id && !card.name)) {
      return { ok: false, reason: `${prefix} card entries need an id or name` };
    }
  }
  if (reward.canSkip !== undefined && typeof reward.canSkip !== 'boolean') {
    return { ok: false, reason: `${prefix}.canSkip must be a boolean` };
  }
  return { ok: true };
}

function validateState(state) {
  if (!state || typeof state !== 'object') return { ok: false, reason: 'state must be an object' };
  for (const field of ['schema', 'timestamp', 'source', 'run', 'player']) {
    if (!(field in state)) return { ok: false, reason: `missing ${field}` };
  }
  if (state.schema !== SUPPORTED_SCHEMA) return { ok: false, reason: `unsupported schema ${state.schema}` };
  if (!Number.isFinite(state.timestamp)) return { ok: false, reason: 'timestamp must be a number' };
  if (!state.run || typeof state.run !== 'object') return { ok: false, reason: 'run must be an object' };
  for (const field of ['act', 'floor', 'room', 'character']) {
    if (!(field in state.run)) return { ok: false, reason: `run missing ${field}` };
  }
  if (!state.player || typeof state.player !== 'object') return { ok: false, reason: 'player must be an object' };
  for (const field of ['hp', 'maxHp', 'block', 'gold', 'energy', 'maxEnergy', 'cards', 'relics', 'potions']) {
    if (!(field in state.player)) return { ok: false, reason: `player missing ${field}` };
  }
  for (const field of ['cards', 'relics', 'potions']) {
    if (!Array.isArray(state.player[field])) return { ok: false, reason: `player.${field} must be an array` };
  }
  if (state.combat !== null && state.combat !== undefined) {
    if (typeof state.combat !== 'object') return { ok: false, reason: 'combat must be an object or null' };
    for (const field of ['turn', 'hand', 'drawPile', 'discardPile', 'exhaustPile', 'enemies']) {
      if (!(field in state.combat)) return { ok: false, reason: `combat missing ${field}` };
    }
    if (!Array.isArray(state.combat.hand)) return { ok: false, reason: 'combat.hand must be an array' };
    if (!Array.isArray(state.combat.drawPile)) return { ok: false, reason: 'combat.drawPile must be an array' };
    if (!Array.isArray(state.combat.discardPile)) return { ok: false, reason: 'combat.discardPile must be an array' };
    if (!Array.isArray(state.combat.exhaustPile)) return { ok: false, reason: 'combat.exhaustPile must be an array' };
    if (!Array.isArray(state.combat.enemies)) return { ok: false, reason: 'combat.enemies must be an array' };
  }
  if (!state.map || typeof state.map !== 'object' || !Array.isArray(state.map.visited)) return { ok: false, reason: 'map.visited must be an array' };
  if (state.map.nodes !== undefined) {
    if (!Array.isArray(state.map.nodes)) return { ok: false, reason: 'map.nodes must be an array' };
    for (const node of state.map.nodes) {
      if (!node || typeof node !== 'object') return { ok: false, reason: 'map.nodes entries must be objects' };
      if (typeof node.id !== 'string' || typeof node.type !== 'string') return { ok: false, reason: 'map node needs id and type' };
      if (!Array.isArray(node.children)) return { ok: false, reason: 'map node children must be an array' };
      for (const field of ['encounterId', 'encounterName']) {
        if (node[field] !== undefined && node[field] !== null && typeof node[field] !== 'string') {
          return { ok: false, reason: `map node ${field} must be a string or null` };
        }
      }
    }
  }
  if (state.map.routes !== undefined) {
    if (!Array.isArray(state.map.routes)) return { ok: false, reason: 'map.routes must be an array' };
    for (const route of state.map.routes) {
      if (!Array.isArray(route) || route.some(id => typeof id !== 'string')) return { ok: false, reason: 'map.routes entries must be id arrays' };
    }
  }
  if (state.event !== undefined && state.event !== null) {
    if (typeof state.event !== 'object') return { ok: false, reason: 'event must be an object or null' };
    for (const field of ['title', 'description', 'options']) {
      if (!(field in state.event)) return { ok: false, reason: `event missing ${field}` };
    }
    if (!Array.isArray(state.event.options)) return { ok: false, reason: 'event.options must be an array' };
    if (state.event.kind !== undefined && state.event.kind !== null && typeof state.event.kind !== 'string') {
      return { ok: false, reason: 'event.kind must be a string' };
    }
    for (const option of state.event.options) {
      if (!option || typeof option !== 'object' || !Number.isInteger(option.index) || typeof option.label !== 'string') {
        return { ok: false, reason: 'event option needs integer index and label' };
      }
    }
  }
  if (state.cardReward !== undefined && state.cardReward !== null) {
    if (typeof state.cardReward !== 'object' || !Array.isArray(state.cardReward.options)) {
      return { ok: false, reason: 'cardReward.options must be an array' };
    }
    for (const card of state.cardReward.options) {
      if (!card || typeof card !== 'object' || !Number.isInteger(card.index) || typeof card.id !== 'string' || typeof card.name !== 'string' || typeof card.type !== 'string') {
        return { ok: false, reason: 'card reward option needs index, id, name and type' };
      }
      if (card.cost !== null && card.cost !== undefined && !Number.isFinite(card.cost)) {
        return { ok: false, reason: 'card reward option cost is invalid' };
      }
      if (card.description !== undefined && typeof card.description !== 'string') {
        return { ok: false, reason: 'card reward option description must be a string' };
      }
    }
  }
  if (state.reward !== undefined && state.reward !== null) {
    const validation = validateReward(state.reward, 'state.reward');
    if (!validation.ok) return validation;
  }
  for (const field of ['hp', 'maxHp', 'block', 'gold', 'energy', 'maxEnergy']) {
    if (!Number.isFinite(state.player[field])) return { ok: false, reason: `player.${field} is invalid` };
  }
  return { ok: true };
}

function stateSignature(state) {
  return JSON.stringify({
    run: state.run,
    player: state.player,
    combat: state.combat,
    map: state.map,
    event: state.event,
    cardReward: state.cardReward,
    reward: state.reward ?? null,
    rewards: state.rewards ?? null,
    eventId: state.run?.eventId ?? null
  });
}

function validateMessage(message) {
  if (!message || typeof message !== 'object') return { ok: false, reason: 'message must be an object' };
  if (message.type === 'state') return validateState(message.data);
  if (message.type !== 'event') return { ok: false, reason: `unsupported message type ${message.type || 'missing'}` };
  if (typeof message.name !== 'string' || !SUPPORTED_EVENTS.has(message.name)) return { ok: false, reason: `unsupported event ${message.name || 'missing'}` };
  if (!Number.isFinite(message.timestamp)) return { ok: false, reason: 'event timestamp must be a number' };
  if (message.name === 'card.reward.opened' && message.data !== undefined && message.data !== null) {
    const validation = validateReward(message.data, 'card.reward.opened data');
    if (!validation.ok) return validation;
  }
  return { ok: true };
}

module.exports = { SUPPORTED_EVENTS, SUPPORTED_SCHEMA, validateMessage, validateState, stateSignature };
