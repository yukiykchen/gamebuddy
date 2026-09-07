const { SCHEMA } = require('../recommendation');

function cardOptions(state) {
  return Array.isArray(state?.cardReward?.options)
    ? state.cardReward.options.filter(card => card && typeof card.name === 'string' && card.name.trim())
    : [];
}

function normalizedCardText(card) {
  return `${card?.name || ''} ${card?.type || ''} ${card?.description || ''}`.toLowerCase();
}

function deckContext(state) {
  const cards = Array.isArray(state?.player?.cards) ? state.player.cards : [];
  const counts = cards.reduce((result, card) => {
    const type = String(card?.type || '').toLowerCase();
    if (type) result[type] = (result[type] || 0) + 1;
    return result;
  }, {});
  return {
    size: cards.length,
    attacks: counts.attack || 0,
    skills: counts.skill || 0,
    powers: counts.power || 0
  };
}

function scoreCard(card, state) {
  const text = normalizedCardText(card);
  const type = String(card.type || '').toLowerCase();
  const deck = deckContext(state);
  let score = 0;

  if (card.upgraded) score += 1;
  if (type === 'power') score += 6;
  if (type === 'skill') score += 3;
  if (type === 'attack') score += 2;
  if (/strike|defend|打击|防御/.test(text)) score -= 7;
  if (/draw|抽牌|抽\s*\d*\s*张?牌|抽取/.test(text)) score += 3;
  if (/block|格挡|护甲/.test(text)) score += deck.skills < deck.attacks ? 3 : 1;
  if (/exhaust|消耗|retain|保留|虚无/.test(text)) score += 2;
  if (/weak|脆弱|vulnerable|易伤|strength|力量|敏捷|专注/.test(text)) score += 2;
  if (deck.size < 14 && !/strike|defend|打击|防御/.test(text)) score += 2;
  if (Number(state?.player?.hp) / Math.max(1, Number(state?.player?.maxHp) || 1) < 0.4 && /block|格挡|护甲|heal|治疗|生命/.test(text)) score += 3;
  if (/elite|精英/.test(String(state?.map?.routes || '')) && /block|格挡|护甲|damage|伤害/.test(text)) score += 1;
  return score;
}

function rankCards(state) {
  return cardOptions(state)
    .map((card, arrayIndex) => ({
      card,
      arrayIndex,
      index: Number.isInteger(card.index) ? card.index : arrayIndex,
      score: scoreCard(card, state)
    }))
    .sort((left, right) => right.score - left.score || left.arrayIndex - right.arrayIndex);
}

function explainCardChoice(item, state) {
  const card = item.card;
  const text = normalizedCardText(card);
  if (/strike|defend|打击|防御/.test(text)) return `其他候选牌对当前卡组的提升更直接，先不拿基础牌。`;
  if (/draw|抽牌|抽\s*\d*\s*张?牌|抽取/.test(text)) return `「${card.name}」能补充抽牌，提高关键回合找到有效牌的概率。`;
  if (/block|格挡|护甲/.test(text)) return `当前卡组需要更稳定的防御，「${card.name}」能提高面对伤害时的容错。`;
  if (String(card.type).toLowerCase() === 'power') return `「${card.name}」是持续生效的能力牌，能提升后续多场战斗的收益。`;
  return `「${card.name}」的费用、类型和牌面效果与当前卡组更匹配。`;
}

function buildCardRewardRecommendation(state, { source = 'rules', reason, now = Date.now(), chosen, ranked = rankCards(state) } = {}) {
  if (!ranked.length) return null;
  const item = chosen || ranked[0];
  const card = item.card;
  return {
    schema: SCHEMA,
    task: 'card_reward',
    timestamp: now,
    source,
    confidence: source === 'llm' ? 0.78 : Math.max(0.5, Math.min(0.78, 0.58 + Math.abs(item.score - (ranked[1]?.score ?? item.score - 2)) / 20)),
    reason: reason || explainCardChoice(item, state),
    primary: {
      action: 'CHOOSE_CARD',
      cardIndex: item.index,
      cardId: card.id,
      cardName: card.name,
      cardType: card.type,
      cardCost: card.cost
    },
    alternatives: ranked.filter(other => other !== item).slice(0, 4).map(other => ({
      action: 'CHOOSE_CARD',
      cardIndex: other.index,
      cardId: other.card.id,
      cardName: other.card.name,
      cardType: other.card.type,
      cardCost: other.card.cost,
      score: other.score
    }))
  };
}

function cardRewardPromptPayload(state) {
  const deck = deckContext(state);
  return {
    act: state?.run?.act ?? null,
    floor: state?.run?.floor ?? null,
    hp: state?.player?.hp,
    maxHp: state?.player?.maxHp,
    gold: state?.player?.gold,
    relics: state?.player?.relics || [],
    deck: state?.player?.cards || [],
    deckSummary: deck,
    candidates: cardOptions(state).map((card, index) => ({
      index: Number.isInteger(card.index) ? card.index : index,
      id: card.id,
      name: card.name,
      type: card.type,
      cost: card.cost,
      upgraded: card.upgraded,
      description: card.description || ''
    }))
  };
}

async function recommendCardReward(state, { llm, now = Date.now() } = {}) {
  const ranked = rankCards(state);
  if (!ranked.length) return null;
  if (llm?.enabled && typeof llm.completeCardReward === 'function') {
    try {
      const payload = cardRewardPromptPayload(state);
      const pick = await llm.completeCardReward(payload);
      const index = Number(pick?.index);
      const chosen = ranked.find(item => item.index === index);
      if (chosen) {
        return buildCardRewardRecommendation(state, {
          source: 'llm',
          reason: typeof pick?.reason === 'string' && pick.reason.trim() ? pick.reason.trim() : undefined,
          now,
          chosen,
          ranked
        });
      }
    } catch {
      // Fall through to the deterministic card score.
    }
  }
  return buildCardRewardRecommendation(state, { now, ranked });
}

function cardRewardSignature(state) {
  return JSON.stringify({
    room: state?.run?.room || null,
    hp: state?.player?.hp ?? null,
    maxHp: state?.player?.maxHp ?? null,
    deck: (state?.player?.cards || []).map(card => [card.id, card.upgraded]),
    options: cardOptions(state).map(card => [card.index, card.id, card.name, card.type, card.cost, card.upgraded, card.description])
  });
}

module.exports = { cardOptions, scoreCard, rankCards, cardRewardPromptPayload, recommendCardReward, cardRewardSignature };
