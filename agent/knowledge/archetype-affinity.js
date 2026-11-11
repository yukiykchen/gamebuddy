// 确定性教学契合度。规则与参考来源见 archetype-references.js；不请求模型。
const cards = require('../data/codex/cards.json');
const relics = require('../data/codex/relics.json');
const { normalizeKey, inferUpgraded } = require('./spire-codex');
const { references, variants, RULE_VERSION } = require('./archetype-references');
const cardIndex = new Map(cards.map(card => [card.id, card]));
const relicIndex = new Map(relics.map(relic => [relic.id, relic]));
const nameIndex = new Map(cards.map(card => [normalizeKey(card.name), card.id]));
function normalizeDeck(deck = []) {
  return deck.map(copy => {
    const input = typeof copy === 'string' ? { id: copy } : (copy || {});
    const key = normalizeKey(input.id || input.cardId || input.name || '').replace(/\+$/, '');
    return { ...input, id: idIndex.get(key) || nameIndex.get(key) || String(input.id || input.name || key).replace(/\+$/, '').toUpperCase(), upgraded: inferUpgraded(input) || inferUpgraded(input.id) };
  });
}
function normalizeRelics(items = []) {
  return items.map(item => { const raw = typeof item === 'string' ? item : item?.id || item?.name || ''; return relicIdIndex.get(normalizeKey(raw)) || raw; });
}
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

function expand(packs) {
  return packs.flatMap(pack => {
    const match = /^([A-Z0-9_-]+)(\+)?(?:\*(\d+))?$/.exec(pack);
    if (!match) throw new Error(`无效牌表项：${pack}`);
    const [, id, plus, count] = match;
    return Array.from({ length: Number(count || 1) }, () => ({ id, upgraded: Boolean(plus) }));
  });
}

const inSet = (id, ids) => ids.includes(id);
const maps = {
  strikes: { STRIKE_IRONCLAD: .5, POMMEL_STRIKE: 1, PERFECTED_STRIKE: 1, TWIN_STRIKE: 1, SETUP_STRIKE: 1, ASHEN_STRIKE: 1 },
  outlet: { BURNING_PACT: 1, TRUE_GRIT: .7, BRAND: .7, HAVOC: .5, CINDER: .5, THRASH: .7, FIEND_FIRE: 1.5, SECOND_WIND: 1.5, STOKE: 1.5, CORRUPTION: 1.5 },
  payoff: { ASHEN_STRIKE: 1, PACTS_END: 1, HOWL_FROM_BEYOND: 1, FIEND_FIRE: .7 },
  strength: { INFLAME: 1, DEMON_FORM: 1.5, FIGHT_ME: .7, SETUP_STRIKE: .35, BRAND: .2 },
  output: { SWORD_BOOMERANG: 1, THRASH: .75, TWIN_STRIKE: .75, WHIRLWIND: 1, CONFLAGRATION: 1, FIGHT_ME: .5, ONE_TWO_PUNCH: .7, STAMPEDE: .5, JUGGLING: .5 }
};

