const { SCHEMA } = require('../recommendation');
const { createSpireCodexClient, normalizeKey, stripMarkup } = require('../knowledge/spire-codex');
const { lookupRelic, lookupPotion } = require('../codex-db');
const { analyzeCard, deckContext, upcomingThreats } = require('./card-reward');

const codexClient = createSpireCodexClient();
const ITEM_TYPES = new Set(['card', 'relic', 'potion', 'service']);

function normalizePrice(value) {
  if (value === null || value === undefined || value === '') return null;
  const price = Number(value);
  return Number.isFinite(price) ? Math.max(0, price) : null;
}

function normalizeShop(payload, state) {
  if (!payload || typeof payload !== 'object') return null;
  const gold = Number.isFinite(Number(payload.gold)) ? Math.max(0, Number(payload.gold)) : Number(state?.player?.gold) || 0;
  const items = (Array.isArray(payload.items) ? payload.items : [])
    .filter(item => item && ITEM_TYPES.has(item.itemType) && (item.id || item.name))
    .map((item, offset) => {
      const price = normalizePrice(item.price);
      return {
        ...item,
        index: Number.isInteger(item.index) ? item.index : offset,
        id: String(item.id || item.name),
        name: String(item.name || item.id),
        price,
        stocked: item.stocked !== false,
        affordable: item.affordable === true || (price !== null && price <= gold),
        onSale: item.onSale === true
      };
    });
  if (!items.length) return null;
  return { gold, items };
}

function findShop(observation) {
  const state = observation?.state;
  if (state && Object.prototype.hasOwnProperty.call(state, 'shop')) return normalizeShop(state.shop, state);
  const events = observation?.recentEvents || [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.name === 'shop.opened' || event?.name === 'shop.updated') return normalizeShop(event.data, state);
    if (['shop.closed', 'map.opened', 'combat.started', 'rest.opened', 'event.opened', 'card.reward.opened'].includes(event?.name)) return null;
  }
  return normalizeShop(state?.shop, state);
}

function shopSignature(observation) {
  const shop = findShop(observation);
  if (!shop) return '';
  return JSON.stringify({
    gold: shop.gold,
    items: shop.items.map(item => [item.index, item.itemType, normalizeKey(item.id || item.name), item.price, item.stocked, item.card?.upgraded === true])
  });
}

function threatTags(knowledge, threats) {
  const encounters = [
    knowledge?.threats?.knownBoss,
    ...(knowledge?.threats?.knownUpcomingElites || []),
    ...(threats?.eliteSoon ? knowledge?.threats?.possibleElites || [] : [])
  ].filter(Boolean);
  return new Set(encounters.flatMap(encounter => (encounter.monsters || []).flatMap(monster => monster.mechanicTags || [])));
}

function futureShopCount(state) {
  const nodes = new Map((state?.map?.nodes || []).map(node => [node.id, node]));
  const current = state?.map?.current;
  const shopNodes = new Set();
  for (const route of state?.map?.routes || []) {
    const start = current && route.includes(current) ? route.indexOf(current) + 1 : 0;
    for (const id of route.slice(start)) {
      if (nodes.get(id)?.type === 'Shop') shopNodes.add(id);
    }
  }
  return shopNodes.size;
}

function effectText(item, catalog) {
  return stripMarkup(item.description || catalog?.description || catalog?.description_raw || '');
}

function namedThreats(knowledge) {
  return {
    knownBoss: knowledge?.threats?.knownBoss?.name || null,
    knownUpcomingElites: (knowledge?.threats?.knownUpcomingElites || []).map(item => item.name),
    possibleElites: (knowledge?.threats?.possibleElites || []).map(item => item.name)
  };
}

function removeTarget(deck) {
  const candidates = (deck || []).map((card, index) => {
    const name = card.name || card.id || `第 ${index + 1} 张牌`;
    const text = `${card.id || ''} ${name} ${card.type || card.type_key || ''}`;
    let score = 20;
    const reasons = [];
    if (/curse|诅咒/i.test(text)) {
      score += 90;
      reasons.push('诅咒会持续污染抽牌');
    }
    if (/strike|打击/i.test(text)) {
      score += 48;
      reasons.push('起手攻击的后期效率通常偏低');
    }
    if (/defend|防御/i.test(text)) {
      score += 42;
      reasons.push('起手防御会稀释更高效的防御循环');
    }
    if (card.upgraded === true || /\+$/.test(name)) score -= 22;
    return { index, id: card.id || name, name, score, reason: reasons[0] || '删除后可以提高核心牌的抽取稳定性' };
  }).sort((left, right) => right.score - left.score || left.index - right.index);
  return candidates[0] || null;
}

