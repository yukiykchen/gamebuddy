const cards = require('../data/codex/cards.json');
const relics = require('../data/codex/relics.json');
const {
  ARCHETYPES,
  IRONCLAD_ARCHETYPE_MATRIX,
  scoreIroncladArchetypes,
  isIronclad,
  cardId,
  groupEnabledAmount
} = require('./ironclad-archetypes');

const TEMPLATES = Object.freeze({
  must_take: '{archetype}启动牌「{name}」出现了，能补上{gap}，务必拿下！',
  focus: '「{name}」能补齐{archetype}的{gap}，重点关注！',
  direction: '{archetype}启动牌「{name}」出现，可考虑这个方向。',
  shop_must_take: '商店发现{archetype}关键牌「{name}」，能补上{shopGap}，务必拿下！',
  shop_focus_card: '「{name}」能补齐{archetype}的{gap}，重点关注！',
  shop_focus_relic: '关键遗物「{name}」在售，能改善{archetype}的{gap}，重点关注！',
  unaffordable_card: '发现{archetype}关键牌「{name}」，但目前金币不足。',
  unaffordable_relic: '发现关键遗物「{name}」，但目前金币不足。',
  price_unknown_card: '发现{archetype}关键牌「{name}」，价格尚未确认。',
  price_unknown_relic: '发现关键遗物「{name}」，价格尚未确认。',
  shop_sum: '这两件各自买得起，但现在的金币不够同时拿下，只能优先其一。'
});

function component(fields) {
  return Object.freeze({
    character: 'ironclad',
    kind: 'card',
    condition: null,
    duplicate: Object.freeze({ sufficientAt: 1 }),
    shopGap: fields.gap,
    ...fields,
    duplicate: Object.freeze(fields.duplicate || { sufficientAt: 1 })
  });
}