function cardGrants(copy, archetype, deck) {
  const card = cardIndex.get(copy.id);
  if (!card) return {};
  const id = copy.id;
  if (id === 'MAD_SCIENCE') return {};
  const has = ids => deck.some(item => inSet(item.id, ids));
  const selfLoss = has(['BLOODLETTING', 'OFFERING', 'BRAND', 'HEMOKINESIS', 'BLOOD_WALL', 'CRIMSON_MANTLE', 'INFERNO']);
  const vulnerable = has(['BASH', 'TREMBLE', 'TAUNT', 'UPPERCUT', 'THUNDERCLAP', 'MOLTEN_FIST']);
  const upgrade = copy.upgraded ? card.upgrade || {} : {};
  const bonus = field => Number(String(upgrade[field] || '0').replace('+', '')) || 0;
  // Codex 的 Cards 字段也用于契约终结的消耗堆门槛，不等于抽牌。
  const draw = /抽\d+张牌/.test(card.description) ? (Number(card.cards_draw) || 0) + bonus('cards') : 0;
  // 凶恶不是无条件抽牌：必须有施加易伤的来源，且触发频次未知，只给有限支持。
  const drawFactor = id === 'VICIOUS' ? (vulnerable ? .125 : 0) : id === 'BATTLE_TRANCE' ? .25 : .5;
  const outlet = deck.some(item => maps.outlet[item.id]);
  const energyEnabled = !inSet(id, ['FORGOTTEN_RITUAL', 'DRUM_OF_BATTLE']) || outlet;
  const energy = energyEnabled ? (Number(card.energy_gain) || 0) + (card.energy_gain ? bonus('energy') : 0) : 0;
  // 战斗专注会锁住本回合后续抽牌，不能与无限制过牌完全等价。
  const resource = Math.min(1.5, (id === 'SCRAWL' ? 1 : 0) + draw * drawFactor + energy * .5
    + (inSet(id, ['HEADBUTT', 'FORGOTTEN_RITUAL']) ? .5 : 0));
  const block = Math.min(1.5, ((Number(card.block) || 0) + bonus('block')) / 16)
    + (id === 'CRIMSON_MANTLE' ? .75 : 0) + (id === 'STONE_ARMOR' ? .5 : 0)
    + (id === 'RAGE' && deck.some(item => cardIndex.get(item.id)?.type_key === 'Attack') ? .4 : 0)
    + (id === 'FEEL_NO_PAIN' && outlet ? .75 : 0);
  let grant;
  if (archetype === 'auto_strike') {
    grant = { starter: id === 'HELLRAISER' ? 1 : 0, loop: id === 'POMMEL_STRIKE' ? 1 + (copy.upgraded ? .5 : 0) : id === 'PILLAGE' ? 1 : 0,
      output: strikeOutput(copy, deck), strikes: maps.strikes[id] || 0, resource: (inSet(id, ['POMMEL_STRIKE', 'PILLAGE']) ? 0 : resource), amplification: maps.strength[id] ? Math.min(.5, maps.strength[id]) : inSet(id, ['BASH', 'TAUNT', 'TREMBLE', 'THUNDERCLAP', 'UPPERCUT', 'MOLTEN_FIST']) ? .5 : 0 };
  } else if (archetype === 'exhaust') {
    grant = { outlet: (maps.outlet[id] || 0) + (id === 'TRUE_GRIT' && copy.upgraded ? .3 : 0), draw: id === 'DARK_EMBRACE' ? 1 : 0,
      block: id === 'FEEL_NO_PAIN' ? 1 + (copy.upgraded ? 1 / 3 : 0) : 0, payoff: maps.payoff[id] || 0, resource: resource + block * .25 };
  } else if (archetype === 'strength') {
    grant = { source: (maps.strength[id] || (id === 'RUPTURE' && selfLoss ? .7 : id === 'DOMINATE' ? .4 : 0)) * (copy.upgraded && inSet(id, ['INFLAME', 'DEMON_FORM', 'BRAND', 'RUPTURE']) ? 1.5 : 1),
      output: maps.output[id] || (inSet(id, ['SPITE', 'TEAR_ASUNDER']) && selfLoss ? .6 : id === 'DISMANTLE' && vulnerable ? .5 : 0),
      resource, defense: block };
  } else if (archetype === 'block') {
    grant = { retention: id === 'BARRICADE' ? 1 : 0,
      conversion: id === 'BODY_SLAM' ? 1 : id === 'JUGGERNAUT' ? 1.5 : 0,
      generation: block, growth: inSet(id, ['PROLONG', 'UNMOVABLE']) ? 1 : 0, resource };
  } else throw new Error(`未知流派：${archetype}`);
  return Object.fromEntries(Object.entries(grant).filter(([, value]) => value > 0));
}

// 输出与供给分别建模；完美打击按本牌组打击数量成长，不预言实际伤害/胜率。
function strikeOutput(copy, deck) {
  const strikeCount = deck.filter(item => maps.strikes[item.id]).length;
  if (copy.id === 'PERFECTED_STRIKE') return Math.min(3, 1 + strikeCount * (copy.upgraded ? .25 : .2));
  const base = { STRIKE_IRONCLAD: .25, POMMEL_STRIKE: 1, TWIN_STRIKE: 1, SETUP_STRIKE: .75, ASHEN_STRIKE: 1.25 }[copy.id] || 0;
  // 消耗堆成长没有可靠战斗模拟，只在已有消耗手段时给有限的配套信用。
  const exhaustGrowth = copy.id === 'ASHEN_STRIKE' && deck.some(item => maps.outlet[item.id]) ? .5 : 0;
  return base + exhaustGrowth;
}