function analyzeRelic(item, state, knowledge, threats, tags) {
  const catalog = lookupRelic(item.id) || lookupRelic(item.name);
  const effect = effectText(item, catalog);
  const searchable = effect.toLowerCase();
  const rarity = String(item.rarity || catalog?.rarity_key || catalog?.rarity || '未知');
  const owned = (state?.player?.relics || []).some(relic => normalizeKey(relic.id || relic.name) === normalizeKey(item.id || item.name));
  const pros = [];
  const cons = [];
  let raw = /rare|稀有/i.test(rarity) ? 78 : /uncommon|罕见/i.test(rarity) ? 72 : /shop|商店/i.test(rarity) ? 74 : 66;
  if (/能量|energy|抽.{0,4}牌|draw/.test(searchable)) {
    raw += 10;
    pros.push('改善每回合资源或牌组循环');
  }
  if (/格挡|block|治疗|回复|heal|再生/.test(searchable)) {
    raw += threats.eliteSoon || threats.bossSoon ? 9 : 5;
    pros.push('提供持续生存收益');
  }
  if (/力量|strength|易伤|vulnerable|中毒|poison|充能球|orb|召唤|summon|星能|star/.test(searchable)) {
    const deckText = JSON.stringify(knowledge.deckCards || []).toLowerCase();
    if (['力量', 'strength', '易伤', 'vulnerable', '中毒', 'poison', '充能球', 'orb', '召唤', 'summon', '星能', 'star'].some(token => searchable.includes(token) && deckText.includes(token))) {
      raw += 9;
      pros.push('与当前牌组已有机制形成协同');
    } else {
      cons.push('效果带有流派条件，当前牌组未确认有稳定协同');
    }
  }
  if ((tags.has('multi_hit') || tags.has('burst_damage')) && /虚弱|weak|力量|strength|格挡|block/.test(searchable)) {
    raw += 7;
    pros.push('能帮助处理后续多段或爆发威胁');
  }
  if (tags.has('status_cards') && /抽|draw|消耗|exhaust/.test(searchable)) {
    raw += 5;
    pros.push('能改善状态牌污染下的循环');
  }
  if (/金币|gold|商店|merchant/.test(searchable)) {
    const late = Number(state?.run?.act) >= 3;
    raw += late ? -5 : 4;
    (late ? cons : pros).push(late ? '经济收益需要时间兑现，当前章节偏晚' : '后续楼层仍有时间兑现经济收益');
  }
  if (owned) {
    raw -= 35;
    cons.push('已经持有同名遗物，需确认重复效果是否有效');
  }
  if (!effect) cons.push('未读取到完整效果，判断置信度较低');
  if (!pros.length) pros.push('遗物提供跨战斗的永久收益');
  return { raw, effect: effect || null, rarity, pros: pros.slice(0, 3), cons: cons.slice(0, 3) };
}

function analyzePotion(item, state, threats, tags) {
  const catalog = lookupPotion(item.id) || lookupPotion(item.name);
  const effect = effectText(item, catalog);
  const searchable = effect.toLowerCase();
  const maxSlotsValue = state?.player?.maxPotionSlots;
  const maxSlots = Number(maxSlotsValue);
  const potionCount = (state?.player?.potions || []).length;
  const slotsKnown = maxSlotsValue !== null && maxSlotsValue !== undefined && maxSlotsValue !== '' && Number.isFinite(maxSlots) && maxSlots >= 0;
  const freeSlots = slotsKnown ? Math.max(0, maxSlots - potionCount) : null;
  const hp = Number(state?.player?.hp) || 0;
  const maxHp = Math.max(1, Number(state?.player?.maxHp) || 1);
  const pros = [];
  const cons = [];
  let raw = 55;
  if (/治疗|回复|再生|heal|regen|格挡|block|虚弱|weak/.test(searchable)) {
    raw += hp / maxHp <= 0.35 ? 18 : hp / maxHp < 0.65 ? 10 : 4;
    pros.push('能在高压战斗中提供一次性生存保险');
  }
  if (/伤害|damage|力量|strength|易伤|vulnerable/.test(searchable)) {
    raw += threats.eliteSoon || threats.bossSoon ? 10 : 5;
    pros.push('能在精英或 Boss 的关键回合补节奏');
  }
  if (/抽|draw|能量|energy/.test(searchable)) {
    raw += 8;
    pros.push('可以修复关键回合的手牌或能量');
  }
  if (tags.has('artifact') && /易伤|虚弱|中毒|debuff|weak|vulnerable|poison/.test(searchable)) {
    raw -= 5;
    cons.push('后续敌人可能有人工制品，减益药水不一定立即生效');
  }
  if (freeSlots === 0) {
    raw -= 32;
    cons.push('药水槽已满，购买前必须先使用或丢弃一瓶');
  } else if (freeSlots === null) {
    cons.push('当前版本未确认药水槽上限，购买前请检查空位');
  }
  if (!effect) cons.push('未读取到完整效果，判断置信度较低');
  if (!pros.length) pros.push('提供一次性战斗资源，可留给后续强敌');
  return { raw, effect: effect || null, rarity: item.rarity || catalog?.rarity_key || catalog?.rarity || null, pros: pros.slice(0, 3), cons: cons.slice(0, 3), freeSlots };
}