const CARD_COMPONENTS = [
  component({ archetypeId: 'auto_strike', archetypeKey: 'autoStrike', id: 'HELLRAISER', type: 'starter', functionId: 'auto_gate', substituteGroup: 'auto_gate', gap: '自动打击启动', shopGap: '启动' }),
  component({ archetypeId: 'auto_strike', archetypeKey: 'autoStrike', id: 'POMMEL_STRIKE', type: 'core_synergy', functionId: 'auto_loop', substituteGroup: 'auto_loop', gap: '抽牌循环', duplicate: { sufficientAt: 2, extraBelow: 2 } }),
  component({ archetypeId: 'auto_strike', archetypeKey: 'autoStrike', id: 'PILLAGE', type: 'core_synergy', functionId: 'auto_loop', substituteGroup: 'auto_loop', gap: '抽牌循环', duplicate: { sufficientAt: 2, extraBelow: 2 } }),
  component({ archetypeId: 'auto_strike', archetypeKey: 'autoStrike', id: 'PERFECTED_STRIKE', type: 'core_synergy', functionId: 'auto_payoff', substituteGroup: 'auto_payoff', gap: '打击兑现' }),
  component({ archetypeId: 'auto_strike', archetypeKey: 'autoStrike', id: 'TWIN_STRIKE', type: 'core_synergy', functionId: 'auto_ammo', substituteGroup: 'auto_ammo', gap: '打击弹药', condition: 'auto_gate_active' }),
  component({ archetypeId: 'auto_strike', archetypeKey: 'autoStrike', id: 'SETUP_STRIKE', type: 'core_synergy', functionId: 'auto_ammo', substituteGroup: 'auto_ammo', gap: '打击弹药', condition: 'auto_gate_active' }),
  component({ archetypeId: 'auto_strike', archetypeKey: 'autoStrike', id: 'ASHEN_STRIKE', type: 'core_synergy', functionId: 'auto_ammo', substituteGroup: 'auto_ammo', gap: '打击弹药', condition: 'auto_gate_active' }),

  component({ archetypeId: 'exhaust', archetypeKey: 'exhaust', id: 'FEEL_NO_PAIN', type: 'starter', functionId: 'exhaust_pain', substituteGroup: 'exhaust_pain', gap: '疼痛格挡', shopGap: '启动' }),
  component({ archetypeId: 'exhaust', archetypeKey: 'exhaust', id: 'DARK_EMBRACE', type: 'starter', functionId: 'exhaust_draw', substituteGroup: 'exhaust_draw', gap: '消耗抽牌', shopGap: '启动' }),
  component({ archetypeId: 'exhaust', archetypeKey: 'exhaust', id: 'BURNING_PACT', type: 'core_synergy', functionId: 'exhaust_outlet', substituteGroup: 'exhaust_outlet', gap: '消耗出口' }),
  component({ archetypeId: 'exhaust', archetypeKey: 'exhaust', id: 'TRUE_GRIT', type: 'core_synergy', functionId: 'exhaust_outlet', substituteGroup: 'exhaust_outlet', gap: '消耗出口' }),
  component({ archetypeId: 'exhaust', archetypeKey: 'exhaust', id: 'BRAND', type: 'core_synergy', functionId: 'exhaust_outlet', substituteGroup: 'exhaust_outlet', gap: '消耗出口' }),
  component({ archetypeId: 'exhaust', archetypeKey: 'exhaust', id: 'HAVOC', type: 'core_synergy', functionId: 'exhaust_outlet', substituteGroup: 'exhaust_outlet', gap: '消耗出口' }),
  component({ archetypeId: 'exhaust', archetypeKey: 'exhaust', id: 'CINDER', type: 'core_synergy', functionId: 'exhaust_outlet', substituteGroup: 'exhaust_outlet', gap: '消耗出口' }),
  component({ archetypeId: 'exhaust', archetypeKey: 'exhaust', id: 'THRASH', type: 'core_synergy', functionId: 'exhaust_outlet', substituteGroup: 'exhaust_outlet', gap: '消耗出口' }),
  component({ archetypeId: 'exhaust', archetypeKey: 'exhaust', id: 'FIEND_FIRE', type: 'core_synergy', functionId: 'exhaust_event', substituteGroup: 'exhaust_event', gap: '消耗事件', condition: 'exhaust_both_gates' }),
  component({ archetypeId: 'exhaust', archetypeKey: 'exhaust', id: 'STOKE', type: 'core_synergy', functionId: 'exhaust_event', substituteGroup: 'exhaust_event', gap: '消耗事件', condition: 'exhaust_both_gates' }),
  component({ archetypeId: 'exhaust', archetypeKey: 'exhaust', id: 'SECOND_WIND', type: 'core_synergy', functionId: 'exhaust_event', substituteGroup: 'exhaust_event', gap: '消耗事件', condition: 'exhaust_both_gates' }),
  component({ archetypeId: 'exhaust', archetypeKey: 'exhaust', id: 'CORRUPTION', type: 'core_synergy', functionId: 'exhaust_event', substituteGroup: 'exhaust_event', gap: '消耗事件', condition: 'exhaust_both_gates' }),
  component({ archetypeId: 'exhaust', archetypeKey: 'exhaust', id: 'PACTS_END', type: 'core_synergy', functionId: 'exhaust_payoff', substituteGroup: 'exhaust_payoff', gap: '消耗兑现' }),
  component({ archetypeId: 'exhaust', archetypeKey: 'exhaust', id: 'HOWL_FROM_BEYOND', type: 'core_synergy', functionId: 'exhaust_payoff', substituteGroup: 'exhaust_payoff', gap: '消耗兑现' }),
  component({ archetypeId: 'exhaust', archetypeKey: 'exhaust', id: 'ASHEN_STRIKE', type: 'core_synergy', functionId: 'exhaust_payoff', substituteGroup: 'exhaust_payoff', gap: '消耗兑现' }),

  component({ archetypeId: 'strength', archetypeKey: 'strength', id: 'DEMON_FORM', type: 'starter', functionId: 'strength_source', substituteGroup: 'strength_source', gap: '力量来源', shopGap: '启动' }),
  component({ archetypeId: 'strength', archetypeKey: 'strength', id: 'INFLAME', type: 'starter', functionId: 'strength_source', substituteGroup: 'strength_source', gap: '力量来源', shopGap: '启动' }),
  component({ archetypeId: 'strength', archetypeKey: 'strength', id: 'RUPTURE', type: 'starter', functionId: 'strength_source', substituteGroup: 'strength_source', gap: '力量来源', shopGap: '启动' }),
  component({ archetypeId: 'strength', archetypeKey: 'strength', id: 'DOMINATE', type: 'starter', functionId: 'strength_source', substituteGroup: 'strength_source', gap: '力量来源', shopGap: '启动', condition: 'strength_vulnerable_package' }),
  component({ archetypeId: 'strength', archetypeKey: 'strength', id: 'WHIRLWIND', type: 'core_synergy', functionId: 'strength_multihit', substituteGroup: 'strength_multihit', gap: '多段放大', condition: 'strength_source_active' }),
  component({ archetypeId: 'strength', archetypeKey: 'strength', id: 'CONFLAGRATION', type: 'core_synergy', functionId: 'strength_multihit', substituteGroup: 'strength_multihit', gap: '多段放大', condition: 'strength_source_active' }),
  component({ archetypeId: 'strength', archetypeKey: 'strength', id: 'SWORD_BOOMERANG', type: 'core_synergy', functionId: 'strength_multihit', substituteGroup: 'strength_multihit', gap: '多段放大', condition: 'strength_source_active' }),
  component({ archetypeId: 'strength', archetypeKey: 'strength', id: 'ONE_TWO_PUNCH', type: 'core_synergy', functionId: 'strength_multihit', substituteGroup: 'strength_multihit', gap: '多段放大', condition: 'strength_source_active' }),
  component({ archetypeId: 'strength', archetypeKey: 'strength', id: 'TWIN_STRIKE', type: 'core_synergy', functionId: 'strength_multihit', substituteGroup: 'strength_multihit', gap: '多段放大', condition: 'strength_source_active' }),
  component({ archetypeId: 'strength', archetypeKey: 'strength', id: 'THRASH', type: 'core_synergy', functionId: 'strength_multihit', substituteGroup: 'strength_multihit', gap: '多段放大', condition: 'strength_source_active' }),
  component({ archetypeId: 'strength', archetypeKey: 'strength', id: 'SPITE', type: 'core_synergy', functionId: 'strength_multihit', substituteGroup: 'strength_multihit', gap: '多段放大', condition: 'strength_source_active' }),
  component({ archetypeId: 'strength', archetypeKey: 'strength', id: 'FIGHT_ME', type: 'core_synergy', functionId: 'strength_balance', substituteGroup: 'strength_balance', gap: '力量平衡' }),
  component({ archetypeId: 'strength', archetypeKey: 'strength', id: 'BRAND', type: 'core_synergy', functionId: 'strength_balance', substituteGroup: 'strength_balance', gap: '力量平衡' }),
  component({ archetypeId: 'strength', archetypeKey: 'strength', id: 'SETUP_STRIKE', type: 'core_synergy', functionId: 'strength_balance', substituteGroup: 'strength_balance', gap: '力量平衡' }),

  component({ archetypeId: 'block', archetypeKey: 'block', id: 'BARRICADE', type: 'starter', functionId: 'block_gate', substituteGroup: 'block_gate', gap: '格挡启动', shopGap: '启动' }),
  component({ archetypeId: 'block', archetypeKey: 'block', id: 'UNMOVABLE', type: 'starter', functionId: 'block_growth', substituteGroup: 'block_gate', gap: '格挡启动', shopGap: '启动' }),
  component({ archetypeId: 'block', archetypeKey: 'block', id: 'BODY_SLAM', type: 'core_synergy', functionId: 'block_conversion', substituteGroup: 'block_conversion', gap: '格挡转伤' }),
  component({ archetypeId: 'block', archetypeKey: 'block', id: 'JUGGERNAUT', type: 'core_synergy', functionId: 'block_conversion', substituteGroup: 'block_conversion', gap: '格挡转伤' }),
  component({ archetypeId: 'block', archetypeKey: 'block', id: 'IMPERVIOUS', type: 'core_synergy', functionId: 'block_source', substituteGroup: 'block_source', gap: '格挡来源', condition: 'block_gate_active' }),
  component({ archetypeId: 'block', archetypeKey: 'block', id: 'BLOOD_WALL', type: 'core_synergy', functionId: 'block_source', substituteGroup: 'block_source', gap: '格挡来源', condition: 'block_gate_active' }),
  component({ archetypeId: 'block', archetypeKey: 'block', id: 'FLAME_BARRIER', type: 'core_synergy', functionId: 'block_source', substituteGroup: 'block_source', gap: '格挡来源', condition: 'block_gate_active' }),
  component({ archetypeId: 'block', archetypeKey: 'block', id: 'CRIMSON_MANTLE', type: 'core_synergy', functionId: 'block_source', substituteGroup: 'block_source', gap: '格挡来源', condition: 'block_gate_active' }),
  component({ archetypeId: 'block', archetypeKey: 'block', id: 'STONE_ARMOR', type: 'core_synergy', functionId: 'block_source', substituteGroup: 'block_source', gap: '格挡来源', condition: 'block_gate_active' }),
  component({ archetypeId: 'block', archetypeKey: 'block', id: 'SHRUG_IT_OFF', type: 'core_synergy', functionId: 'block_source', substituteGroup: 'block_source', gap: '格挡来源', condition: 'block_gate_active' }),
  component({ archetypeId: 'block', archetypeKey: 'block', id: 'EVIL_EYE', type: 'core_synergy', functionId: 'block_source', substituteGroup: 'block_source', gap: '格挡来源', condition: 'block_gate_active' })
];

