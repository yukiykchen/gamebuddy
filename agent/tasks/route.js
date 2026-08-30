const { SCHEMA } = require('../recommendation');
const { describeNodeType } = require('../knowledge/codex');

const TYPE_LABELS = {
  Monster: '战斗',
  Elite: '精英',
  Unknown: '问号',
  Shop: '商店',
  Treasure: '宝箱',
  RestSite: '休息处',
  Boss: 'Boss',
  Ancient: '远古',
  Unassigned: '未分配'
};

function mapTypeLabel(type) {
  return TYPE_LABELS[type] || type || '未知';
}

function hpRatio(player) {
  const maxHp = Number(player?.maxHp) || 0;
  const hp = Number(player?.hp) || 0;
  return maxHp > 0 ? hp / maxHp : 1;
}

function isRemovableStarter(card) {
  const text = `${card?.id || ''} ${card?.name || ''}`;
  return /strike|defend|打击|防御/i.test(text);
}

function buildScoreContext(state) {
  const player = state?.player || {};
  const cards = Array.isArray(player.cards) ? player.cards : [];
  const relics = Array.isArray(player.relics) ? player.relics : [];
  const deckKnown = cards.length > 0;
  return {
    hpRatio: hpRatio(player),
    gold: Number(player.gold) || 0,
    relicCount: relics.length,
    deckKnown,
    deckSize: deckKnown ? cards.length : 10,
    unupgraded: deckKnown ? cards.filter(card => card && card.upgraded !== true).length : 8,
    removable: deckKnown ? cards.filter(isRemovableStarter).length : 9
  };
}

function scoreParts(type, ctx = {}) {
  const hp = Number(ctx.hpRatio);
  const hpRatioValue = Number.isFinite(hp) ? hp : 1;
  const gold = Number(ctx.gold) || 0;
  const relicCount = Number(ctx.relicCount) || 0;
  const unupgraded = Number(ctx.unupgraded) || 0;
  const removable = Number(ctx.removable) || 0;
  const deckSize = Number(ctx.deckSize) || 0;
  switch (type) {
    case 'Elite': {
      const relicPayoff = relicCount <= 1 ? 12 : relicCount <= 4 ? 9 : 6;
      const payoff = relicPayoff + 4;
      const risk = hpRatioValue < 0.35 ? -24
        : hpRatioValue < 0.45 ? -16
        : hpRatioValue < 0.6 ? -7
        : hpRatioValue < 0.75 ? -3
        : 0;
      return { payoff, risk };
    }
    case 'RestSite': {
      const missing = 1 - hpRatioValue;
      const heal = missing >= 0.5 ? 14 : missing >= 0.3 ? 8 : missing >= 0.15 ? 3 : 0;
      const smith = unupgraded >= 6 ? 9 : unupgraded >= 3 ? 7 : unupgraded >= 1 ? 5 : 3;
      return { payoff: heal + smith, risk: 0 };
    }
    case 'Shop': {
      const remove = gold >= 75
        ? 5 + Math.min(8, removable * 2) + (deckSize >= 15 ? 2 : 0)
        : gold >= 55 ? 2 : 0;
      const buys = gold >= 140 ? 9 : gold >= 100 ? 6 : gold >= 70 ? 4 : gold >= 40 ? 2 : 0;
      return { payoff: remove + buys, risk: 0 };
    }
    case 'Treasure':
      return { payoff: 11, risk: 0 };
    case 'Ancient':
      return { payoff: 7, risk: 0 };
    case 'Unknown':
      return { payoff: 4, risk: hpRatioValue < 0.35 ? -4 : 0 };
    case 'Monster':
    case 'Boss':
    case 'Unassigned':
      return { payoff: 0, risk: 0 };
    default:
      return { payoff: 0, risk: 0 };
  }
}

function scoreNode(type, ctx) {
  const parts = scoreParts(type, ctx);
  return parts.payoff + parts.risk;
}

function restAfterEliteBonus(upcoming, ctx) {
  const eliteAt = upcoming.findIndex(node => node.type === 'Elite');
  if (eliteAt < 0) return 0;
  const restAfter = upcoming.some((node, index) => index > eliteAt && node.type === 'RestSite');
  if (!restAfter) return 0;
  return ctx.hpRatio < 0.55 ? 8 : 4;
}

function nextStep(route, current) {
  if (!Array.isArray(route) || !route.length) return null;
  const index = current ? route.indexOf(current) : -1;
  if (index >= 0) return route[index + 1] || route[index];
  return route[0];
}

