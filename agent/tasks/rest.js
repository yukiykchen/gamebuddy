const { SCHEMA } = require('../recommendation');
const { strategy, smithAnalysis, strategyForPrompt, isStrike, isDefend } = require('../knowledge/smith');
const { ensureMapRoutes } = require('./route');

function hpRatio(player) {
  const maxHp = Number(player?.maxHp) || 0;
  const hp = Number(player?.hp) || 0;
  return maxHp > 0 ? hp / maxHp : 1;
}

function isRestSite(state) {
  if (state?.combat) return false;
  const room = String(state.run?.room || '');
  const node = String(state.run?.currentNode || '');
  if (/rest|camp/i.test(room)) return true;
  if (/map/i.test(room)) return false;
  return /rest/i.test(node);
}

function upcomingThreats(state) {
  const map = ensureMapRoutes(state?.map || {});
  const nodes = Array.isArray(map.nodes) ? map.nodes : [];
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const current = map.current;
  const routes = Array.isArray(map.routes) ? map.routes : [];
  let eliteSoon = false;
  let bossSoon = false;
  for (const route of routes) {
    const start = current && route.includes(current) ? route.indexOf(current) : 0;
    for (const id of route.slice(start + 1, start + 4)) {
      const type = nodesById.get(id)?.type;
      if (type === 'Elite') eliteSoon = true;
      if (type === 'Boss') bossSoon = true;
    }
  }
  return { eliteSoon, bossSoon };
}

function estimatedHeal(player) {
  const hp = Number(player?.hp) || 0;
  const maxHp = Number(player?.maxHp) || 0;
  const missing = Math.max(0, maxHp - hp);
  const amount = Math.min(missing, Math.max(0, Math.floor(maxHp * strategy.healthPolicy.restFraction)));
  return { missing, amount, healTo: hp + amount };
}

function healScore(player, threats) {
  const hp = hpRatio(player);
  const heal = estimatedHeal(player);
  if (heal.amount <= 0) return { score: -25, ...heal };
  let score = (heal.amount / Math.max(1, Number(player.maxHp) || 1)) * 50;
  if (hp < strategy.healthPolicy.criticalRatio) score += 18;
  else if (hp < strategy.healthPolicy.cautionRatio) score += 10;
  else if (hp < strategy.healthPolicy.comfortableRatio) score += 4;
  if (threats.eliteSoon && hp < 0.7) score += 10;
  if (threats.bossSoon && hp < 0.55) score += 8;
  if (heal.missing < 8) score -= 12;
  return { score, ...heal };
}