const RELIC_COMPONENTS = [
  component({ archetypeId: 'auto_strike', archetypeKey: 'autoStrike', id: 'STRIKE_DUMMY', kind: 'relic', type: 'core_synergy', functionId: 'auto_payoff', substituteGroup: 'relic:STRIKE_DUMMY', gap: '打击兑现' }),
  component({ archetypeId: 'auto_strike', archetypeKey: 'autoStrike', id: 'BAG_OF_PREPARATION', kind: 'relic', type: 'core_synergy', functionId: 'auto_loop', substituteGroup: 'relic:BAG_OF_PREPARATION', gap: '抽牌循环' }),
  component({ archetypeId: 'exhaust', archetypeKey: 'exhaust', id: 'CHARONS_ASHES', kind: 'relic', type: 'core_synergy', functionId: 'exhaust_payoff', substituteGroup: 'relic:CHARONS_ASHES', gap: '消耗兑现' }),
  component({ archetypeId: 'strength', archetypeKey: 'strength', id: 'VAJRA', kind: 'relic', type: 'core_synergy', functionId: 'strength_source', substituteGroup: 'relic:VAJRA', gap: '力量来源' }),
  component({ archetypeId: 'strength', archetypeKey: 'strength', id: 'GIRYA', kind: 'relic', type: 'core_synergy', functionId: 'strength_source', substituteGroup: 'relic:GIRYA', gap: '力量来源' }),
  component({ archetypeId: 'block', archetypeKey: 'block', id: 'ANCHOR', kind: 'relic', type: 'ordinary_support', functionId: 'block_source', substituteGroup: 'relic:ANCHOR', gap: '普通防御' }),
  component({ archetypeId: 'block', archetypeKey: 'block', id: 'ORICHALCUM', kind: 'relic', type: 'ordinary_support', functionId: 'block_source', substituteGroup: 'relic:ORICHALCUM', gap: '普通防御' })
];