function rankRoutes(state) {
  const map = state?.map || {};
  const routes = Array.isArray(map.routes) ? map.routes : [];
  const nodes = Array.isArray(map.nodes) ? map.nodes : [];
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const current = map.current || null;
  const ctx = buildScoreContext(state);

  return routes.map((route, index) => {
    let score = 0;
    const upcoming = [];
    for (let i = 0; i < route.length; i += 1) {
      const node = nodesById.get(route[i]);
      if (!node) continue;
      if (i === 0 && route[i] === current) continue;
      const parts = scoreParts(node.type, ctx);
      const nodeScore = parts.payoff + parts.risk;
      score += nodeScore;
      upcoming.push({
        id: node.id,
        type: node.type,
        score: nodeScore,
        payoff: parts.payoff,
        risk: parts.risk
      });
    }
    score += restAfterEliteBonus(upcoming, ctx);
    if (ctx.hpRatio < 0.45) score += Math.max(0, 8 - route.length);
    const targetId = nextStep(route, current);
    const target = nodesById.get(targetId);
    return {
      index,
      route,
      score,
      upcoming,
      targetId: targetId || route[route.length - 1] || '',
      targetType: target?.type || '',
      label: mapTypeLabel(target?.type)
    };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
}

function explainRoute(ranked, state) {
  const ctx = buildScoreContext(state);
  const types = new Set(ranked.upcoming.map(node => node.type));
  const nextLabel = ranked.label || '下一节点';
  const clauses = [];

  if (ranked.targetType === 'Elite' || types.has('Elite')) {
    if (ctx.hpRatio < 0.45) clauses.push('精英有遗物和更好的卡牌奖励，但当前生命偏危险');
    else clauses.push(ctx.relicCount <= 1 ? '精英能拿到遗物，现在遗物还少，收益大' : '精英能拿到遗物和更高品质卡牌');
  }
  if (ranked.targetType === 'RestSite' || types.has('RestSite')) {
    if (ctx.hpRatio < 0.6) clauses.push('火堆可以回血');
    clauses.push(ctx.unupgraded >= 1 ? `也可以升级牌（还有 ${ctx.unupgraded} 张未升级）` : '火堆还能敲牌升级');
  }
  if (ranked.targetType === 'Shop' || types.has('Shop')) {
    if (ctx.gold >= 75 && ctx.removable >= 2) clauses.push('商店可以删起手牌，再买牌或遗物提高战斗力');
    else if (ctx.gold >= 50) clauses.push('商店金币还够买东西提高战斗力');
    else clauses.push('商店收益一般，金币不太够删牌或购物');
  }
  if (ranked.targetType === 'Treasure') clauses.push('宝箱几乎总是正收益');
  if (!clauses.length) {
    return `下一步走${nextLabel}。综合遗物、升级、删牌和生命风险，这条路更划算。`;
  }
  return `下一步走${nextLabel}。${clauses.join('；')}。`;
}

function confidenceFor(ranked, source) {
  const best = ranked[0]?.score || 0;
  const second = ranked[1]?.score ?? best;
  const gap = best - second;
  const base = source === 'llm' ? 0.7 : 0.52;
  return Math.max(0.4, Math.min(source === 'llm' ? 0.9 : 0.78, base + gap / 40));
}

function toAlternative(item) {
  return {
    action: 'TAKE_ROUTE',
    targetId: item.targetId,
    label: item.label,
    route: item.route,
    score: item.score
  };
}

function buildRecommendation(chosen, ranked, { source, reason, now }) {
  return {
    schema: SCHEMA,
    task: 'map_route',
    timestamp: now,
    source,
    confidence: confidenceFor(ranked, source),
    reason,
    primary: {
      action: 'TAKE_ROUTE',
      targetId: chosen.targetId,
      label: chosen.label,
      route: chosen.route,
      routeIndex: chosen.index,
      score: chosen.score
    },
    alternatives: ranked.filter(item => item !== chosen).slice(0, 4).map(toAlternative)
  };
}

function promptPayload(state, ranked) {
  const ctx = buildScoreContext(state);
  const player = state?.player || {};
  return {
    act: state?.run?.act ?? null,
    floor: state?.run?.floor ?? null,
    hp: player.hp,
    maxHp: player.maxHp,
    gold: player.gold,
    relics: ctx.relicCount,
    deckSize: ctx.deckSize,
    unupgraded: ctx.unupgraded,
    removableStarters: ctx.removable,
    current: state?.map?.current || null,
    candidates: ranked.slice(0, 5).map((item, index) => ({
      index,
      score: item.score,
      next: item.label,
      path: item.upcoming.map(node => mapTypeLabel(node.type)).join(' → '),
      payoff: item.upcoming.reduce((sum, node) => sum + (node.payoff || 0), 0),
      risk: item.upcoming.reduce((sum, node) => sum + (node.risk || 0), 0),
      notes: [...new Set(item.upcoming.map(node => describeNodeType(node.type)))]
    }))
  };
}

async function recommendRoute(state, { llm, now = Date.now() } = {}) {
  const ranked = rankRoutes(state);
  if (!ranked.length || !ranked[0].targetId) return null;

  let chosen = ranked[0];
  let source = 'rules';
  let reason = explainRoute(chosen, state);

  if (llm?.enabled && typeof llm.completeRoute === 'function') {
    try {
      const pick = await llm.completeRoute(promptPayload(state, ranked));
      const index = Number(pick?.index);
      if (Number.isInteger(index) && ranked[index]) {
        chosen = ranked[index];
        source = 'llm';
        if (typeof pick.reason === 'string' && pick.reason.trim()) reason = pick.reason.trim();
        else reason = explainRoute(chosen, state);
      }
    } catch {
      source = 'rules';
      reason = explainRoute(chosen, state);
    }
  }

  return buildRecommendation(chosen, ranked, { source, reason, now });
}

function routeSignature(state) {
  const ctx = buildScoreContext(state);
  return JSON.stringify({
    current: state?.map?.current || null,
    routes: state?.map?.routes || [],
    hp: state?.player?.hp ?? null,
    maxHp: state?.player?.maxHp ?? null,
    gold: ctx.gold,
    relics: ctx.relicCount,
    deckSize: ctx.deckSize,
    unupgraded: ctx.unupgraded,
    removable: ctx.removable,
    act: state?.run?.act ?? null,
    floor: state?.run?.floor ?? null
  });
}

module.exports = {
  TYPE_LABELS,
  mapTypeLabel,
  hpRatio,
  buildScoreContext,
  scoreParts,
  scoreNode,
  rankRoutes,
  recommendRoute,
  routeSignature
};