function relicGrants(id, archetype) {
  // 仅声明经本地牌面核对的功能；未建模遗物返回空，不当成负面。
  // 保留格挡、放大格挡分别建模，坚定不移不会被误算成壁垒替代。
  if (archetype === 'auto_strike' && id === 'STRIKE_DUMMY') return { amplification: .5 };
  if (archetype === 'strength' && id === 'VAJRA') return { source: .5 };
  if (archetype === 'exhaust' && id === 'CHARONS_ASHES') return { payoff: 1 };
  if (archetype === 'exhaust' && id === 'JOSS_PAPER') return { draw: .25 };
  if (archetype === 'block') {
    const block = { ANCHOR: .625, HORN_CLEAT: .875, CAPTAINS_WHEEL: 1.125 }[id];
    if (block) return { generation: block };
  }
  if (id === 'BAG_OF_PREPARATION' || id === 'LANTERN') return { resource: .5 };
  return {};
}


const { FUNCTION_IDS, PROVIDERS } = require('./archetype-references');
const idIndex = new Map(cards.map(card => [normalizeKey(card.id), card.id]));
const relicIdIndex = new Map(relics.flatMap(item => [[normalizeKey(item.id), item.id], [normalizeKey(item.name), item.id]]));

function profile(deck, ownedRelics, key, plan) {
  const target = Object.fromEntries(Object.entries(plan.roles).map(([role, [, need]]) => [role, need]));
  const vectors = deck.map(copy => Object.fromEntries(Object.entries(cardGrants(copy, key, deck)).filter(([role]) => role in target)));
  const cardAmounts = Object.fromEntries(Object.keys(target).map(role => [role, vectors.reduce((sum, vector) => sum + (vector[role] || 0), 0)]));
  const amounts = { ...cardAmounts };
  for (const id of new Set(ownedRelics)) {
    for (const [role, value] of Object.entries(relicGrants(id, key))) if (role in target) amounts[role] += value;
  }
  const coverage = Object.fromEntries(Object.keys(target).map(role => [role, clamp(amounts[role] / target[role])]));
  const credit = vectors.map(vector => {
    const raw = Object.values(vector).reduce((sum, value) => sum + value, 0);
    return Object.entries(vector).reduce((sum, [role, value]) => sum + value / Math.max(1, raw) * Math.min(1, target[role] / (cardAmounts[role] || 1)), 0);
  });
  return { coverage, amounts, density: deck.length ? credit.reduce((a, b) => a + b, 0) / deck.length : 0 };
}

const referenceProfiles = new Map();
function evaluateRoute(deck, ownedRelics, key, plan) {
  if (!referenceProfiles.has(plan.id)) {
    const reference = profile(normalizeDeck(expand(plan.cards)), plan.relics, key, plan);
    if (Object.entries(reference.coverage).some(([role, value]) => plan.roles[role][0] > 0 && value < 1 - 1e-9)) throw new Error(`${plan.id} 参考未满足声明需求`);
    referenceProfiles.set(plan.id, reference);
  }
  const reference = referenceProfiles.get(plan.id);
  const result = profile(deck, ownedRelics, key, plan);
  const coverage = Object.entries(plan.roles).reduce((sum, [role, [weight]]) => sum + weight * result.coverage[role], 0) / 100;
  const connections = plan.links.reduce((sum, [left, right]) => sum + Math.min(result.coverage[left], result.coverage[right]), 0) / plan.links.length;
  const focus = clamp(result.density / reference.density);
  const raw = 100 * (.8 * coverage + .2 * connections) * focus;
  const gaps = Object.entries(result.coverage).filter(([role, value]) => plan.roles[role][0] > 0 && value < 1 - 1e-9).map(([role, value]) => ({
    id: FUNCTION_IDS[key][role], role, label: plan.labels[role], coverage: Math.round(value * 100),
    priority: plan.roles[role][0] * (1 - value),
    alternatives: (PROVIDERS[FUNCTION_IDS[key][role]] || PROVIDERS[role] || []).map(id => ({ id, name: cardIndex.get(id)?.name || id }))
  })).sort((a, b) => b.priority - a.priority);
  const identity = key === 'auto_strike'
    ? deck.some(copy => copy.id === 'HELLRAISER' || copy.id === 'PERFECTED_STRIKE') || result.amounts.loop >= 3
    : key === 'exhaust' ? ['draw', 'block', 'payoff'].some(role => (result.amounts[role] || 0) > 0)
      : key === 'strength' ? result.amounts.source > 0 || result.amounts.output >= 1
        : ['retention', 'conversion', 'growth'].some(role => result.amounts[role] > 0);
  return { id: key, score: Math.round(raw), raw, coverage: Math.round(100 * coverage), connections: Math.round(100 * connections),
    focus: Math.round(100 * focus), amounts: result.amounts, roles: result.coverage, identity, gaps,
    referenceId: plan.id, referenceName: plan.name, referenceOrigin: plan.origin, referenceReview: plan.review };
}