const KEY_COMPONENTS = Object.freeze([...CARD_COMPONENTS, ...RELIC_COMPONENTS]);
const CARD_NAME = new Map(cards.map(card => [card.id, card.name]));
const RELIC_NAME = new Map(relics.map(relic => [relic.id, relic.name]));
const STATUS_RANK = Object.freeze({ missing_starter: 0, incomplete_loop: 1, operational: 2, stable: 3 });

function archetypeName(id) {
  return ARCHETYPES.find(item => item.id === id)?.name || id;
}

function codexName(kind, id) {
  return (kind === 'relic' ? RELIC_NAME : CARD_NAME).get(id) || null;
}

function displayName(kind, id, liveName) {
  const official = codexName(kind, id);
  if (kind === 'relic' && !official) return null;
  if (liveName && official && liveName !== official) return official;
  return liveName || official || null;
}

function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
}

function renderAlert(level, alert, surface) {
  const values = {
    archetype: archetypeName(alert.entry.archetypeId),
    name: alert.name,
    gap: alert.entry.gap,
    shopGap: alert.entry.shopGap || alert.entry.gap
  };
  if (level === 'must_take') return fill(surface === 'shop' ? TEMPLATES.shop_must_take : TEMPLATES.must_take, values);
  if (level === 'focus') {
    if (alert.entry.kind === 'relic') return fill(TEMPLATES.shop_focus_relic, values);
    return fill(surface === 'shop' ? TEMPLATES.shop_focus_card : TEMPLATES.focus, values);
  }
  if (level === 'direction') return fill(TEMPLATES.direction, values);
  if (level === 'unaffordable') {
    return fill(alert.entry.kind === 'relic' ? TEMPLATES.unaffordable_relic : TEMPLATES.unaffordable_card, values);
  }
  return fill(alert.entry.kind === 'relic' ? TEMPLATES.price_unknown_relic : TEMPLATES.price_unknown_card, values);
}

