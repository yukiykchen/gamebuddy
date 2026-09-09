const strategy = require('../strategy.json');
const cardEvaluations = require('../../../knowledge/card-evaluations.json');

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, '');
}

const knowledgeByKey = new Map();
for (const card of cardEvaluations.cards || []) {
  for (const key of [card.id, card.name, card.nameEn].map(normalize).filter(Boolean)) {
    knowledgeByKey.set(key, card);
  }
}

function cardKnowledge(card) {
  return knowledgeByKey.get(normalize(card?.id)) || knowledgeByKey.get(normalize(card?.name)) || null;
}

function stripMarkup(value) {
  return String(value || '')
    .replace(/\[(?:energy|star):(\d+)\]/gi, ' $1 energy ')
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function numbers(value) {
  return [...String(value || '').matchAll(/-?\d+(?:\.\d+)?/g)].map(match => Number(match[0]));
}

function numericGain(baseText, upgradedText) {
  const before = numbers(baseText);
  const after = numbers(upgradedText);
  let gain = 0;
  let ratio = 1;
  for (let index = 0; index < Math.min(before.length, after.length); index += 1) {
    if (after[index] > before[index]) {
      gain += after[index] - before[index];
      if (before[index] > 0) ratio = Math.max(ratio, after[index] / before[index]);
    }
  }
  return { gain, ratio };
}

function added(upgraded, base, pattern) {
  return pattern.test(upgraded) && !pattern.test(base);
}

function changedEffect(base, upgraded, pattern) {
  const select = text => text.split(/[。；;\n]/).map(line => line.trim()).filter(line => pattern.test(line)).join('|');
  const before = select(base);
  const after = select(upgraded);
  return Boolean(after && after !== before);
}

function isStarter(card) {
  const values = [card?.id, card?.name].map(normalize);
  return values.some(value => value === '打击' || value === '防御'
    || /^(?:strike|defend)(?:r|g|b|p|ironclad|silent|defect|necrobinder|regent)?$/.test(value));
}

function evaluateUpgrade(card, context = {}) {
  if (!card || card.upgraded === true) return { score: -99, summary: '这张牌已经升级。', reasons: [] };
  const weights = strategy.weights;
  const knowledge = cardKnowledge(card);
  const base = stripMarkup(knowledge?.description || card.description);
  const upgraded = stripMarkup(knowledge?.upgradeDescription || card.upgradeDescription);
  const comparison = numericGain(base, upgraded);
  const combined = `${base} ${upgraded}`;
  const mechanicTags = knowledge?.mechanicTags || [];
  const reasons = [];
  let score = 0;

  const costOrEnergyChange = /耗能减少|费用减少|costs?\s*less|cost becomes/i.test(upgraded)
    || added(upgraded, base, /获得.{0,5}(?:能量|星|energy)|\d+\s*energy/i);
  const drawOrEnergy = changedEffect(base, upgraded, /抽|draw|获得.{0,5}(?:能量|星|energy)|\d+\s*energy/i);
  const qualitative = added(upgraded, base, /保留|固有|retain|innate|不再消耗|移除消耗|所有敌人|all enemies/i);
  const scaling = changedEffect(base, upgraded, /每当|每次|每有|翻倍|额外触发|倍率|whenever|double|for each/i);
  const control = changedEffect(base, upgraded, /所有敌人|虚弱|易伤|力量|人工制品|all enemies|weak|vulnerable|strength|artifact/i);

  if (costOrEnergyChange) {
    score += weights.costOrEnergyChange;
    reasons.push('升级改善费用或能量效率，能改变关键回合的可打出组合');
  }
  if (drawOrEnergy) {
    score += weights.drawOrEnergyGain;
    reasons.push('升级强化抽牌或能量，能提高牌组启动与循环');
  }
  if (qualitative) {
    score += weights.qualitativeChange;
    reasons.push('升级增加了保留、固有、范围或消耗变化等质变效果');
  }
  if (scaling) {
    score += weights.scalingOrMultiplier;
    reasons.push('这张牌参与成长或倍率，升级收益会在长战中累积');
  }
  if (control) {
    score += weights.multiTargetOrControl;
    reasons.push('升级改善多目标覆盖或关键控制');
  }
  if (comparison.ratio >= 1.5 || comparison.gain >= 8) {
    score += weights.strongNumericGain;
    reasons.push('升级前后数值增幅明显');
  } else if (comparison.gain >= 3) {
    score += weights.moderateNumericGain;
    reasons.push('升级提供稳定的数值提升');
  }

  const type = String(card.type || knowledge?.type || '');
  const cost = Number(card.cost ?? knowledge?.cost);
  const starter = isStarter(card);
  if (!starter && (cost === 0 || cost === 1) && !/power|能力/i.test(type)) {
    score += weights.frequentUse;
    reasons.push('低费且可重复打出，升级收益更容易多次兑现');
  }
  if (starter) {
    score += weights.starterPenalty;
    reasons.push('起手牌通常会被删除或被更强卡牌替代');
  }

  const deck = Array.isArray(context.deck) ? context.deck : [];
  const tagMatches = mechanicTags.filter(tag => deck.some(other => {
    const otherTags = cardKnowledge(other)?.mechanicTags || [];
    return other !== card && otherTags.includes(tag);
  })).length;
  if (tagMatches) {
    score += Math.min(weights.deckSynergy, tagMatches * 2);
    reasons.push('升级效果与当前牌组已有机制协同');
  }

  const hpRatio = Number(context.hpRatio);
  const defensive = /格挡|虚弱|力量|block|weak|strength/i.test(combined) || mechanicTags.includes('block');
  const offensive = /造成|伤害|damage/i.test(combined) || mechanicTags.includes('damage');
  if ((context.threats?.eliteSoon || context.threats?.bossSoon) && (scaling || control || defensive)) {
    score += weights.immediateThreatFit;
    reasons.push('近期有强敌，这项升级能改善对应战斗能力');
  } else if ((context.act || 1) <= 1 && offensive) {
    score += Math.max(2, weights.immediateThreatFit - 2);
    reasons.push('前期伤害升级有助于减少走廊战和精英战损');
  }
  if (Number.isFinite(hpRatio) && hpRatio < strategy.healthPolicy.cautionRatio && defensive) {
    score += 3;
    reasons.push('当前生命承压，防御或控制升级更容易转化为少掉血');
  }

  const tier = knowledge?.prior?.tier;
  if (tier === 'S' || tier === 'A') score += tier === 'S' ? weights.highTierPrior : Math.max(1, weights.highTierPrior - 1);
  if (!reasons.length || (!upgraded && !costOrEnergyChange)) {
    score += weights.lowImpactPenalty;
    reasons.push('没有识别到明显质变，当前只按低影响升级处理');
  }

  return {
    score: Math.max(-90, Math.round(score)),
    summary: reasons[0],
    reasons: reasons.slice(0, 4),
    baseDescription: base || null,
    upgradeDescription: upgraded || null,
    knowledgeTier: tier || null,
    knowledgeEvaluation: knowledge?.evaluation ? {
      expertSummary: knowledge.evaluation.expertSummary || null,
      goodWhen: knowledge.evaluation.goodWhen || [],
      badWhen: knowledge.evaluation.badWhen || []
    } : null,
    gameVersion: knowledge?.evaluation?.gameVersion || strategy.game.version,
    signals: { costOrEnergyChange, drawOrEnergy, qualitative, scaling, control, numericGain: comparison.gain }
  };
}

function strategyForPrompt() {
  return {
    gameVersion: strategy.game.version,
    channel: strategy.game.channel,
    principles: strategy.principles
  };
}

module.exports = { strategy, cardKnowledge, evaluateUpgrade, strategyForPrompt };
