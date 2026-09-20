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
      const risk = hpRatioValue <= 0.35 ? -24
        : hpRatioValue < 0.45 ? -16
        : hpRatioValue < 0.6 ? -7
        : hpRatioValue < 0.75 ? -3
        : 0;
      return { payoff, risk };
    }
    case 'RestSite': {
      const missing = 1 - hpRatioValue;
      const heal = missing >= 0.5 ? 14 : missing >= 0.3 ? 8 : missing >= 0.15 ? 3 : 0;
      const smith = unupgraded >= 6 ? 9 : unupgraded >= 3 ? 7 : unupgraded >= 1 ? 5 : 0;
      return { payoff: Math.max(heal, smith), risk: 0 };
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
      return { payoff: 4, risk: hpRatioValue <= 0.35 ? -4 : 0 };
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

function healthBand(ctx) {
  if (ctx.hpRatio <= 0.35) return 'danger';
  if (ctx.hpRatio < 0.65) return 'caution';
  return 'healthy';
}

function routeProfile(ctx) {
  const band = healthBand(ctx);
  return band === 'danger' ? 'safe' : band === 'caution' ? 'balanced' : 'growth';
}

function profileNodeScore(type, parts, ctx, profile) {
  if (type === 'Elite') {
    if (profile === 'safe') return parts.payoff * 0.45 + parts.risk * 1.6 - (ctx.hpRatio <= 0.2 ? 10 : 6);
    if (profile === 'balanced') return parts.payoff * 0.8 + parts.risk * 1.15 - (ctx.hpRatio <= 0.45 ? 2 : 0);
    return parts.payoff + parts.risk;
  }
  if (type === 'Monster') return profile === 'safe' ? (ctx.hpRatio <= 0.2 ? -5 : -3) : profile === 'balanced' ? 0 : 2;
  if (type === 'Unknown') {
    if (profile === 'safe') return parts.payoff * 0.4 + parts.risk - (ctx.hpRatio <= 0.2 ? 2 : 0);
    if (profile === 'balanced') return parts.payoff * 0.75 + parts.risk;
  }
  return parts.payoff + parts.risk;
}

function sequenceBonus(upcoming, profile) {
  let score = 0;
  const notes = [];
  for (let index = 0; index < upcoming.length; index += 1) {
    const here = upcoming[index].type;
    const next = upcoming[index + 1]?.type;
    const twoAhead = upcoming[index + 2]?.type;
    if (here === 'Elite' && next === 'RestSite') {
      score += profile === 'safe' ? 2 : profile === 'balanced' ? 3 : 4;
      notes.push('精英后紧接火堆');
    } else if (here === 'Elite' && twoAhead === 'RestSite') {
      score += 2;
      notes.push('精英后隔一层有火堆');
    }
    if (here === 'RestSite' && next === 'Elite') {
      score += 2;
      notes.push('精英前紧接火堆');
    }
    if (here === 'Treasure' && next === 'Elite') {
      score += 2;
      notes.push('精英前有宝箱');
    }
  }
  return { score, notes };
}

function routeStructure(upcoming, nodesById, profile) {
  let flexibility = 0;
  let longestCombatStreak = 0;
  let combatStreak = 0;
  for (const item of upcoming) {
    flexibility += Math.max(0, nodeChildren(nodesById.get(item.id)).length - 1);
    if (item.type === 'Monster' || item.type === 'Elite') {
      combatStreak += 1;
      longestCombatStreak = Math.max(longestCombatStreak, combatStreak);
    } else {
      combatStreak = 0;
    }
  }
  const flexibilityBonus = Math.min(3, flexibility) * (profile === 'safe' ? 1 : profile === 'balanced' ? 0.75 : 0.5);
  const pressurePenalty = Math.max(0, longestCombatStreak - 1) * (profile === 'safe' ? 3 : profile === 'balanced' ? 2 : 1);
  return {
    score: flexibilityBonus - pressurePenalty,
    flexibility,
    longestCombatStreak
  };
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

function findContinuation(byId, originId, bossId) {
  const path = [];
  const seen = new Set();
  function visit(id) {
    if (!byId.has(id) || seen.has(id)) return false;
    seen.add(id);
    path.push(id);
    const children = nodeChildren(byId.get(id)).filter(child => byId.has(child));
    if ((bossId && id === bossId) || (!bossId && !children.length)) return true;
    for (const child of children) {
      if (visit(child)) return true;
    }
    path.pop();
    seen.delete(id);
    return false;
  }
  return visit(originId) ? path : null;
}

function coverCurrentChoices(map, routes, maxRoutes) {
  const nodes = Array.isArray(map?.nodes) ? map.nodes : [];
  const byId = new Map(nodes.map(node => [node.id, node]));
  const current = map?.current;
  if (!current || !byId.has(current)) return { routes, supplemented: false };
  const children = nodeChildren(byId.get(current)).filter(id => byId.has(id));
  if (!children.length) return { routes, supplemented: false };
  const visited = map.visited || [];
  const representatives = new Map();
  for (const route of routes) {
    const target = nextStep(route, current, visited);
    if (children.includes(target) && !representatives.has(target)) representatives.set(target, route);
  }
  let supplemented = false;
  for (const child of children) {
    if (representatives.has(child)) continue;
    const continuation = findContinuation(byId, child, map.boss || null);
    if (!continuation) continue;
    representatives.set(child, [current, ...continuation]);
    supplemented = true;
  }
  if (!supplemented) return { routes, supplemented: false };
  const result = [...representatives.values()];
  for (const route of routes) {
    if (result.length >= maxRoutes) break;
    if (!result.includes(route)) result.push(route);
  }
  return { routes: result, supplemented: true };
}

function ensureMapRoutes(map, maxRoutes = 256) {
  if (!map || typeof map !== 'object') return { visited: [], nodes: [], routes: [] };
  if (Array.isArray(map.routes) && map.routes.length) {
    const covered = coverCurrentChoices(map, map.routes, maxRoutes);
    return covered.supplemented ? { ...map, routes: covered.routes, routesTruncated: true } : map;
  }
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
  const covered = coverCurrentChoices(map, routes, maxRoutes);
  return {
    ...map,
    routes: covered.routes,
    routesTruncated: truncated || covered.supplemented || Boolean(map.routesTruncated)
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

function rankRoutes(state, requestedProfile) {
  const map = ensureMapRoutes(state?.map || {});
  const routes = Array.isArray(map.routes) ? map.routes : [];
  const nodes = Array.isArray(map.nodes) ? map.nodes : [];
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const current = map.current || null;
  const visited = Array.isArray(map.visited) ? map.visited : [];
  const ctx = buildScoreContext(state);
  const profile = ['safe', 'balanced', 'growth'].includes(requestedProfile) ? requestedProfile : routeProfile(ctx);

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
      const nodeScore = profileNodeScore(node.type, parts, ctx, profile);
      score += nodeScore;
      upcoming.push({
        id: node.id,
        type: node.type,
        score: nodeScore,
        payoff: parts.payoff,
        risk: parts.risk
      });
    }
    const sequence = sequenceBonus(upcoming, profile);
    score += sequence.score;
    const structure = routeStructure(upcoming, nodesById, profile);
    score += structure.score;
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
      profile,
      flexibility: structure.flexibility,
      longestCombatStreak: structure.longestCombatStreak,
      sequenceNotes: sequence.notes,
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
  const bestByTarget = new Map();
  for (const item of ranked) {
    const previous = bestByTarget.get(item.targetId);
    if (!previous || item.score > previous.score || (item.score === previous.score && item.index < previous.index)) {
      bestByTarget.set(item.targetId, item);
    }
  }
  return [...bestByTarget.values()].sort((a, b) => b.score - a.score || a.index - b.index);
}

function explainRoute(ranked, state) {
  const ctx = buildScoreContext(state);
  const types = new Set(ranked.upcoming.map(node => node.type));
  const nextLabel = ranked.displayLabel || ranked.label || '下一节点';
  const clauses = [];

  clauses.push(`这条路线后续有 ${ranked.eliteCount} 个精英和 ${ranked.restSiteCount} 个火堆`);
  const followUp = ranked.upcoming.slice(1, 4).map(node => mapTypeLabel(node.type));
  if (followUp.length) clauses.push(`通过后续是 ${followUp.join(' → ')}`);
  if (ranked.sequenceNotes.length) clauses.push(ranked.sequenceNotes.slice(0, 2).join('、'));

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

function confidenceFor(ranked, source, routesTruncated) {
  const best = ranked[0]?.score || 0;
  const second = ranked[1]?.score ?? best;
  const gap = best - second;
  const base = source === 'llm' ? 0.7 : 0.52;
  const upperBound = gap <= 1.5 ? 0.55 : routesTruncated ? 0.55 : source === 'llm' ? 0.9 : 0.78;
  return Math.max(0.4, Math.min(upperBound, base + gap / 40));
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

function similarRouteEvidence(left, right) {
  return Boolean(left && right
    && Math.abs(left.score - right.score) <= 1.5
    && left.upcoming.map(node => node.type).join(',') === right.upcoming.map(node => node.type).join(','));
}

function profileSummary(item) {
  return item ? { targetId: item.targetId, displayLabel: item.displayLabel, score: item.score, route: item.route } : null;
}

function buildRecommendation(chosen, ranked, { source, reason, now, routeProfiles, routesTruncated }) {
  const closeAlternatives = similarRouteEvidence(chosen, ranked[0])
    ? ranked.filter(item => similarRouteEvidence(item, chosen) && item.targetId !== chosen.targetId)
    : [];
  const closeItems = closeAlternatives.length
    ? [...new Map([chosen, ...closeAlternatives].map(item => [item.targetId, item])).values()]
      .sort((left, right) => (left.target?.col ?? 0) - (right.target?.col ?? 0))
    : [];
  const uncertainty = closeItems.length > 1 ? {
    isClose: true,
    label: '当前可见信息下差距较小',
    preferredTargetId: chosen.targetId,
    targets: closeItems.map(item => ({
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
    confidence: confidenceFor(ranked, source, routesTruncated),
    reason,
    routeProfiles,
    routesTruncated,
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
    uncertainty,
    tie: null
  };
}

function promptPayload(state, ranked, routeProfiles) {
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
    activeProfile: routeProfiles.active,
    healthBand: routeProfiles.healthBand,
    routesTruncated: Boolean(state?.map?.routesTruncated),
    candidates: ranked.map((item, index) => ({
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
      safeScore: routeProfiles.safeScores[item.targetId] ?? null,
      balancedScore: routeProfiles.balancedScores[item.targetId] ?? null,
      growthScore: routeProfiles.growthScores[item.targetId] ?? null,
      flexibility: item.flexibility,
      longestCombatStreak: item.longestCombatStreak,
      sequenceNotes: item.sequenceNotes,
      path: item.upcoming.map(node => mapTypeLabel(node.type)).join(' → '),
      payoff: item.upcoming.reduce((sum, node) => sum + (node.payoff || 0), 0),
      risk: item.upcoming.reduce((sum, node) => sum + (node.risk || 0), 0),
      notes: [...new Set(item.upcoming.map(node => describeNodeType(node.type)))]
    }))
  };
}

async function recommendRoute(state, { llm, now = Date.now() } = {}) {
  const routableState = { ...state, map: ensureMapRoutes(state?.map || {}) };
  const ranked = rankRoutes(routableState);
  if (!ranked.length || !ranked[0].targetId) return null;
  const safeRanked = rankRoutes(routableState, 'safe');
  const balancedRanked = rankRoutes(routableState, 'balanced');
  const growthRanked = rankRoutes(routableState, 'growth');
  const ctx = buildScoreContext(routableState);
  const routeProfiles = {
    active: ranked[0].profile,
    healthBand: healthBand(ctx),
    safe: profileSummary(safeRanked[0]),
    balanced: profileSummary(balancedRanked[0]),
    growth: profileSummary(growthRanked[0]),
    safeScores: Object.fromEntries(safeRanked.map(item => [item.targetId, item.score])),
    balancedScores: Object.fromEntries(balancedRanked.map(item => [item.targetId, item.score])),
    growthScores: Object.fromEntries(growthRanked.map(item => [item.targetId, item.score]))
  };

  let chosen = ranked[0];
  let source = 'rules';
  let reason = explainRoute(chosen, state);

  if (llm?.enabled && typeof llm.completeRoute === 'function') {
    try {
      const pick = await llm.completeRoute(promptPayload(routableState, ranked, routeProfiles));
      const index = Number(pick?.index);
      const maxDeviation = routeProfiles.active === 'safe' ? 6 : routeProfiles.active === 'balanced' ? 10 : Infinity;
      if (Number.isInteger(index) && ranked[index] && ranked[index].score >= ranked[0].score - maxDeviation) {
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

  const closeAlternatives = similarRouteEvidence(chosen, ranked[0])
    ? ranked.filter(item => similarRouteEvidence(item, chosen) && item.targetId !== chosen.targetId)
    : [];
  if (closeAlternatives.length) {
    const labels = [...new Set([chosen, ...closeAlternatives]
      .sort((left, right) => (left.target?.col ?? 0) - (right.target?.col ?? 0))
      .map(item => item.displayLabel))].join('和');
    reason = `${labels}在当前可见信息下差距较小，暂时优先${chosen.displayLabel}；这不是客观等价，未知事件和后续局面可能改变排序。`;
  }

  const profileLabel = routeProfiles.active === 'safe' ? '危险生命的保命策略' : routeProfiles.active === 'balanced' ? '谨慎平衡策略' : '健康生命的成长策略';
  const profileChoices = [routeProfiles.safe, routeProfiles.balanced, routeProfiles.growth].filter(Boolean);
  const distinctProfileTargets = new Set(profileChoices.map(item => item.targetId));
  if (distinctProfileTargets.size > 1) {
    reason += ` 安全视角偏向${routeProfiles.safe.displayLabel}，平衡视角偏向${routeProfiles.balanced.displayLabel}，收益视角偏向${routeProfiles.growth.displayLabel}；当前采用${profileLabel}。`;
  } else if (chosen.targetId !== routeProfiles.safe?.targetId) {
    reason += ` 三种规则视角都偏向${routeProfiles.safe.displayLabel}；本次模型改选${chosen.displayLabel}，请留意取舍。`;
  } else {
    reason += ` 三种视角都偏向${routeProfiles.safe.displayLabel}；当前采用${profileLabel}。`;
  }
  if (routableState.map.routesTruncated) reason += ' 地图路线枚举已截断，后续比较可能不完整。';

  return buildRecommendation(chosen, ranked, { source, reason, now, routeProfiles, routesTruncated: Boolean(routableState.map.routesTruncated) });
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
  healthBand,
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