function cardEnables(entry, after) {
  const present = id => after.presentFunctions.some(item => item.id === id);
  if (!present(entry.functionId)) return false;
  if (entry.condition === 'auto_gate_active') return present('auto_gate');
  if (entry.condition === 'strength_source_active') return present('strength_source');
  if (entry.condition === 'block_gate_active') return present('block_gate') || present('block_growth');
  if (entry.condition === 'exhaust_both_gates') return present('exhaust_pain') || present('exhaust_draw');
  return true;
}

function classify(entry, offer, deck, relicList) {
  if (entry.type === 'ordinary_support') return null;
  const name = displayName(entry.kind, entry.id, offer.name);
  if (!name) return null;
  const beforeList = scoreIroncladArchetypes(deck, relicList);
  const afterDeck = entry.kind === 'card' ? [...(deck || []), { id: entry.id, upgraded: Boolean(offer.upgraded) }] : (deck || []);
  const afterRelics = entry.kind === 'relic' ? [...(relicList || []), { id: entry.id }] : (relicList || []);
  const afterList = scoreIroncladArchetypes(afterDeck, afterRelics);
  const before = beforeList.find(item => item.id === entry.archetypeId);
  const after = afterList.find(item => item.id === entry.archetypeId);
  if (entry.kind === 'card' && !cardEnables(entry, after)) return null;
  const amount = entry.kind === 'card'
    ? entry.functionId === 'block_gate' ? (deck || []).filter(copy => cardId(copy) === 'BARRICADE').length
      : entry.functionId === 'block_growth' ? (deck || []).filter(copy => ['UNMOVABLE', 'PROLONG'].includes(cardId(copy))).length
        : groupEnabledAmount(deck, entry.archetypeKey, entry.functionId)
    : (relicList || []).some(relic => (relic?.id || relic) === entry.id) ? entry.duplicate.sufficientAt : 0;
  const beforeHas = before.presentFunctions.some(item => item.id === entry.functionId);
  const afterHas = after.presentFunctions.some(item => item.id === entry.functionId);
  // 普通过牌/起手防御不构成强推某流派的证据。
  const enabledKit = (deck || []).some(copy => {
    const id = cardId(copy);
    const cell = IRONCLAD_ARCHETYPE_MATRIX[id]?.[entry.archetypeKey];
    return cell?.weight > 0 && !['none', 'auto_support', 'exhaust_support', 'strength_throughput', 'block_support'].includes(cell.group)
      && (entry.archetypeId !== 'block' || id !== 'DEFEND_IRONCLAD');
  });
  const delta = after.score - before.score;
  const sufficient = amount >= entry.duplicate.sufficientAt;
  const extra = Number.isFinite(entry.duplicate.extraBelow) && amount < entry.duplicate.extraBelow && delta > 0;
  const closesLoop = STATUS_RANK[after.status] > STATUS_RANK[before.status]
    && (after.status === 'operational' || after.status === 'stable');
  let level = null;
  if (entry.type === 'starter') {
    if (!beforeHas && !sufficient && (enabledKit || closesLoop)) level = 'must_take';
    else if (!beforeHas && !sufficient) level = 'direction';
    else if (extra) level = 'focus';
  } else if (entry.kind === 'relic') {
    // 易伤与木偶能叠加；辅助分槽已满不代表这件遗物没用，不能靠契合度差值拦掉事实通知。
    const strikeDummyHelps = entry.id === 'STRIKE_DUMMY' && before.presentFunctions.some(item => item.id === 'auto_ammo');
    if (enabledKit && (delta > 0 || strikeDummyHelps) && amount < entry.duplicate.sufficientAt) level = 'focus';
  } else if ((!beforeHas && afterHas && !sufficient) || extra) {
    if (delta > 0 || (!beforeHas && afterHas)) level = 'focus';
  }
  if (!level) return null;
  return {
    entry,
    name,
    offer,
    level,
    intent: level,
    delta,
    closesLoop: closesLoop && level !== 'direction',
    beforeStatus: before.status,
    afterStatus: after.status
  };
}