function rankSmithCards(cards, context = {}) {
  const list = Array.isArray(cards) ? cards : [];
  return list
    .map((card, index) => {
      const analysis = smithAnalysis(card, { ...context, deck: list });
      return {
        card,
        index,
        score: analysis.score,
        why: analysis.summary,
        analysis,
        starter: isStrike(card) || isDefend(card)
      };
    })
    .filter(item => item.card && item.card.upgraded !== true && item.score > -90)
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

function smithUtility(best, hp, threats) {
  if (!best) return { score: -99 };
  let score = 8 + best.score;
  if (hp >= strategy.healthPolicy.comfortableRatio) score += 6;
  if (hp >= 0.9) score += 4;
  if (!threats.eliteSoon && hp >= 0.5) score += 3;
  if (hp < strategy.healthPolicy.criticalRatio) score -= strategy.healthPolicy.criticalSmithPenalty;
  else if (hp < strategy.healthPolicy.cautionRatio && (threats.eliteSoon || threats.bossSoon)) {
    score -= strategy.healthPolicy.threatenedCautionSmithPenalty;
  } else if (hp < strategy.healthPolicy.cautionRatio) {
    score -= strategy.healthPolicy.cautionSmithPenalty;
  }
  return { score };
}

function explainRest(choice, heal, best, threats, hp) {
  if (choice.action === 'HEAL') {
    if (hp < strategy.healthPolicy.criticalRatio) return `生命偏低，先回血到 ${heal.healTo}。后面再找火堆升级。`;
    if (threats.eliteSoon) return `后续有精英，先回约 ${heal.amount} 点生命更稳。`;
    if (!best) return `没有值得升级的牌，选择回血。`;
    return `回血收益更高。大约回复 ${heal.amount} 点，到 ${heal.healTo}。`;
  }
  const name = best?.card?.name || '这张牌';
  if (hp >= strategy.healthPolicy.comfortableRatio && heal.missing < 12) return `生命还够，建议升级「${name}」。${best.why}。`;
  return `建议升级「${name}」。${best.why}。生命缺口不大，战斗力提升更值。`;
}

function restOptions(state) {
  const player = state?.player || {};
  const threats = upcomingThreats(state);
  const hp = hpRatio(player);
  const heal = healScore(player, threats);
  const smiths = rankSmithCards(player.cards, {
    hpRatio: hp,
    threats,
    act: state?.run?.act,
    floor: state?.run?.floor,
    relics: player.relics,
    potions: player.potions
  });
  const best = smiths[0] || null;
  const smith = smithUtility(best, hp, threats);
  return { player, threats, hp, heal, smiths, best, smith };
}

function buildRestRecommendation(state, { source = 'rules', reason, now = Date.now(), chosen } = {}) {
  const { heal, smiths, best, smith, hp, threats } = restOptions(state);
  const pick = chosen || (heal.score >= smith.score || !best
    ? { action: 'HEAL' }
    : { action: 'SMITH', card: best });
  const smithCard = pick.action === 'SMITH' ? (pick.card || best) : best;
  const primary = pick.action === 'HEAL' || !smithCard
    ? {
        action: 'HEAL',
        label: heal.amount > 0 ? `回血至 ${heal.healTo}` : '回血',
        healAmount: heal.amount,
        healTo: heal.healTo
      }
    : {
        action: 'SMITH',
        label: `升级「${smithCard.card.name}」`,
        cardId: smithCard.card.id,
        cardName: smithCard.card.name,
        cardType: smithCard.card.type,
        cardCost: smithCard.card.cost,
        score: smithCard.score,
        upgradeAnalysis: smithCard.analysis
      };
  const alternatives = [];
  if (primary.action !== 'HEAL' && heal.amount > 0) {
    alternatives.push({ action: 'HEAL', label: `回血至 ${heal.healTo}`, healAmount: heal.amount, score: heal.score });
  }
  for (const item of smiths.slice(0, 4)) {
    if (primary.action === 'SMITH' && item.card.id === primary.cardId && item.card.name === primary.cardName) continue;
    alternatives.push({
      action: 'SMITH',
      label: `升级「${item.card.name}」`,
      cardId: item.card.id,
      cardName: item.card.name,
      cardType: item.card.type,
      score: item.score,
      reason: item.why,
      upgradeAnalysis: item.analysis
    });
  }
  return {
    schema: SCHEMA,
    task: 'rest_site',
    timestamp: now,
    source,
    confidence: Math.max(0.42, Math.min(source === 'llm' ? 0.9 : 0.8, 0.55 + Math.abs(heal.score - smith.score) / 50)),
    reason: reason || explainRest(primary, heal, smithCard, threats, hp),
    primary,
    alternatives: alternatives.slice(0, 4),
    strategy: {
      name: 'rest-site-strategy',
      gameVersion: strategy.game.version,
      channel: strategy.game.channel,
      reviewedAt: strategy.game.reviewedAt
    }
  };
}

function promptPayload(state) {
  const { heal, smiths, threats, hp, player } = restOptions(state);
  return {
    strategy: strategyForPrompt(),
    run: {
      act: state?.run?.act ?? null,
      floor: state?.run?.floor ?? null,
      character: state?.run?.character || null
    },
    hp: player.hp,
    maxHp: player.maxHp,
    hpRatio: hp,
    eliteSoon: threats.eliteSoon,
    bossSoon: threats.bossSoon,
    healAmount: heal.amount,
    healTo: heal.healTo,
    gold: player.gold ?? null,
    energyPerTurn: Number.isFinite(Number(player.maxEnergy)) ? Number(player.maxEnergy) : null,
    maxEnergy: Number.isFinite(Number(player.maxEnergy)) ? Number(player.maxEnergy) : null,
    relics: player.relics || [],
    potions: player.potions || [],
    map: state?.map || null,
    deck: (player.cards || []).map(card => ({
      id: card.id,
      name: card.name,
      type: card.type,
      cost: card.cost,
      upgraded: Boolean(card.upgraded)
    })),
    candidates: [
      { index: 0, action: 'HEAL', label: `回血至 ${heal.healTo}`, score: heal.score },
      ...smiths.slice(0, 10).map((item, offset) => ({
        index: offset + 1,
        action: 'SMITH',
        cardId: item.card.id,
        name: item.card.name,
        type: item.card.type,
        cost: item.card.cost,
        score: item.score,
        why: item.why,
        upgradeAnalysis: item.analysis
      }))
    ]
  };
}

async function recommendRest(state, { llm, now = Date.now() } = {}) {
  const { smiths } = restOptions(state);

  let chosen;
  let source = 'rules';
  let reason;

  if (llm?.enabled && typeof llm.completeRest === 'function') {
    try {
      const payload = promptPayload(state);
      const pick = await llm.completeRest(payload);
      const index = Number(pick?.index);
      const option = payload.candidates[index];
      if (option?.action === 'HEAL') chosen = { action: 'HEAL' };
      if (option?.action === 'SMITH') {
        const card = smiths.find(item => item.card.id === option.cardId && item.card.name === option.name) || smiths[index - 1];
        if (card) chosen = { action: 'SMITH', card };
      }
      if (chosen) {
        source = 'llm';
        if (typeof pick?.reason === 'string' && pick.reason.trim()) reason = pick.reason.trim();
      }
    } catch {
      chosen = undefined;
      source = 'rules';
    }
  }

  return buildRestRecommendation(state, { source, reason, now, chosen });
}

function restSignature(state) {
  const cards = Array.isArray(state?.player?.cards)
    ? state.player.cards.map(card => [card.id, card.upgraded])
    : [];
  return JSON.stringify({
    room: state?.run?.room || null,
    currentNode: state?.run?.currentNode || null,
    hp: state?.player?.hp ?? null,
    maxHp: state?.player?.maxHp ?? null,
    cards,
    current: state?.map?.current || null
  });
}

module.exports = {
  isRestSite,
  upcomingThreats,
  estimatedHeal,
  rankSmithCards,
  recommendRest,
  restSignature
};