function operatingStatus(key, deck, result, ownedRelics) {
  const all = profile(deck, ownedRelics, key, references[key]).amounts;
  let starter, operating;
  if (key === 'auto_strike') {
    starter = all.starter > 0;
    operating = starter && all.strikes > 0;
  } else if (key === 'exhaust') {
    starter = all.draw > 0 || all.block > 0;
    operating = starter && all.outlet > 0;
  } else if (key === 'strength') {
    starter = all.source > 0;
    operating = starter && all.output > 0;
  } else {
    starter = all.retention > 0 || all.growth > 0;
    operating = starter && all.generation > 0 && all.conversion > 0;
  }
  // 数值不被状态抬高或封顶；状态只解释能否接通当前配合。
  if (operating && result.score >= 70) return 'stable';
  if (operating) return 'operational';
  return starter ? 'incomplete_loop' : 'missing_starter';
}

function evaluate(deck, ownedRelics = [], key) {
  if (!Array.isArray(deck) || !Array.isArray(ownedRelics)) throw new TypeError('牌组和遗物必须为数组');
  deck = normalizeDeck(deck);
  ownedRelics = normalizeRelics(ownedRelics);
  const plans = variants[key];
  if (!plans) throw new Error(`未知流派：${key}`);
  const results = plans.map(plan => evaluateRoute(deck, ownedRelics, key, plan)).sort((a, b) => b.raw - a.raw);
  const result = results[0];
  const unknownCards = [...new Set(deck.filter(copy => !cardIndex.has(copy.id)).map(copy => copy.id))];
  const dynamicUnknown = [...new Set(deck.filter(copy => copy.id === 'MAD_SCIENCE').map(copy => copy.id))];
  const unknownRelics = [...new Set(ownedRelics.filter(id => !relicIndex.has(id)))];
  const uncertain = [...unknownCards, ...dynamicUnknown, ...unknownRelics];
  const all = profile(deck, ownedRelics, key, references[key]);
  const presentFunctions = Object.entries(all.amounts).filter(([, value]) => value > 0).map(([role]) => ({
    id: FUNCTION_IDS[key][role], label: references[key].labels[role]
  }));
  // 保留提醒协议的细分功能 ID；它们不额外加分。
  if (key === 'auto_strike' && deck.some(copy => copy.id === 'PERFECTED_STRIKE')) presentFunctions.push({ id: 'auto_payoff', label: '打击数量兑现' });
  if (key === 'exhaust' && deck.some(copy => ['FIEND_FIRE', 'SECOND_WIND', 'STOKE', 'CORRUPTION'].includes(copy.id))) presentFunctions.push({ id: 'exhaust_event', label: '批量消耗' });
  if (key === 'strength' && deck.some(copy => ['FIGHT_ME', 'BRAND', 'SETUP_STRIKE'].includes(copy.id))) presentFunctions.push({ id: 'strength_balance', label: '力量与输出配合' });
  const status = operatingStatus(key, deck, result, ownedRelics);
  return { ...result, affinity: result.score, readiness: result.score, ruleVersion: RULE_VERSION,
    status, presentFunctions, missingFunctions: result.gaps.map(gap => ({ id: gap.id, label: gap.label })),
    unknownCards, unknownRelics, dynamicUnknown, confidence: uncertain.length ? 'partial' : 'configured',
    uncertainties: uncertain.length ? ['部分卡牌或动态效果未建模，按已知功能比较'] : [],
    routes: results.map(({ referenceId, referenceName, score }) => ({ referenceId, referenceName, score })) };
}

function evaluateAll(deck, ownedRelics = []) {
  return Object.keys(references).map(key => evaluate(deck, ownedRelics, key)).sort((a, b) => b.raw - a.raw);
}