function priceAdjustedScore(raw, price, type, onSale) {
  const rate = type === 'relic' ? 0.075 : type === 'potion' ? 0.11 : type === 'service' ? 0.08 : 0.1;
  return Math.max(0, Math.min(100, Math.round(raw - price * rate + (onSale ? 7 : 0))));
}

function analyzeItems(shop, state, knowledge) {
  const context = deckContext(state, knowledge);
  const threats = upcomingThreats(state, { context: {} });
  const tags = threatTags(knowledge, threats);
  const cardByKey = new Map((knowledge.cards || []).map(card => [normalizeKey(card.id || card.name), card]));
  const target = removeTarget(knowledge.deckCards || state?.player?.cards || []);
  return shop.items.map(item => {
    const base = {
      index: item.index,
      itemType: item.itemType,
      id: item.id,
      name: item.name,
      price: item.price,
      affordable: item.stocked && item.price !== null && item.price <= shop.gold,
      stocked: item.stocked,
      onSale: item.onSale,
      rarity: item.rarity || null
    };
    if (item.itemType === 'card') {
      const card = cardByKey.get(normalizeKey(item.id || item.name)) || { ...(item.card || {}), id: item.id, name: item.name, description: item.description };
      const analysis = analyzeCard(card, state, context, threats, null, tags);
      return { ...base, score: item.price === null ? 0 : priceAdjustedScore(analysis.score + 4, item.price, 'card', item.onSale), analysis: { ...analysis, effect: analysis.description } };
    }
    if (item.itemType === 'relic') {
      const analysis = analyzeRelic(item, state, knowledge, threats, tags);
      return { ...base, score: item.price === null ? 0 : priceAdjustedScore(analysis.raw, item.price, 'relic', item.onSale), analysis };
    }
    if (item.itemType === 'potion') {
      const analysis = analyzePotion(item, state, threats, tags);
      return { ...base, score: item.price === null ? 0 : priceAdjustedScore(analysis.raw, item.price, 'potion', item.onSale), analysis };
    }
    const raw = target ? Math.min(96, target.score) : 0;
    const analysis = {
      effect: '从牌组中永久删除一张牌。',
      pros: target ? [target.reason, '牌组更精简后更容易抽到核心牌'] : [],
      cons: target ? [] : ['没有找到明确值得删除的牌'],
      removeTarget: target
    };
    return { ...base, score: item.price === null ? 0 : priceAdjustedScore(raw, item.price, 'service', item.onSale), analysis };
  });
}

function combinations(items, gold, maxItems = 3) {
  const legal = items.filter(item => item.affordable && item.stocked && Number.isFinite(item.price) && item.price <= gold)
    .sort((left, right) => right.score - left.score || left.price - right.price)
    .slice(0, 12);
  const output = [];
  function walk(start, picked, spent) {
    if (picked.length) output.push({ items: picked.slice(), totalSpend: spent });
    if (picked.length >= maxItems) return;
    for (let index = start; index < legal.length; index += 1) {
      const item = legal[index];
      if (spent + item.price > gold) continue;
      walk(index + 1, [...picked, item], spent + item.price);
    }
  }
  walk(0, [], 0);
  return output;
}

