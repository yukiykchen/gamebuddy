const { lookupCard, lookupRelic, lookupPotion, stripMarkup } = require('../codex-db');
const { createDecision, unavailable, numberOr } = require('../contracts');

const CHARACTER_PREFIX = {
  ironclad: ['IRONCLAD', 'R'],
  silent: ['SILENT', 'G'],
  defect: ['DEFECT', 'B'],
  regent: ['REGENT', 'W'],
  necrobinder: ['NECROBINDER', 'N']
};

function decide(state, events = []) {
  if (!isRewardScene(state, events)) return ['reward', null];
  const player = state.player || {};
  const rewards = visibleRewards(state);
  if (!rewards.length) return ['reward', unavailable('reward', state, '未从当前快照中发现可选奖励。')];
  const reviewed = rewards.map((reward, index) => ({ ...reward, index, ...reviewReward(reward, state) }));
  const candidates = reviewed.filter(row => row.score > -999);
  if (!candidates.length) return ['reward', unavailable('reward', state, '奖励缺少 Codex 数据或效果评估依据。')];
  const sorted = candidates.sort((a, b) => b.score - a.score);
  if (!sorted.length) return ['reward', unavailable('reward', state, '所有可见奖励都无法被 Codex 识别。')];
  const best = sorted[0];
  const decision = createDecision('reward', state);
  const action = best.card ? `选择「${best.name}」` : `领取「${best.name}」`;
  decision.title = action;
  decision.summary = best.reason;
  decision.confidence = 0.48 + Math.min(0.3, Math.abs(best.score) / 100);
  decision.payload = {
    action: 'pick-reward',
    choiceIndex: best.index,
    rewards: reviewed.map(row => ({
      index: row.index, name: row.name, kind: row.kind, id: row.id,
      score: row.score, reason: row.reason, rarity: row.meta?.rarity || null
    })),
    skipped: best.score <= 0
  };
  decision.evidence = reviewed.map(row => ({
    kind: 'codex-reward',
    detail: `${row.name}：${row.reason}`
  }));
  return ['reward', decision];
}

function isRewardScene(state, events) {
  if (state.run?.room === 'reward' || state.run?.room === 'shop' || state.run?.room === 'event_reward') return true;
  if (state.run?.currentNode === 'Reward') return true;
  return recent(events, ['card.reward.opened', 'combat.ended']).length > 0 && !state.combat;
}

function recent(events, names) {
  return events.filter(event => names.includes(event.name)).slice(-3);
}

function visibleRewards(state) {
  const details = state.run?.details || state.rewards || [];
  if (Array.isArray(details) && details.length) {
    return details.map((row, index) => ({
      id: row.id || row.card_id || row.relic_id || row.potion_id,
      name: row.name || row.title,
      kind: row.kind || row.type || (row.card_id ? 'card' : row.relic_id ? 'relic' : 'reward'),
      card: row.kind === 'card' || Boolean(row.card_id || (row.id && lookupCard(row.id || row.name)?.color)),
      meta: row
    }));
  }
  return [];
}

function reviewReward(reward, state) {
  if (reward.card) {
    const card = lookupCard(reward.id || reward.name);
    if (!card) return { score: -999, reason: 'Codex 未收录这张卡。' };
    const score = cardScore(card, state);
    return { score, reason: `${card.name}：${card.rarity}；${stripMarkup(card.description)}` };
  }
  const relic = lookupRelic(reward.id || reward.name);
  if (relic) {
    const score = 52 + rarityBonus(relic.rarity_key) + (state.player.maxHp >= 70 ? 5 : 0);
    return { score, reason: `遗物 ${relic.name}：${stripMarkup(relic.description)}` };
  }
  const potion = lookupPotion(reward.id || reward.name);
  if (potion) {
    const score = 18 + rarityBonus(potion.rarity_key);
    return { score, reason: `药水 ${potion.name}：${stripMarkup(potion.description)}` };
  }
  return { score: -999, reason: '无法识别的奖励。' };
}

function cardScore(card, state) {
  const deck = state.player.cards || [];
  const text = stripMarkup(card.description || '');
  const attackCount = deck.filter(row => lookupCard(row.id || row.name)?.type_key === 'Attack').length;
  const skillCount = deck.filter(row => lookupCard(row.id || row.name)?.type_key === 'Skill').length;
  const drawScore = Number.isFinite(card.cards_draw) ? card.cards_draw * 8 : 0;
  const damageScore = Number.isFinite(card.damage) ? card.damage * (card.hit_count || 1) * 2 : 0;
  const blockScore = Number.isFinite(card.block) ? card.block * 1.8 : 0;
  const scaling = /力量|敏捷|再生|每回合开始/.test(text) ? 18 : 0;
  const status = /状态|诅咒|失去\d+点生命|抽牌堆/.test(text) ? -9 : 0;
  const dilution = deck.length >= 26 ? -4 : 0;
  const role = attackCount >= 14 ? (card.type_key === 'Attack' ? -5 : 5) : skillCount >= 15 ? (card.type_key === 'Skill' ? -4 : 4) : 0;
  const rarity = rarityBonus(card.rarity_key);
  const colorPenalty = !card.color || card.color === 'event' ? -18 : 0;
  return damageScore + blockScore + drawScore + scaling + status + dilution + role + rarity + colorPenalty;
}

function rarityBonus(rarity) {
  return { Starter: 0, Common: 4, Uncommon: 10, Rare: 18, Special: 12 }[rarity] ?? 6;
}

module.exports = { decide };