function rank(alert) {
  if (alert.closesLoop) return 0;
  if (alert.intent === 'must_take') return 1;
  if (alert.entry.kind === 'relic') return 2;
  return 3;
}

function bestAlert(offer, deck, relicList) {
  const matches = KEY_COMPONENTS.filter(entry => entry.kind === offer.kind && entry.id === offer.id);
  return matches
    .map(entry => classify(entry, offer, deck, relicList))
    .filter(Boolean)
    .sort((left, right) => rank(left) - rank(right) || right.delta - left.delta)[0] || null;
}

function revealedCard(card) {
  if (!card || card.preview || card.hidden || card.revealed === false || card.random || card.claimed) return null;
  const id = cardId(card);
  if (!id || typeof card.name !== 'string' || !card.name.trim()) return null;
  if (!IRONCLAD_ARCHETYPE_MATRIX[id]) return null;
  return { id, name: card.name, upgraded: Boolean(card.upgraded), kind: 'card', price: card.price, stockKey: card.stockKey };
}

function revealedRelic(item) {
  if (!item || item.stocked === false || item.preview || item.hidden) return null;
  const id = item.id;
  if (!id || typeof item.name !== 'string' || !item.name.trim()) return null;
  if (!RELIC_NAME.has(id)) return null;
  return { id, name: item.name, kind: 'relic', price: item.price, stockKey: item.stockKey };
}

function applyPrice(alert, gold) {
  if (alert.offer.price == null) return { ...alert, level: 'price_unknown' };
  if (Number(alert.offer.price) > Number(gold)) return { ...alert, level: 'unaffordable' };
  return alert;
}

function evaluateCardAlerts({ character, deck = [], relics = [], cards = [] } = {}) {
  if (!isIronclad(character)) return [];
  return cards.map(card => {
    const offer = revealedCard(card);
    if (!offer) return null;
    const alert = bestAlert(offer, deck, relics);
    if (!alert) return null;
    return {
      ...alert,
      surface: 'reward',
      objectKey: `card:${offer.id}:${offer.upgraded}`,
      text: renderAlert(alert.level, alert, 'reward')
    };
  }).filter(Boolean);
}

function evaluateShopAlerts({ character, deck = [], relics = [], gold = 0, items = [] } = {}) {
  if (!isIronclad(character)) return null;
  const offers = [];
  for (const item of items) {
    if (item?.stocked === false) continue;
    const offer = item?.itemType === 'relic' || item?.kind === 'relic'
      ? revealedRelic(item)
      : item?.itemType === 'card' || item?.card || item?.kind === 'card'
        ? revealedCard(item.card ? { ...item.card, id: item.id, name: item.name, price: item.price, stockKey: item.stockKey, upgraded: item.card.upgraded } : item)
        : null;
    if (!offer) continue;
    const alert = bestAlert(offer, deck, relics);
    if (!alert) continue;
    offers.push(applyPrice(alert, gold));
  }
  offers.sort((left, right) => rank(left) - rank(right) || right.delta - left.delta);
  const picked = offers.slice(0, 2);
  if (!picked.length) return null;
  const prices = picked.map(item => item.offer.price);
  const sumBlocked = picked.length === 2
    && prices.every(price => price != null && Number(price) <= Number(gold))
    && prices.reduce((sum, price) => sum + Number(price), 0) > Number(gold);
  const sentences = picked.map((alert, index) => {
    const level = sumBlocked && index > 0 && alert.level === 'must_take' ? 'focus' : alert.level;
    return renderAlert(level, alert, 'shop');
  });
  return {
    surface: 'shop',
    alerts: picked,
    objectKeys: picked.map(item => item.offer.stockKey || `${item.offer.kind}:${item.offer.id}`),
    text: `${sentences.join('')}${sumBlocked ? TEMPLATES.shop_sum : ''}`
  };
}

module.exports = {
  TEMPLATES,
  KEY_COMPONENTS,
  codexName,
  displayName,
  renderAlert,
  evaluateCardAlerts,
  evaluateShopAlerts
};
