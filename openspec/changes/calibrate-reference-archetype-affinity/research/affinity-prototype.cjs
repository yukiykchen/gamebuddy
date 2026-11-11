// 研究原型：仅在本 change 内执行，不被应用引用，不发起网络或模型请求。
const path = require('node:path');
const root = path.resolve(__dirname, '../../../..');
const cards = require(path.join(root, 'agent/data/codex/cards.json'));
const relics = require(path.join(root, 'agent/data/codex/relics.json'));
const samples = require('./samples.json');
const cardIndex = new Map(cards.map(card => [card.id, card]));
const relicIndex = new Map(relics.map(relic => [relic.id, relic]));
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

function expand(packs) {
  return packs.flatMap(pack => {
    const match = /^([A-Z0-9_]+)(\+)?(?:\*(\d+))?$/.exec(pack);
    if (!match) throw new Error(`无效牌表项：${pack}`);
    const [, id, plus, count] = match;
    return Array.from({ length: Number(count || 1) }, () => ({ id, upgraded: Boolean(plus) }));
  });
}

// 三套为 AI 辅助人工设计的完整教学草案；格挡沿用来源明确的真实参照。
// 不把未通关的设计牌表冒充实战记录。后续须独立玩家审阅并增加变体。
const references = {
  auto_strike: {
    name: '自动打击·抽牌打击路线', origin: 'authored-draft', version: 'v0.107.1',
    cards: ['HELLRAISER+', 'POMMEL_STRIKE+*3', 'PILLAGE*2', 'PERFECTED_STRIKE', 'SETUP_STRIKE*2', 'STRIKE_IRONCLAD*3', 'SHRUG_IT_OFF*2', 'BLOODLETTING', 'OFFERING', 'HEADBUTT', 'BURNING_PACT', 'TRUE_GRIT', 'BATTLE_TRANCE'], relics: [],
    roles: { starter: [30, 1], loop: [30, 3], strikes: [25, 6], resource: [15, 3] },
    links: [['starter', 'loop'], ['starter', 'strikes']],
    identity: ['starter', 'loop'],
    labels: { starter: '自动打击启动', loop: '抽牌打击循环', strikes: '打击牌供给', resource: '通用资源支持' }
  },
  exhaust: {
    name: '消耗·抽牌与消耗堆兑现路线', origin: 'authored-draft', version: 'v0.107.1',
    cards: ['FEEL_NO_PAIN+', 'DARK_EMBRACE+', 'BURNING_PACT*2', 'TRUE_GRIT+*2', 'SECOND_WIND', 'FIEND_FIRE+', 'STOKE', 'PACTS_END', 'ASHEN_STRIKE', 'HOWL_FROM_BEYOND', 'SHRUG_IT_OFF*2', 'BLOOD_WALL', 'BLOODLETTING', 'OFFERING', 'FORGOTTEN_RITUAL', 'ARMAMENTS', 'HEADBUTT'], relics: [],
    roles: { outlet: [30, 3], draw: [20, 1], block: [15, 1], payoff: [20, 2], resource: [15, 3] },
    links: [['outlet', 'draw'], ['outlet', 'block'], ['outlet', 'payoff']],
    identity: ['outlet', 'draw', 'block', 'payoff'],
    labels: { outlet: '主动消耗手段', draw: '消耗转抽牌', block: '消耗转格挡', payoff: '消耗转输出', resource: '通用资源支持' }
  },
  strength: {
    name: '力量·成长与多段输出路线', origin: 'authored-draft', version: 'v0.107.1',
    cards: ['INFLAME+', 'DEMON_FORM+', 'FIGHT_ME', 'WHIRLWIND+', 'SWORD_BOOMERANG*2', 'TWIN_STRIKE', 'CONFLAGRATION', 'SHRUG_IT_OFF*2', 'BLOOD_WALL*2', 'BATTLE_TRANCE', 'OFFERING', 'BLOODLETTING', 'HEADBUTT', 'TRUE_GRIT+', 'POMMEL_STRIKE+', 'UPPERCUT', 'ARMAMENTS'], relics: [],
    roles: { source: [35, 2], output: [35, 3], resource: [15, 3], defense: [15, 2] },
    links: [['source', 'output']], identity: ['source', 'output'],
    labels: { source: '力量来源', output: '多段与重复输出', resource: '通用资源支持', defense: '基本防御' }
  },
  block: {
    name: '格挡·壁垒与全身撞击路线', origin: samples.reference.url, version: 'v0.107.1',
    cards: samples.reference.cards, relics: samples.reference.relics,
    roles: { retention: [25, 1], conversion: [25, 2], generation: [20, 3], growth: [15, 1], resource: [15, 2] },
    links: [['retention', 'generation'], ['conversion', 'generation'], ['growth', 'generation']],
    identity: ['retention', 'conversion', 'growth'],
    labels: { retention: '跨回合保留格挡', conversion: '格挡转输出', generation: '格挡来源', growth: '格挡增长与放大', resource: '通用资源支持' }
  }
};

