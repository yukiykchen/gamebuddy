const { SCHEMA } = require('../recommendation');
const { removeTargets } = require('./shop');

// The Bridge only publishes this selection when the game is about to remove cards, so the purpose is
// already decided upstream. Transform and copy open the same screen and never reach this task.
function normalizeSelection(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const cards = (Array.isArray(payload.cards) ? payload.cards : [])
    .filter(card => card && typeof card === 'object' && (card.id || card.name));
  if (!cards.length) return null;
  const maxSelect = Number.isFinite(payload.maxSelect) ? Math.max(1, Math.trunc(payload.maxSelect)) : 1;
  const minSelect = Number.isFinite(payload.minSelect) ? Math.max(0, Math.trunc(payload.minSelect)) : maxSelect;
  return {
    cards,
    minSelect,
    maxSelect,
    cancelable: payload.cancelable === true,
    inShop: payload.inShop === true,
    promptKey: payload.promptKey || null,
    candidateCount: cards.length
  };
}

function findCardRemoval(observation) {
  const events = observation?.recentEvents || [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.name === 'card.removal.opened') return normalizeSelection(event.data);
    if (event?.name === 'card.removal.closed' || event?.name === 'map.opened' || event?.name === 'combat.started') return null;
  }
  return normalizeSelection(observation?.state?.cardRemoval);
}

// Deck duplicates are distinct removal targets, so the signature counts them instead of deduping.
function cardMultiset(cards) {
  const counts = new Map();
  for (const card of cards) {
    const key = `${String(card.id || card.name || '').toLowerCase()}${card.upgraded ? '+' : ''}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => (left[0] < right[0] ? -1 : 1))
    .map(([key, count]) => `${key}x${count}`)
    .join(',');
}

function cardRemovalSignature(observation) {
  const selection = findCardRemoval(observation);
  if (!selection) return '';
  return JSON.stringify({
    candidates: cardMultiset(selection.cards),
    minSelect: selection.minSelect,
    maxSelect: selection.maxSelect
  });
}

function describePicks(picks) {
  return picks.map(pick => `「${pick.name}」`).join('、');
}

function recommendCardRemoval(observation, { now = Date.now() } = {}) {
  const selection = findCardRemoval(observation);
  if (!selection) return null;

  // Asking for more removals than there are removable cards is a real state, e.g. a relic that
  // wants five upgradable cards while the deck only holds three.
  const wanted = Math.min(selection.maxSelect, selection.candidateCount);
  const picks = removeTargets(selection.cards, wanted);
  if (!picks.length) return null;

  const short = picks.length < selection.maxSelect;
  const reason = short
    ? `牌组里只有 ${picks.length} 张可以删除，少于要求的 ${selection.maxSelect} 张：${picks[0].reason}`
    : `删除 ${picks.length} 张：${describePicks(picks)}。${picks[0].reason}`;

  return {
    schema: SCHEMA,
    task: 'card_removal',
    timestamp: now,
    source: 'rules',
    reason,
    confidence: picks.length === 1 ? 0.74 : 0.7,
    primary: {
      action: 'REMOVE_CARDS',
      count: picks.length,
      cards: picks,
      cardNames: picks.map(pick => pick.name),
      label: describePicks(picks)
    },
    alternatives: picks.slice(1).map(pick => ({ action: 'REMOVE_CARDS', cardName: pick.name, cardId: pick.id, reason: pick.reason })),
    context: {
      candidateCount: selection.candidateCount,
      minSelect: selection.minSelect,
      maxSelect: selection.maxSelect,
      cancelable: selection.cancelable,
      inShop: selection.inShop,
      promptKey: selection.promptKey
    }
  };
}

module.exports = {
  normalizeSelection,
  findCardRemoval,
  cardRemovalSignature,
  recommendCardRemoval
};