function scorePlan(plan, gold, state) {
  const ordered = [...plan.items].sort((left, right) => right.score - left.score || left.price - right.price);
  let score = 44;
  ordered.forEach((item, index) => {
    score += Math.max(-8, item.score - 44) * [1, 0.62, 0.38][index];
  });
  const potionCount = ordered.filter(item => item.itemType === 'potion').length;
  const maxSlotsValue = state?.player?.maxPotionSlots;
  const maxSlots = Number(maxSlotsValue);
  const slotsKnown = maxSlotsValue !== null && maxSlotsValue !== undefined && maxSlotsValue !== '' && Number.isFinite(maxSlots);
  const freeSlots = slotsKnown ? Math.max(0, maxSlots - (state?.player?.potions || []).length) : null;
  if (freeSlots !== null && potionCount > freeSlots) score -= (potionCount - freeSlots) * 24;
  if (ordered.filter(item => item.itemType === 'card').length > 1) score -= 6;
  score -= gold > 0 ? (plan.totalSpend / gold) * 7 : 0;
  return Math.round(score);
}

function buildPlans(analyses, shop, state) {
  const plans = combinations(analyses, shop.gold).map(plan => {
    const items = [...plan.items].sort((left, right) => right.score - left.score || left.price - right.price);
    return {
      action: 'BUY_PLAN',
      score: scorePlan({ ...plan, items }, shop.gold, state),
      totalSpend: plan.totalSpend,
      remainingGold: shop.gold - plan.totalSpend,
      items
    };
  }).sort((left, right) => right.score - left.score || left.totalSpend - right.totalSpend);
  const futureShops = futureShopCount(state);
  const bestItem = analyses.filter(item => item.affordable).sort((left, right) => right.score - left.score)[0];
  const saveScore = 52 + Math.min(10, futureShops * 4) + (!bestItem || bestItem.score < 55 ? 8 : 0);
  const save = { action: 'SAVE_GOLD', score: saveScore, totalSpend: 0, remainingGold: shop.gold, items: [] };
  return [...plans.slice(0, 10), save].sort((left, right) => right.score - left.score || left.totalSpend - right.totalSpend);
}

function planLabel(plan) {
  if (plan.action === 'SAVE_GOLD') return '先不买，保留金币';
  const purchases = plan.items
    .filter(item => item.itemType !== 'service')
    .map(item => `「${item.name}」`);
  const removals = plan.items
    .filter(item => item.itemType === 'service' && item.analysis?.removeTarget)
    .map(item => `删除「${item.analysis.removeTarget.name}」`);
  const parts = [];
  if (purchases.length) parts.push(`买${purchases.join('、')}`);
  parts.push(...removals);
  return parts.join('，并') || '按完整购物清单购买';
}

function ruleReason(plan, shop, threats) {
  if (plan.action === 'SAVE_GOLD') return `当前商品对牌组的提升不足以覆盖机会成本，建议保留 ${shop.gold} 金币，等待后续更高价值的消费。`;
  const first = plan.items[0];
  const benefit = first.analysis?.pros?.[0] || '这是当前预算内提升最大的选项';
  const threat = threats.knownBoss ? `并结合已确定 Boss「${threats.knownBoss}」` : threats.knownUpcomingElites.length ? `并针对已确定精英「${threats.knownUpcomingElites[0]}」` : '';
  return `建议一次性${planLabel(plan)}：${benefit}${threat}。整份清单花费 ${plan.totalSpend}，剩余 ${plan.remainingGold} 金币。`;
}

function compactItem(item) {
  return {
    index: item.index,
    itemType: item.itemType,
    id: item.id,
    name: item.name,
    price: item.price,
    score: item.score,
    onSale: item.onSale,
    rarity: item.rarity,
    analysis: item.analysis
  };
}