const inSet = (id, ids) => ids.includes(id);
const maps = {
  strikes: { STRIKE_IRONCLAD: .5, POMMEL_STRIKE: 1, PERFECTED_STRIKE: 1, TWIN_STRIKE: 1, SETUP_STRIKE: 1, ASHEN_STRIKE: 1 },
  outlet: { BURNING_PACT: 1, TRUE_GRIT: .7, BRAND: .7, HAVOC: .5, CINDER: .5, THRASH: .5, FIEND_FIRE: 1.5, SECOND_WIND: 1.5, STOKE: 1.5, CORRUPTION: 1.5 },
  payoff: { ASHEN_STRIKE: 1, PACTS_END: 1, HOWL_FROM_BEYOND: 1, FIEND_FIRE: .7 },
  strength: { INFLAME: 1, DEMON_FORM: 1.5, FIGHT_ME: .7, SETUP_STRIKE: .35, BRAND: .2 },
  output: { SWORD_BOOMERANG: 1, TWIN_STRIKE: .75, WHIRLWIND: 1, CONFLAGRATION: 1, FIGHT_ME: .5, ONE_TWO_PUNCH: .7, STAMPEDE: .5, JUGGLING: .5 }
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
  const draw = (Number(card.cards_draw) || 0) + (card.cards_draw ? bonus('cards') : 0);
  const energy = (Number(card.energy_gain) || 0) + (card.energy_gain ? bonus('energy') : 0);
  // 战斗专注会锁住本回合后续抽牌，不能与无限制过牌完全等价。
  const resource = Math.min(1.5, draw * (id === 'BATTLE_TRANCE' ? .25 : .5) + energy * .5
    + (inSet(id, ['HEADBUTT', 'FORGOTTEN_RITUAL']) ? .5 : 0));
  const block = Math.min(1.5, ((Number(card.block) || 0) + bonus('block')) / 16)
    + (id === 'CRIMSON_MANTLE' ? .5 : 0) + (id === 'STONE_ARMOR' ? .5 : 0);
  let grant;
  if (archetype === 'auto_strike') {
    grant = { starter: id === 'HELLRAISER' ? 1 : 0, loop: inSet(id, ['POMMEL_STRIKE', 'PILLAGE']) ? 1 : 0,
      strikes: maps.strikes[id] || 0, resource: (inSet(id, ['POMMEL_STRIKE', 'PILLAGE']) ? 0 : resource) + block * .25 };
  } else if (archetype === 'exhaust') {
    grant = { outlet: maps.outlet[id] || 0, draw: id === 'DARK_EMBRACE' ? 1 : 0,
      block: id === 'FEEL_NO_PAIN' ? 1 : 0, payoff: maps.payoff[id] || 0, resource: resource + block * .25 };
  } else if (archetype === 'strength') {
    grant = { source: maps.strength[id] || (id === 'RUPTURE' && selfLoss ? .7 : id === 'DOMINATE' && vulnerable ? .4 : 0),
      output: maps.output[id] || (inSet(id, ['SPITE', 'TEAR_ASUNDER']) && selfLoss ? .6 : id === 'DISMANTLE' && vulnerable ? .5 : 0),
      resource, defense: block };
  } else if (archetype === 'block') {
    grant = { retention: id === 'BARRICADE' ? 1 : 0,
      conversion: id === 'BODY_SLAM' ? 1 : id === 'JUGGERNAUT' ? 1.5 : 0,
      generation: block, growth: inSet(id, ['PROLONG', 'UNMOVABLE']) ? 1 : 0, resource };
  } else throw new Error(`未知流派：${archetype}`);
  return Object.fromEntries(Object.entries(grant).filter(([, value]) => value > 0));
}

