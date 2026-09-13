const events = require('../data/codex/events.json');
const relics = require('../data/codex/relics.json');
const potions = require('../data/codex/potions.json');
const cardEvaluations = require('./card-evaluations.json');

const GAME_VERSION = cardEvaluations.game?.version || 'v0.107.1';
const eventById = new Map();
const eventByName = new Map();
const relicNames = relics.map(relic => stripMarkup(relic.name)).filter(name => name.length >= 2);
const potionNames = potions.map(potion => stripMarkup(potion.name)).filter(name => name.length >= 2);

function stripMarkup(value) {
  return String(value || '')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(value) {
  return stripMarkup(value)
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toUpperCase();
}

for (const event of events) {
  eventById.set(normalize(event.id), event);
  eventByName.set(normalize(event.name), event);
}

function eventPages(event) {
  if (!event) return [];
  const pages = Array.isArray(event.pages) ? event.pages.slice() : [];
  if (Array.isArray(event.options) && event.options.length) {
    const initial = pages.find(page => normalize(page.id) === 'INITIAL');
    if (!initial) pages.push({ id: 'INITIAL', description: event.description, options: event.options });
  }
  return pages.filter(page => Array.isArray(page.options) && page.options.length);
}

function optionMatchScore(runtime, catalog) {
  const runtimeId = normalize(runtime?.optionId || runtime?.id);
  const catalogId = normalize(catalog?.id);
  if (runtimeId && catalogId && runtimeId === catalogId) return 100;
  const runtimeLabel = normalize(runtime?.label || runtime?.title);
  const catalogLabel = normalize(catalog?.title || catalog?.label);
  let score = runtimeLabel && catalogLabel && runtimeLabel === catalogLabel ? 30 : 0;
  const runtimeDescription = normalize(runtime?.description);
  const catalogDescription = normalize(catalog?.description);
  if (runtimeDescription && catalogDescription) {
    if (runtimeDescription === catalogDescription) score += 50;
    else if (runtimeDescription.includes(catalogDescription) || catalogDescription.includes(runtimeDescription)) score += 20;
  }
  return score;
}

function pageMatchScore(stateEvent, page) {
  const visible = Array.isArray(stateEvent?.options) ? stateEvent.options.filter(option => option?.locked !== true) : [];
  const catalog = Array.isArray(page?.options) ? page.options : [];
  const pageId = normalize(stateEvent?.pageId);
  if (pageId && pageId === normalize(page?.id)) return 1000;
  let score = 0;
  const description = normalize(stateEvent?.description);
  const pageDescription = normalize(page?.description);
  if (description && pageDescription) {
    if (description === pageDescription) score += 200;
    else if (description.includes(pageDescription) || pageDescription.includes(description)) score += 80;
  }
  for (const option of visible) {
    score += Math.max(0, ...catalog.map(candidate => optionMatchScore(option, candidate)));
  }
  if (visible.length && visible.every(option => catalog.some(candidate => optionMatchScore(option, candidate) > 0))) score += 100;
  score -= Math.abs(visible.length - catalog.length) * 3;
  return score;
}

function matchEventKnowledge(stateEvent) {
  if (!stateEvent) return { event: null, page: null, match: 'none', completeness: 'unknown' };
  const byId = eventById.get(normalize(stateEvent.eventId));
  const byTitle = eventByName.get(normalize(stateEvent.title));
  const event = byId || byTitle || null;
  if (!event) return { event: null, page: null, match: 'none', completeness: 'unknown' };
  const pages = eventPages(event)
    .map(page => ({ page, score: pageMatchScore(stateEvent, page) }))
    .sort((left, right) => right.score - left.score || String(left.page.id).localeCompare(String(right.page.id)));
  const page = pages[0]?.score > 0 ? pages[0].page : null;
  const match = byId ? 'event-id' : 'title';
  return {
    event,
    page,
    match,
    completeness: page ? 'complete' : 'partial',
    gameVersion: GAME_VERSION
  };
}

function numericRange(match, start = 1) {
  const min = Number(match?.[start]);
  const max = Number(match?.[start + 1] || match?.[start]);
  if (!Number.isFinite(min)) return null;
  return { min, max: Number.isFinite(max) ? max : min };
}

function addMatches(text, regex, type, effects, unit, start = 1) {
  for (const match of text.matchAll(regex)) {
    const range = numericRange(match, start);
    if (range) effects.push({ type, ...range, unit });
  }
}

function mentionsAny(text, names) {
  return names.some(name => text.includes(name));
}

function parseOptionEffects(description) {
  const text = stripMarkup(description);
  const compact = text.replace(/\s+/g, '');
  const effects = [];
  addMatches(compact, /(?:获得|提升|增加)(\d+)(?:[-–](\d+))?点?最大生命(?:值)?/g, 'max_hp_gain', effects, 'hp');
  addMatches(compact, /(?:失去|降低)(\d+)(?:[-–](\d+))?点?最大生命(?:值)?/g, 'max_hp_loss', effects, 'hp');
  addMatches(compact, /(?:受到|失去)(\d+)(?:[-–](\d+))?点?(?:生命(?:值)?|伤害)/g, 'hp_loss', effects, 'hp');
  addMatches(compact, /回复(\d+)(?:[-–](\d+))?(?:点)?生命/g, 'heal', effects, 'hp');
  addMatches(compact, /回复(\d+)(?:[-–](\d+))?%(?:Max|最大)?/gi, 'heal_percent', effects, 'percent');
  addMatches(compact, /获得(\d+)(?:[-–](\d+))?金币/g, 'gold_gain', effects, 'gold');
  addMatches(compact, /(?:支付|失去)(\d+)(?:[-–](\d+))?金币/g, 'gold_loss', effects, 'gold');
  addMatches(compact, /(?:移除|从.{0,16}移除)(\d+)张牌/g, 'remove_cards', effects, 'cards');
  addMatches(compact, /从.{0,24}(\d+)张牌移除/g, 'remove_cards', effects, 'cards');
  addMatches(compact, /(?:随机)?升级(\d+)张牌/g, 'upgrade_cards', effects, 'cards');
  addMatches(compact, /(?:随机)?(\d+)张?牌升级/g, 'upgrade_cards', effects, 'cards');
  addMatches(compact, /(?:随机)?降级(\d+)张牌/g, 'downgrade_cards', effects, 'cards');
  addMatches(compact, /变化(\d+)张牌/g, 'transform_cards', effects, 'cards');
  if (/升级.*(?:一张|1张)牌|升级你牌组中的一张牌|随机升级一张牌/.test(compact)) effects.push({ type: 'upgrade_cards', min: 1, max: 1, unit: 'cards' });
  if (/移除.*(?:一张|1张)牌|从你的牌组中选择(?:一张|1张)牌移除/.test(compact)) effects.push({ type: 'remove_cards', min: 1, max: 1, unit: 'cards' });
  if (/变化.*(?:一张|1张)牌|选择(?:一张|1张)牌变化/.test(compact)) effects.push({ type: 'transform_cards', min: 1, max: 1, unit: 'cards' });
  if (/升级ALL|升级所有.*牌/i.test(compact)) effects.push({ type: 'upgrade_all_cards', unit: 'cards' });
  if (/随机.{0,16}牌.{0,16}移除/.test(compact) || /a random Card.{0,16}移除/i.test(text)) effects.push({ type: 'remove_random_card', unit: 'card' });
  if (/回复全部生命/.test(compact)) effects.push({ type: 'heal_full', unit: 'hp' });
  if (/失去所有金币/.test(compact)) effects.push({ type: 'gold_loss_all', unit: 'gold' });
  if (/附魔/.test(compact)) effects.push({ type: 'enchant_card', unit: 'card' });
  if (/获得.{0,24}遗物|获取.{0,24}遗物/.test(compact)
    || (/(?:获得|获取)/.test(compact) && mentionsAny(text, relicNames))) effects.push({ type: 'gain_relic', unit: 'relic' });
  if (/失去.{0,24}遗物|用.{0,24}遗物.{0,12}换/i.test(compact)
    || (/失去/.test(compact) && mentionsAny(text, relicNames))) effects.push({ type: 'lose_relic', unit: 'relic' });
  if (/获得.{0,24}药水|获取.{0,24}药水/.test(compact)
    || (/(?:获得|获取)/.test(compact) && mentionsAny(text, potionNames))) effects.push({ type: 'gain_potion', unit: 'potion' });
  if (/失去.{0,24}(?:药水|Potion)/i.test(compact)
    || (/失去/.test(compact) && mentionsAny(text, potionNames))) effects.push({ type: 'lose_potion', unit: 'potion' });
  if (/(?:添加|加入).{0,36}(?:牌组|牌堆)|获得.{0,24}(?:卡牌|牌奖励)/.test(compact)) effects.push({ type: 'gain_cards', unit: 'cards' });
  if (/(?:腐朽|凡庸|愧疚|笨拙|债务|霉运|睡眠不佳)/.test(compact)) effects.push({ type: 'negative_card_or_effect', unit: 'effect' });
  if (/进入战斗|与.{0,20}战斗|战斗来|和它们战斗/.test(compact)) effects.push({ type: 'combat', unit: 'combat' });
  if (/随机|random/i.test(text)) effects.push({ type: 'random', unit: 'uncertainty' });
  if (/Set Max HP to\s*(\d+)/i.test(text)) {
    const match = text.match(/Set Max HP to\s*(\d+)/i);
    effects.push({ type: 'set_max_hp', min: Number(match[1]), max: Number(match[1]), unit: 'hp' });
  }
  return [...new Map(effects.map(effect => [`${effect.type}:${effect.min ?? ''}:${effect.max ?? ''}`, effect])).values()];
}

function midpoint(effect) {
  return ((Number(effect.min) || 0) + (Number(effect.max) || Number(effect.min) || 0)) / 2;
}

function effectLabel(effect) {
  const amount = effect.min == null ? '' : effect.min === effect.max ? `${effect.min}` : `${effect.min}–${effect.max}`;
  const labels = {
    max_hp_gain: `增加 ${amount} 最大生命`, max_hp_loss: `失去 ${amount} 最大生命`, hp_loss: `失去 ${amount} 生命`,
    heal: `回复 ${amount} 生命`, heal_percent: `回复 ${amount}% 最大生命`, heal_full: '回复全部生命', gold_gain: `获得 ${amount} 金币`,
    gold_loss: `支付 ${amount} 金币`, remove_cards: `移除 ${amount} 张牌`, remove_random_card: '随机移除一张牌', upgrade_cards: `升级 ${amount} 张牌`,
    downgrade_cards: `降级 ${amount} 张牌`, transform_cards: `变化 ${amount} 张牌`, upgrade_all_cards: '升级全部卡牌',
    gold_loss_all: '失去所有金币', enchant_card: '为卡牌附魔', gain_relic: '获得遗物', lose_relic: '失去遗物',
    gain_potion: '获得药水', lose_potion: '失去药水', gain_cards: '获得卡牌',
    negative_card_or_effect: '获得负面牌或持续负面效果', combat: '进入战斗', random: '结果包含随机性', set_max_hp: `最大生命变为 ${amount}`
  };
  return labels[effect.type] || effect.type;
}

function analyzeOption(option, state, catalogOption, knowledge) {
  const description = option.description || catalogOption?.description || '';
  const effects = parseOptionEffects(description);
  const hp = Number(state?.player?.hp) || 0;
  const maxHp = Number(state?.player?.maxHp) || hp || 1;
  const gold = Number(state?.player?.gold) || 0;
  let score = 0;
  let fatal = false;
  let insufficientResources = false;
  const pros = [];
  const cons = [];
  let riskPoints = 0;

  for (const effect of effects) {
    const value = midpoint(effect);
    switch (effect.type) {
      case 'max_hp_gain': score += value * 2.4; pros.push(effectLabel(effect)); break;
      case 'max_hp_loss': score -= value * 2.8; riskPoints += value / Math.max(1, maxHp) * 100; cons.push(effectLabel(effect)); break;
      case 'hp_loss':
        score -= value * (hp / maxHp < 0.4 ? 2.4 : 1.25);
        riskPoints += (Number(effect.max) || value) / Math.max(1, hp) * 100;
        fatal ||= (Number(effect.max) || value) >= hp;
        cons.push(effectLabel(effect));
        break;
      case 'heal': score += Math.min(value, Math.max(0, maxHp - hp)); pros.push(effectLabel(effect)); break;
      case 'heal_percent': score += Math.min(maxHp * value / 100, Math.max(0, maxHp - hp)); pros.push(effectLabel(effect)); break;
      case 'heal_full': score += Math.max(0, maxHp - hp); pros.push(effectLabel(effect)); break;
      case 'gold_gain': score += value * 0.12; pros.push(effectLabel(effect)); break;
      case 'gold_loss':
        score -= value * 0.04;
        insufficientResources ||= Number(effect.min) > gold;
        cons.push(effectLabel(effect));
        break;
      case 'gold_loss_all': score -= gold * 0.1; cons.push(effectLabel(effect)); break;
      case 'remove_cards': score += value * 14; pros.push(effectLabel(effect)); break;
      case 'remove_random_card': score -= 8; riskPoints += 15; cons.push(effectLabel(effect)); break;
      case 'upgrade_cards': score += value * 11; pros.push(effectLabel(effect)); break;
      case 'upgrade_all_cards': score += Math.max(24, (state?.player?.cards || []).filter(card => !card?.upgraded).length * 7); pros.push(effectLabel(effect)); break;
      case 'downgrade_cards': score -= value * 14; cons.push(effectLabel(effect)); break;
      case 'transform_cards': score += value * 5; pros.push(effectLabel(effect)); break;
      case 'enchant_card': score += 12; pros.push(effectLabel(effect)); break;
      case 'gain_relic': score += 24; pros.push(effectLabel(effect)); break;
      case 'lose_relic': score -= 20; cons.push(effectLabel(effect)); break;
      case 'gain_potion': score += 7; pros.push(effectLabel(effect)); break;
      case 'lose_potion': score -= 6; cons.push(effectLabel(effect)); break;
      case 'gain_cards': score += 4; pros.push(effectLabel(effect)); break;
      case 'negative_card_or_effect': score -= 20; riskPoints += 20; cons.push(effectLabel(effect)); break;
      case 'combat': score -= hp / maxHp < 0.5 ? 18 : 8; riskPoints += hp / maxHp < 0.5 ? 35 : 15; cons.push(effectLabel(effect)); break;
      case 'random': score -= 2; cons.push(effectLabel(effect)); break;
      case 'set_max_hp': score -= Math.max(0, maxHp - value) * 2.8; riskPoints += 70; cons.push(effectLabel(effect)); break;
      default: break;
    }
  }

  const locked = option.locked === true;
  const eligible = !locked && !fatal && !insufficientResources;
  const comparable = effects.some(effect => effect.type !== 'random');
  const unknown = comparable ? [] : [description ? '效果文本尚未被确定性分析器识别' : '没有可确认的效果文本'];
  if (fatal) cons.unshift('当前生命下会立即致死');
  if (insufficientResources) cons.unshift('当前金币不足');
  if (locked) cons.unshift('游戏当前已锁定');
  const riskLevel = fatal ? 'fatal' : riskPoints >= 50 ? 'high' : riskPoints >= 20 ? 'medium' : 'low';
  const confidenceBase = knowledge.completeness === 'complete' ? 0.88 : knowledge.event ? 0.7 : 0.55;
  const confidence = Math.max(0.25, confidenceBase - (unknown.length ? 0.25 : 0) - (effects.some(effect => effect.type === 'random') ? 0.08 : 0));
  return {
    score: Math.round(score * 10) / 10,
    eligible,
    comparable,
    riskLevel,
    fatal,
    insufficientResources,
    pros: [...new Set(pros)].slice(0, 4),
    cons: [...new Set(cons)].slice(0, 4),
    unknown,
    effects,
    confidence: Math.round(confidence * 100) / 100,
    source: knowledge.event ? 'runtime+spire-codex' : 'runtime-only',
    catalogOptionId: catalogOption?.id || null
  };
}

function findCatalogOption(option, page, event) {
  const candidates = [
    ...(page?.options || []),
    ...(event?.options || []),
    ...(event?.pages || []).flatMap(item => item.options || [])
  ];
  return candidates
    .map(candidate => ({ candidate, score: optionMatchScore(option, candidate) }))
    .sort((left, right) => right.score - left.score)[0]?.score > 0
    ? candidates
      .map(candidate => ({ candidate, score: optionMatchScore(option, candidate) }))
      .sort((left, right) => right.score - left.score)[0].candidate
    : null;
}

function analyzeEventChoices(state) {
  const stateEvent = state?.event || null;
  const knowledge = matchEventKnowledge(stateEvent);
  const options = Array.isArray(stateEvent?.options) ? stateEvent.options : [];
  const analyses = options.map((option, index) => {
    const catalogOption = findCatalogOption(option, knowledge.page, knowledge.event);
    return {
      index: Number(option.index ?? index),
      optionId: option.optionId || catalogOption?.id || null,
      label: option.label || catalogOption?.title || `选项 ${index + 1}`,
      description: option.description || catalogOption?.description || '',
      locked: option.locked === true,
      analysis: analyzeOption(option, state, catalogOption, knowledge)
    };
  });
  return {
    eventKnowledge: {
      eventId: knowledge.event?.id || stateEvent?.eventId || null,
      eventName: knowledge.event?.name || stateEvent?.title || null,
      pageId: knowledge.page?.id || stateEvent?.pageId || null,
      gameVersion: knowledge.gameVersion || GAME_VERSION,
      match: knowledge.match,
      completeness: knowledge.completeness,
      source: knowledge.event ? 'spire-codex' : 'runtime-only',
      preconditions: knowledge.event?.preconditions || []
    },
    options: analyses
  };
}

module.exports = {
  GAME_VERSION,
  stripMarkup,
  normalize,
  eventPages,
  matchEventKnowledge,
  parseOptionEffects,
  analyzeOption,
  analyzeEventChoices
};