function recommendationFor(plan, plans, analyses, shop, state, knowledge, source, reason, now) {
  const threats = namedThreats(knowledge);
  const first = plan.items[0] || null;
  const action = plan.action === 'SAVE_GOLD'
    ? 'SAVE_GOLD'
    : first?.itemType === 'service' ? 'REMOVE_CARD' : 'BUY_ITEM';
  return {
    schema: SCHEMA,
    task: 'shop_choice',
    timestamp: now,
    source,
    confidence: Math.max(0.48, Math.min(source === 'llm' ? 0.9 : 0.82, (source === 'llm' ? 0.68 : 0.56) + Math.abs((plans[0]?.score || 0) - (plans[1]?.score || 0)) / 70)),
    reason,
    primary: {
      action,
      label: planLabel(plan),
      itemIndex: first?.index ?? null,
      itemType: first?.itemType ?? null,
      itemId: first?.id ?? null,
      itemName: first?.name ?? null,
      price: first?.price ?? 0,
      removeCardId: first?.analysis?.removeTarget?.id || null,
      removeCardName: first?.analysis?.removeTarget?.name || null,
      totalSpend: plan.totalSpend,
      remainingGold: plan.remainingGold,
      plan: plan.items.map(compactItem),
      analysis: first?.analysis || null
    },
    alternatives: plans.filter(candidate => candidate !== plan).slice(0, 4).map(candidate => ({
      action: candidate.action,
      label: planLabel(candidate),
      score: candidate.score,
      totalSpend: candidate.totalSpend,
      remainingGold: candidate.remainingGold,
      items: candidate.items.map(compactItem)
    })),
    inventory: analyses.map(compactItem),
    context: {
      gold: shop.gold,
      deckSize: (state?.player?.cards || []).length,
      potionCount: (state?.player?.potions || []).length,
      maxPotionSlots: state?.player?.maxPotionSlots ?? null,
      futureShops: futureShopCount(state),
      ...threats
    },
    knowledgeSource: knowledge.source
  };
}

function promptPayload(plans, analyses, shop, state, knowledge) {
  return {
    player: {
      act: state?.run?.act,
      floor: state?.run?.floor,
      hp: state?.player?.hp,
      maxHp: state?.player?.maxHp,
      gold: shop.gold,
      energyPerTurn: state?.player?.maxEnergy,
      potionCount: (state?.player?.potions || []).length,
      maxPotionSlots: state?.player?.maxPotionSlots ?? null
    },
    deck: (knowledge.deckCards || []).map(card => ({
      id: card.id || card.name,
      name: card.name || card.id,
      type: card.type || card.type_key || null,
      upgraded: card.upgraded === true,
      cost: card.energyCost ?? card.cost ?? null,
      description: stripMarkup(card.description || card.description_raw || '') || null,
      mechanicTags: card.evaluation?.mechanicTags || []
    })),
    ownedRelics: (knowledge.relics || []).map(relic => ({
      id: relic.id || relic.name,
      name: relic.name || relic.id,
      effect: stripMarkup(relic.description || relic.description_raw || '') || null
    })),
    ownedPotions: (knowledge.potions || []).map(potion => ({
      id: potion.id || potion.name,
      name: potion.name || potion.id,
      effect: stripMarkup(potion.description || potion.description_raw || '') || null
    })),
    map: state?.map || null,
    threats: knowledge.threats,
    inventory: analyses.map(compactItem),
    candidates: plans.slice(0, 10).map((plan, index) => ({
      index,
      action: plan.action,
      score: plan.score,
      totalSpend: plan.totalSpend,
      remainingGold: plan.remainingGold,
      items: plan.items.map(compactItem)
    }))
  };
}

async function recommendShop(observation, { llm, now = Date.now(), codex = codexClient } = {}) {
  const state = observation?.state;
  const shop = findShop(observation);
  if (!state || !shop) return null;
  const cardItems = shop.items.filter(item => item.itemType === 'card').map(item => ({ ...item.card, id: item.id, name: item.name, description: item.card?.description || item.description }));
  const knowledge = await codex.loadDraftContext(state, {
    cards: cardItems,
    context: {
      act: state.run?.act,
      floor: state.run?.floor,
      actId: state.run?.actId,
      actName: state.run?.actName,
      nextBossId: state.run?.nextBossId,
      nextBoss: state.run?.nextBoss
    }
  });
  const analyses = analyzeItems(shop, state, knowledge);
  const plans = buildPlans(analyses, shop, state);
  if (!plans.length) return null;
  let chosen = plans[0];
  let source = 'rules';
  const threats = namedThreats(knowledge);
  let reason = ruleReason(chosen, shop, threats);
  if (llm?.enabled && typeof llm.completeShop === 'function') {
    try {
      const candidates = plans.slice(0, 10);
      const pick = await llm.completeShop(promptPayload(candidates, analyses, shop, state, knowledge));
      if (Number.isInteger(pick?.index) && candidates[pick.index]) {
        chosen = candidates[pick.index];
        source = 'llm';
        reason = pick.reason?.trim() || ruleReason(chosen, shop, threats);
      }
    } catch {
      // Rule plan remains valid when model review is unavailable.
    }
  }
  return recommendationFor(chosen, plans, analyses, shop, state, knowledge, source, reason, now);
}

module.exports = {
  normalizeShop,
  findShop,
  shopSignature,
  removeTarget,
  analyzeItems,
  buildPlans,
  recommendShop
};