function relicGrants(id, archetype) {
  // 仅声明经本地牌面核对的功能；未建模遗物返回空，不当成负面。
  // 保留格挡、放大格挡分别建模，坚定不移不会被误算成壁垒替代。
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

function profile(deck, ownedRelics, key, target) {
  const plan = references[key];
  const cardVectors = deck.map(card => cardGrants(card, key, deck));
  const cardAmounts = Object.fromEntries(Object.keys(plan.roles).map(role => [role,
    cardVectors.reduce((sum, vector) => sum + (vector[role] || 0), 0)]));
  const amounts = { ...cardAmounts };
  for (const id of new Set(ownedRelics)) {
    for (const [role, value] of Object.entries(relicGrants(id, key))) amounts[role] += value;
  }
  const roles = Object.fromEntries(Object.keys(plan.roles).map(role => [role,
    clamp(amounts[role] / target[role])]));
  // 每张牌至多贡献一个密度单位；超出合理需求的角色贡献按比例分摊。
  // 遗物不占抽牌位置，也不能挤掉本来有价值的卡牌密度信用。
  const credit = cardVectors.map(vector => {
    const raw = Object.values(vector).reduce((sum, value) => sum + value, 0);
    return Object.entries(vector).reduce((sum, [role, value]) => sum
      + value / Math.max(1, raw) * Math.min(1, target[role] / (cardAmounts[role] || 1)), 0);
  });
  return { roles, amounts, cardAmounts, credit, density: deck.length ? credit.reduce((a, b) => a + b, 0) / deck.length : 0 };
}

function evaluate(deck, ownedRelics = [], key, version = 'v0.107.1', unverifiedFacts = []) {
  if (!Array.isArray(deck) || !Array.isArray(ownedRelics)) throw new TypeError('牌组和遗物必须为数组');
  const plan = references[key];
  if (!plan) throw new Error(`未知流派：${key}`);
  if (!deck.length) return { id: key, name: plan.name, score: 0, coverage: 0, connections: 0, focus: 0, status: 'empty', gaps: [], confidence: 'low' };
  const target = Object.fromEntries(Object.entries(plan.roles).map(([role, [, need]]) => [role, need]));
  const reference = profile(expand(plan.cards), plan.relics, key, target);
  if (Object.values(reference.roles).some(value => value < 1 - 1e-9)) throw new Error(`${key} 参考牌组没有满足自己声明的功能需求`);
  const result = profile(deck, ownedRelics, key, target);
  const coverage = Object.entries(plan.roles).reduce((sum, [role, [weight]]) => sum + weight * result.roles[role], 0) / 100;
  const connections = plan.links.reduce((sum, [left, right]) => sum + Math.min(result.roles[left], result.roles[right]), 0) / plan.links.length;
  const focus = clamp(result.density / reference.density);
  const structural = .8 * coverage + .2 * connections;
  const raw = 100 * structural * focus;
  const gaps = Object.entries(result.roles).filter(([, value]) => value < 1 - 1e-9)
    .map(([role, value]) => ({ role, label: plan.labels[role], coverage: Math.round(value * 100), priority: plan.roles[role][0] * (1 - value) }))
    .sort((a, b) => b.priority - a.priority);
  const unknownCards = deck.filter(copy => !cardIndex.has(copy.id)).map(copy => copy.id);
  const unknownRelics = ownedRelics.filter(id => !relicIndex.has(id));
  const dynamicUnknown = deck.filter(copy => copy.id === 'MAD_SCIENCE').map(copy => copy.id);
  const identity = plan.identity.some(role => result.roles[role] > 0);
  return { id: key, name: plan.name, score: Math.round(raw), raw, coverage: Math.round(100 * coverage),
    connections: Math.round(100 * connections), focus: Math.round(100 * focus),
    status: identity ? gaps.some(gap => plan.identity.includes(gap.role)) ? 'partial' : 'identified' : 'undirected',
    gaps, unknownCards, unknownRelics, dynamicUnknown,
    unverifiedFacts,
    confidence: version !== plan.version || unknownCards.length || dynamicUnknown.length || unknownRelics.length || unverifiedFacts.length ? 'partial' : 'configured',
    versionMatch: version === plan.version, referenceOrigin: plan.origin };
}

function evaluateAll(deck, ownedRelics = [], version, unverifiedFacts = []) {
  return Object.keys(references).map(key => evaluate(deck, ownedRelics, key, version, unverifiedFacts))
    .sort((a, b) => b.raw - a.raw);
}

function describeDirection(results) {
  const directed = results.filter(result => result.status !== 'undirected' && result.status !== 'empty')
    .sort((a, b) => b.raw - a.raw);
  const first = directed[0];
  if (!first || first.raw < 25) return { kind: 'undirected', primary: null, secondary: [] };
  // 这是显示策略草案；与分数参数分开，保留每种流派的独立数值。
  const secondary = directed.slice(1).filter(result => result.raw >= 30 && result.raw >= first.raw * .5).slice(0, 2);
  return { kind: secondary.length && first.raw - secondary[0].raw <= 10 ? 'mixed'
    : secondary.length ? 'primary_with_secondary' : 'primary', primary: first.id, secondary: secondary.map(result => result.id) };
}

module.exports = { expand, references, evaluate, evaluateAll, describeDirection, cardGrants, relicGrants, cardIndex, relicIndex };
