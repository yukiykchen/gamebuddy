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

function nodeChildren(node) {
  return Array.isArray(node?.children) ? node.children.filter(id => typeof id === 'string' && id) : [];
}

function isChoiceNode(node) {
  return Boolean(node && node.type !== 'Boss' && node.type !== 'Ancient');
}

function resolveMapOrigins(map) {
  const nodes = Array.isArray(map?.nodes) ? map.nodes : [];
  const byId = new Map(nodes.map(node => [node.id, node]));
  const current = map?.current;
  if (current && byId.has(current)) {
    const node = byId.get(current);
    if (nodeChildren(node).some(id => byId.has(id)) || isChoiceNode(node)) return [current];
  }
  if (map?.start && byId.has(map.start)) return [map.start];
  const incoming = new Set();
  for (const node of nodes) {
    for (const child of nodeChildren(node)) incoming.add(child);
  }
  const roots = nodes
    .filter(node => !incoming.has(node.id) && isChoiceNode(node))
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map(node => node.id);
  if (roots.length) return roots;
  const choosable = nodes.filter(isChoiceNode);
  if (!choosable.length) return [];
  const minRow = Math.min(...choosable.map(node => Number(node.row) || 0));
  return choosable.filter(node => node.row === minRow).map(node => node.id);
}

function walkMapRoutes(byId, originId, bossId, maxRoutes) {
  const routes = [];
  let truncated = false;
  const path = [];
  const seen = new Set();

  function walk(id) {
    if (truncated || seen.has(id)) return;
    seen.add(id);
    path.push(id);
    const next = [];
    for (const child of nodeChildren(byId.get(id))) {
      if (byId.has(child) && !seen.has(child)) next.push(child);
    }
    if ((bossId && id === bossId) || next.length === 0) {
      if (routes.length >= maxRoutes) truncated = true;
      else routes.push(path.slice());
    } else {
      for (const child of next) {
        walk(child);
        if (truncated) break;
      }
    }
    path.pop();
    seen.delete(id);
  }

  if (byId.has(originId)) walk(originId);
  return { routes, truncated };
}

function ensureMapRoutes(map, maxRoutes = 256) {
  if (!map || typeof map !== 'object') return { visited: [], nodes: [], routes: [] };
  if (Array.isArray(map.routes) && map.routes.length) return map;
  const nodes = Array.isArray(map.nodes) ? map.nodes : [];
  if (!nodes.length) return map;
  const byId = new Map(nodes.map(node => [node.id, node]));
  const origins = resolveMapOrigins(map);
  const collected = [];
  let truncated = false;
  for (const origin of origins) {
    const remaining = maxRoutes - collected.length;
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    const found = walkMapRoutes(byId, origin, map.boss || null, remaining);
    collected.push(...found.routes);
    if (found.truncated) truncated = true;
  }
  const toBoss = map.boss ? collected.filter(route => route.includes(map.boss)) : [];
  let routes = toBoss.length ? toBoss : collected.filter(route => route.length > 1);
  if (!routes.length) routes = origins.map(id => [id]);
  return {
    ...map,
    routes,
    routesTruncated: truncated || Boolean(map.routesTruncated)
  };
}

function nextStep(route, current, visited) {
  if (!Array.isArray(route) || !route.length) return null;
  const index = current ? route.indexOf(current) : -1;
  if (index >= 0) return route[index + 1] || route[index];
  const seen = new Set(Array.isArray(visited) ? visited : []);
  return route.find(id => !seen.has(id)) || route[0];
}

function routeChoiceTargets(state) {
  const map = ensureMapRoutes(state?.map || {});
  const routes = Array.isArray(map.routes) ? map.routes : [];
  const targets = routes
    .map(route => nextStep(route, map.current || null, map.visited || []))
    .filter(Boolean);
  return [...new Set(targets)];
}

function routeChoiceCount(state) {
  return routeChoiceTargets(state).length;
}

function targetDirections(items) {
  const targets = [...new Map(items
    .filter(item => item.targetId)
    .map(item => [item.targetId, {
      id: item.targetId,
      row: Number(item.target?.row),
      col: Number(item.target?.col)
    }])).values()]
    .sort((left, right) => left.col - right.col || left.row - right.row || left.id.localeCompare(right.id));
  if (targets.length < 2) return new Map();
  return new Map(targets.map((target, index) => [
    target.id,
    targets.length === 2
      ? (index === 0 ? '左侧' : '右侧')
      : targets.length === 3
        ? ['左侧', '中间', '右侧'][index]
        : `从左第${index + 1}个`
  ]));
}

function targetPositionLabel(map, targetId) {
  const nodes = Array.isArray(map?.nodes) ? map.nodes : [];
  const target = nodes.find(node => node?.id === targetId);
  if (!target) return '';
  const sameRow = nodes
    .filter(node => Number(node?.row) === Number(target.row))
    .sort((a, b) => (Number(a.col) || 0) - (Number(b.col) || 0));
  const position = sameRow.findIndex(node => node.id === targetId);
  if (sameRow.length === 3) return ['左侧', '中间', '右侧'][position] || '';
  if (sameRow.length === 2) return ['左侧', '右侧'][position] || '';
  return sameRow.length > 1 ? `从左第${position + 1}个` : '';
}