function describeDirection(results) {
  const directed = results.filter(result => result.identity && result.score >= 25).sort((a, b) => b.score - a.score || Object.keys(references).indexOf(a.id) - Object.keys(references).indexOf(b.id));
  const first = directed[0];
  if (!first) return { kind: 'undirected', primary: null, secondary: [] };
  const secondary = directed.slice(1).filter(item => item.score >= 30 && item.score >= first.score * .5).slice(0, 2);
  return { kind: secondary.length && first.score - secondary[0].score <= 10 ? 'mixed' : secondary.length ? 'primary_with_secondary' : 'primary', primary: first.id, secondary: secondary.map(item => item.id) };
}

function explainImpact(deck, relics, candidate, key, before = evaluate(deck, relics, key), after = evaluate([...deck, candidate], relics, key)) {
  const normalized = normalizeDeck([candidate])[0];
  const plan = variants[key].find(item => item.id === after.referenceId);
  const beforeRoute = evaluateRoute(normalizeDeck(deck), normalizeRelics(relics), key, plan);
  const afterRoute = evaluateRoute(normalizeDeck([...deck, candidate]), normalizeRelics(relics), key, plan);
  const gains = Object.keys(plan.roles).filter(role => afterRoute.roles[role] > beforeRoute.roles[role] + 1e-9);
  const grants = cardGrants(normalized, key, normalizeDeck([...deck, candidate]));
  const direct = Object.keys(grants).filter(role => !['resource', 'defense'].includes(role));
  const deltaExact = after.raw - before.raw;
  const deltaPoints = after.score - before.score;
  const newLinks = plan.links.filter(([left, right]) => Math.min(afterRoute.roles[left], afterRoute.roles[right]) > Math.min(beforeRoute.roles[left], beforeRoute.roles[right]) + 1e-9);
  let reason, learningTag;
  if (!cardIndex.has(normalized.id) || normalized.id === 'MAD_SCIENCE') {
    reason = '此牌效果尚未完整建模，暂按已知功能比较'; learningTag = 'unknown';
  } else if (gains.length) {
    reason = `补充${gains.map(role => plan.labels[role]).join('、')}`;
    if (newLinks.length) reason += newLinks.some(([left, right]) => beforeRoute.roles[left] > 0 || beforeRoute.roles[right] > 0) ? '，接通已有组件的配合' : '，形成新的功能配合';
    else if (afterRoute.gaps[0]) reason += `；仍需${afterRoute.gaps[0].label}`;
    learningTag = newLinks.length ? 'synergy' : 'fills_gap';
    if (deltaExact < -.05) reason += '；收益被牌组稀释抵消';
  } else if (Object.keys(grants).some(role => role in plan.roles)) {
    reason = '同类功能已较充分，继续增加的构筑收益有限'; learningTag = 'redundant';
    if (deltaPoints < 0) reason += '，会降低当前路线的组件密度';
  } else {
    reason = '不补充当前路线的主要功能，加入后会稀释组件密度'; learningTag = 'dilution';
  }
  if (key === 'auto_strike' && normalized.id === 'PERFECTED_STRIKE') reason += '；按当前打击牌数量计入成长输出，仍需费用与循环配套';
  if (normalized.id === 'VICIOUS' && !cardGrants(normalized, key, normalizeDeck([...deck, candidate])).resource) reason = '凶恶需要施加易伤才能抽牌，当前没有可确认的易伤来源';
  if (key === 'auto_strike' && normalized.id === 'PILLAGE') reason += '；劫掠是抽牌辅助，不能被地狱狂徒自动打出';
  if (key === 'block' && normalized.id === 'UNMOVABLE') reason += '；放大格挡，不提供跨回合留存';
  if (key === 'strength' && normalized.id === 'RUPTURE' && !grants.source) reason = '需要主动失去生命的牌，当前尚无可确认的触发来源';
  if (normalized.id === 'BATTLE_TRANCE' && key === 'auto_strike') reason += '；本回合后续抽牌会被锁住，需注意出牌顺序';
  return { deltaPoints, deltaExact: Math.round(deltaExact * 100) / 100, reason, learningTag,
    explicit: direct.length > 0 || gains.length > 0, affectedFunctions: gains.map(role => ({ id: FUNCTION_IDS[key][role], label: plan.labels[role] })) };
}

module.exports = { RULE_VERSION, expand, references, variants, evaluate, evaluateAll, describeDirection, explainImpact,
  cardGrants, relicGrants, cardIndex, relicIndex, normalizeDeck };