function rankRoutes(state) {
  const map = ensureMapRoutes(state?.map || {});
  const routes = Array.isArray(map.routes) ? map.routes : [];
  const nodes = Array.isArray(map.nodes) ? map.nodes : [];
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const current = map.current || null;
  const visited = Array.isArray(map.visited) ? map.visited : [];
  const ctx = buildScoreContext(state);

  const ranked = routes.map((route, index) => {
    const targetId = nextStep(route, current, visited);
    let score = 0;
    const upcoming = [];
    let counting = !targetId;
    for (let i = 0; i < route.length; i += 1) {
      const id = route[i];
      if (!counting) {
        if (id === targetId) counting = true;
        else continue;
      }
      const node = nodesById.get(id);
      if (!node) continue;
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
    const target = nodesById.get(targetId);
    const eliteCount = upcoming.filter(node => node.type === 'Elite').length;
    const restSiteCount = upcoming.filter(node => node.type === 'RestSite').length;
    return {
      index,
      route,
      score,
      upcoming,
      eliteCount,
      restSiteCount,
      targetId: targetId || route[route.length - 1] || '',
      targetType: target?.type || '',
      target: target ? { row: target.row, col: target.col } : null,
      targetPosition: targetPositionLabel(map, targetId),
      label: mapTypeLabel(target?.type)
    };
  });
  const directions = targetDirections(ranked);
  for (const item of ranked) {
    item.direction = directions.get(item.targetId) || item.targetPosition || '';
    item.displayLabel = `${item.direction}${item.label}`;
  }
  return ranked.sort((a, b) =>
    b.eliteCount - a.eliteCount
    || b.restSiteCount - a.restSiteCount
    || b.score - a.score
    || a.index - b.index
  );
}

function explainRoute(ranked, state) {
  const ctx = buildScoreContext(state);
  const types = new Set(ranked.upcoming.map(node => node.type));
  const nextLabel = ranked.displayLabel || ranked.label || '下一节点';
  const clauses = [];

  clauses.push(`这条路线后续有 ${ranked.eliteCount} 个精英和 ${ranked.restSiteCount} 个火堆`);
  const followUp = ranked.upcoming.slice(1, 4).map(node => mapTypeLabel(node.type));
  if (followUp.length) clauses.push(`通过后续是 ${followUp.join(' → ')}`);

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
    displayLabel: item.displayLabel,
    direction: item.direction,
    target: item.target,
    targetPosition: item.targetPosition,
    route: item.route,
    score: item.score
  };
}

function sameRouteRank(left, right) {
  return Boolean(left && right
    && left.eliteCount === right.eliteCount
    && left.restSiteCount === right.restSiteCount
    && left.score === right.score);
}

function buildRecommendation(chosen, ranked, { source, reason, now }) {
  const equalBest = sameRouteRank(chosen, ranked[0])
    ? ranked.filter(item => sameRouteRank(item, chosen) && item.targetId !== chosen.targetId)
    : [];
  const equivalentItems = equalBest.length
    ? [...new Map([chosen, ...equalBest].map(item => [item.targetId, item])).values()]
      .sort((left, right) => (left.target?.col ?? 0) - (right.target?.col ?? 0))
    : [];
  const tie = equivalentItems.length > 1 ? {
    isTie: true,
    label: `${[...new Set(equivalentItems.map(item => item.displayLabel))].join('、')}等价`,
    targets: equivalentItems.map(item => ({
      targetId: item.targetId,
      label: item.label,
      displayLabel: item.displayLabel,
      direction: item.direction,
      target: item.target,
      score: item.score
    }))
  } : null;
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
      displayLabel: chosen.displayLabel,
      direction: chosen.direction,
      target: chosen.target,
      targetPosition: chosen.targetPosition,
      route: chosen.route,
      routeIndex: chosen.index,
      score: chosen.score
    },
    alternatives: ranked.filter(item => item !== chosen).slice(0, 4).map(toAlternative),
    tie
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
      displayLabel: item.displayLabel,
      targetId: item.targetId,
      row: item.target?.row ?? null,
      col: item.target?.col ?? null,
      direction: item.direction || null,
      eliteCount: item.eliteCount,
      restSiteCount: item.restSiteCount,
      path: item.upcoming.map(node => mapTypeLabel(node.type)).join(' → '),
      payoff: item.upcoming.reduce((sum, node) => sum + (node.payoff || 0), 0),
      risk: item.upcoming.reduce((sum, node) => sum + (node.risk || 0), 0),
      notes: [...new Set(item.upcoming.map(node => describeNodeType(node.type)))]
    }))
  };
}

async function recommendRoute(state, { llm, now = Date.now() } = {}) {
  const ranked = rankRoutes({ ...state, map: ensureMapRoutes(state?.map || {}) });
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

  const equalBest = sameRouteRank(chosen, ranked[0])
    ? ranked.filter(item => sameRouteRank(item, chosen) && item.targetId !== chosen.targetId)
    : [];
  if (equalBest.length) {
    const labels = [...new Set([chosen, ...equalBest]
      .sort((left, right) => (left.target?.col ?? 0) - (right.target?.col ?? 0))
      .map(item => item.displayLabel))].join('和');
    reason = `${labels}当前评分相同，后续收益与风险没有可验证差异，可以任选。`;
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
  ensureMapRoutes,
  resolveMapOrigins,
  routeChoiceTargets,
  routeChoiceCount,
  rankRoutes,
  targetPositionLabel,
  recommendRoute,
  routeSignature
};
