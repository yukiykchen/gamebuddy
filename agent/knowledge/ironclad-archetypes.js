const cards = require('../data/codex/cards.json');
const affinity = require('./archetype-affinity');
const { normalizeKey, inferUpgraded } = require('./spire-codex');

const ARCHETYPES = Object.freeze([
  Object.freeze({ id: 'auto_strike', key: 'autoStrike', name: '自动打击流' }),
  Object.freeze({ id: 'exhaust', key: 'exhaust', name: '消耗引擎' }),
  Object.freeze({ id: 'strength', key: 'strength', name: '力量叠加' }),
  Object.freeze({ id: 'block', key: 'block', name: '格挡壁垒' })
]);
const ARCHETYPE_KEYS = Object.freeze(ARCHETYPES.map(item => item.key));
const ROLES = Object.freeze([
  'gate', 'core', 'engine', 'payoff', 'support',
  'conditional', 'neutral', 'softAnti', 'hardPoison'
]);
const GROUPS = Object.freeze([
  'none',
  'auto_gate', 'auto_loop', 'auto_payoff', 'auto_ammo', 'auto_support',
  'exhaust_pain', 'exhaust_draw', 'exhaust_outlet', 'exhaust_event', 'exhaust_payoff', 'exhaust_support',
  'strength_source', 'strength_multihit', 'strength_throughput', 'strength_balance',
  'block_gate', 'block_conversion', 'block_source', 'block_support'
]);
const CONDITIONS = Object.freeze([
  'auto_gate_active', 'exhaust_any_gate', 'exhaust_both_gates',
  'auto_attack_package', 'auto_exhaust_package', 'auto_vulnerable_package',
  'exhaust_draw_active', 'strength_source_active', 'strength_vulnerable_package',
  'block_gate_active', 'block_conversion_active'
]);
const REASONS = Object.freeze({
  neutral: '不直接服务该流派',
  dilution: '仅增加牌组厚度',
  auto_gate: '启动自动打击',
  auto_loop: '补充抽牌循环',
  auto_payoff: '兑现打击牌数量',
  auto_ammo: '提供打击弹药',
  auto_support: '改善循环吞吐',
  auto_vulnerable: '创造易伤输出窗口',
  auto_upgrade: '升级自动打击轴件',
  auto_strength: '力量增益放大每次打击',
  auto_attack_copy: '条件复制攻击',
  auto_energy: '补充自动打击能量',
  auto_conditional_draw: '条件抽牌可能中断后续抽取',
  auto_external_exhaust: '需要外部消耗事件',
  auto_hand_reset: '清空手牌后随机补牌，稳定性有限',
  auto_hand_clear: '主动清理非攻击牌，需按牌序使用',
  auto_conditional: '需地狱狂徒后协同',
  auto_conflict: '复制或改写牌序，轻度干扰循环',
  exhaust_pain: '把消耗事件转为格挡',
  exhaust_draw: '把消耗事件转为抽牌',
  exhaust_outlet: '提供可重复消耗出口',
  exhaust_event: '批量制造消耗事件',
  exhaust_payoff: '兑现消耗事件或消耗堆',
  exhaust_support: '补充消耗循环资源',
  exhaust_draw_lock: '条件抽牌会锁住后续抽牌',
  deck_direction_conflict: '牌组方向冲突',
  exhaust_conditional: '需消耗收益闸门后兑现',
  strength_source: '提供可靠力量来源',
  strength_multihit: '以多段命中放大力量',
  strength_throughput: '增加攻击吞吐',
  strength_balance: '兼顾力量来源与输出',
  strength_vulnerable: '以易伤支持力量输出窗口',
  strength_exhaust_risk: '主动消耗可能损失力量轴件',
  strength_transform_risk: '变化攻击牌会破坏多段放大',
  strength_conditional: '需力量来源后放大',
  block_gate: '积累或放大格挡',
  block_conversion: '把格挡转为伤害',
  block_source: '提供高效格挡',
  block_support: '改善格挡循环',
  block_search: '帮助寻找格挡轴件',
  block_energy: '补充格挡轴件能量',
  block_conditional: '需格挡闸门后协同'
});

const allowed = {
  role: new Set(ROLES),
  group: new Set(GROUPS),
  reason: new Set(Object.keys(REASONS)),
  condition: new Set(CONDITIONS)
};

function entry(role, group, weight, reasonCode, condition) {
  return Object.freeze({
    role,
    group,
    weight,
    reasonCode,
    reason: REASONS[reasonCode],
    ...(condition ? { condition } : {})
  });
}

const N = () => entry('neutral', 'none', 0, 'neutral');
const A = (role, group, weight, reasonCode, condition) => entry(role, group, weight, reasonCode, condition);

// Every row deliberately has four cells. There is no implicit neutral fallback.
const MATRIX_ROWS = [
  ['UPPERCUT', A('support', 'auto_support', 0.35, 'auto_vulnerable'), N(), A('conditional', 'strength_throughput', 0.3, 'strength_vulnerable', 'strength_vulnerable_package'), N()],
  ['FIGHT_ME', A('conditional', 'auto_support', 0.25, 'auto_strength', 'auto_attack_package'), N(), A('core', 'strength_balance', 0.8, 'strength_balance'), N()],
  ['DOMINATE', A('conditional', 'auto_support', 0.2, 'auto_strength', 'auto_vulnerable_package'), N(), A('conditional', 'strength_source', 0.65, 'strength_source', 'strength_vulnerable_package'), N()],
  ['CINDER', A('softAnti', 'auto_loop', -0.2, 'auto_conflict'), A('engine', 'exhaust_outlet', 0.45, 'exhaust_outlet'), A('conditional', 'strength_throughput', -0.12, 'strength_exhaust_risk', 'strength_source_active'), N()],
  ['CASCADE', A('support', 'auto_support', 0.35, 'auto_support'), N(), A('support', 'strength_throughput', 0.35, 'strength_throughput'), N()],
  ['BODY_SLAM', N(), N(), N(), A('payoff', 'block_conversion', 1, 'block_conversion')],
  ['MANGLE', N(), N(), N(), N()],
  ['VICIOUS', A('conditional', 'auto_support', 0.2, 'auto_vulnerable', 'auto_vulnerable_package'), N(), A('conditional', 'strength_throughput', 0.25, 'strength_vulnerable', 'strength_vulnerable_package'), N()],
  ['POMMEL_STRIKE', A('engine', 'auto_loop', 1, 'auto_loop'), N(), A('support', 'strength_throughput', 0.35, 'strength_throughput'), A('support', 'block_support', 0.18, 'block_search')],
  ['PILLAGE', A('engine', 'auto_loop', 0.9, 'auto_loop'), N(), A('support', 'strength_throughput', 0.45, 'strength_throughput'), N()],
  ['JUGGERNAUT', N(), N(), N(), A('payoff', 'block_conversion', 1, 'block_conversion')],
  ['PRIMAL_FORCE', A('softAnti', 'auto_loop', -0.2, 'auto_conflict'), N(), A('softAnti', 'strength_multihit', -0.35, 'strength_transform_risk'), N()],
  ['TWIN_STRIKE', A('conditional', 'auto_ammo', 0.9, 'auto_ammo', 'auto_gate_active'), N(), A('conditional', 'strength_multihit', 0.75, 'strength_conditional', 'strength_source_active'), N()],
  ['INFERNAL_BLADE', N(), N(), A('support', 'strength_throughput', 0.3, 'strength_throughput'), N()],
  ['HELLRAISER', A('gate', 'auto_gate', 1, 'auto_gate'), A('softAnti', 'exhaust_support', -0.1, 'deck_direction_conflict'), N(), N()],
  ['UNMOVABLE', N(), N(), N(), A('gate', 'block_gate', 1, 'block_gate')],
  ['TRUE_GRIT', N(), A('engine', 'exhaust_outlet', 0.85, 'exhaust_outlet'), A('conditional', 'strength_throughput', -0.1, 'strength_exhaust_risk', 'strength_source_active'), A('conditional', 'block_source', 0.45, 'block_conditional', 'block_gate_active')],
  ['BARRICADE', N(), N(), N(), A('gate', 'block_gate', 1, 'block_gate')],
  ['HEADBUTT', A('support', 'auto_support', 0.45, 'auto_support'), N(), A('support', 'strength_throughput', 0.25, 'strength_throughput'), A('support', 'block_support', 0.18, 'block_search')],
  ['PACTS_END', N(), A('payoff', 'exhaust_payoff', 0.8, 'exhaust_payoff'), N(), N()],
  ['AGGRESSION', N(), A('softAnti', 'exhaust_support', -0.1, 'deck_direction_conflict'), A('support', 'strength_throughput', 0.45, 'strength_throughput'), N()],
  ['PERFECTED_STRIKE', A('payoff', 'auto_payoff', 1, 'auto_payoff'), A('softAnti', 'exhaust_support', -0.12, 'deck_direction_conflict'), N(), N()],
  ['STONE_ARMOR', N(), N(), N(), A('conditional', 'block_source', 0.7, 'block_conditional', 'block_gate_active')],
  ['IMPERVIOUS', N(), A('support', 'exhaust_support', 0.25, 'exhaust_support'), N(), A('conditional', 'block_source', 1, 'block_conditional', 'block_gate_active')],
  ['COLOSSUS', N(), N(), N(), A('conditional', 'block_source', 0.5, 'block_conditional', 'block_gate_active')],
  ['HOWL_FROM_BEYOND', N(), A('payoff', 'exhaust_payoff', 0.9, 'exhaust_payoff'), N(), N()],
  ['HEMOKINESIS', N(), N(), N(), N()],
  ['SPITE', N(), N(), A('conditional', 'strength_multihit', 0.6, 'strength_conditional', 'strength_source_active'), N()],
  ['FIEND_FIRE', A('conditional', 'auto_support', 0.05, 'auto_conditional', 'auto_gate_active'), A('conditional', 'exhaust_event', 1, 'exhaust_conditional', 'exhaust_both_gates'), A('conditional', 'strength_throughput', -0.16, 'strength_exhaust_risk', 'strength_source_active'), N()],
  ['DEMON_FORM', A('conditional', 'auto_support', 0.3, 'auto_strength', 'auto_attack_package'), N(), A('gate', 'strength_source', 1, 'strength_source'), N()],
  ['DEMONIC_SHIELD', N(), N(), N(), N()],
  ['STAMPEDE', A('conditional', 'auto_support', 0.25, 'auto_attack_copy', 'auto_attack_package'), N(), A('support', 'strength_throughput', 0.55, 'strength_throughput'), N()],
  ['ANGER', A('softAnti', 'auto_loop', -0.25, 'auto_conflict'), A('softAnti', 'exhaust_support', -0.15, 'deck_direction_conflict'), A('support', 'strength_throughput', 0.35, 'strength_throughput'), N()],
  ['BATTLE_TRANCE', A('conditional', 'auto_support', 0.5, 'auto_conditional_draw', 'auto_attack_package'), A('conditional', 'exhaust_support', -0.12, 'exhaust_draw_lock', 'exhaust_draw_active'), A('support', 'strength_throughput', 0.75, 'strength_throughput'), A('support', 'block_support', 0.22, 'block_search')],
  ['TREMBLE', A('support', 'auto_support', 0.3, 'auto_vulnerable'), N(), A('conditional', 'strength_throughput', 0.25, 'strength_vulnerable', 'strength_vulnerable_package'), N()],
  ['DRUM_OF_BATTLE', A('support', 'auto_support', 0.65, 'auto_support'), A('support', 'exhaust_support', 0.75, 'exhaust_support'), N(), N()],
  ['STRIKE_IRONCLAD', A('conditional', 'auto_ammo', 0.45, 'auto_ammo', 'auto_gate_active'), N(), N(), N()],
  ['TEAR_ASUNDER', N(), N(), A('conditional', 'strength_multihit', 0.45, 'strength_conditional', 'strength_source_active'), N()],
  ['DISMANTLE', N(), N(), A('conditional', 'strength_multihit', 0.45, 'strength_conditional', 'strength_source_active'), N()],
  ['TAUNT', A('support', 'auto_support', 0.25, 'auto_vulnerable'), N(), A('conditional', 'strength_throughput', 0.2, 'strength_vulnerable', 'strength_vulnerable_package'), A('conditional', 'block_source', 0.35, 'block_conditional', 'block_gate_active')],
  ['RUPTURE', A('conditional', 'auto_support', 0.2, 'auto_strength', 'auto_attack_package'), N(), A('gate', 'strength_source', 0.75, 'strength_source'), N()],
  ['BLOODLETTING', A('support', 'auto_support', 0.35, 'auto_energy'), N(), A('support', 'strength_throughput', 0.65, 'strength_throughput'), A('support', 'block_support', 0.15, 'block_energy')],
  ['WHIRLWIND', N(), N(), A('conditional', 'strength_multihit', 1, 'strength_conditional', 'strength_source_active'), N()],
  ['UNRELENTING', N(), N(), A('support', 'strength_throughput', 0.45, 'strength_throughput'), N()],
  ['FEEL_NO_PAIN', N(), A('gate', 'exhaust_pain', 1, 'exhaust_pain'), N(), A('support', 'block_support', 0.55, 'block_support')],
  ['NOT_YET', N(), N(), N(), N()],
  ['RAMPAGE', N(), N(), N(), N()],
  ['JUGGLING', A('conditional', 'auto_support', 0.25, 'auto_attack_copy', 'auto_attack_package'), A('softAnti', 'exhaust_support', -0.12, 'deck_direction_conflict'), A('support', 'strength_throughput', 0.55, 'strength_throughput'), N()],
  ['BULLY', N(), N(), N(), N()],
  ['ARMAMENTS', A('support', 'auto_support', 0.3, 'auto_upgrade'), N(), N(), A('conditional', 'block_source', 0.35, 'block_conditional', 'block_gate_active')],
  ['CRUELTY', A('conditional', 'auto_support', 0.25, 'auto_vulnerable', 'auto_vulnerable_package'), N(), A('conditional', 'strength_throughput', 0.3, 'strength_vulnerable', 'strength_vulnerable_package'), N()],
  ['STOKE', A('conditional', 'auto_support', 0.15, 'auto_hand_reset', 'auto_exhaust_package'), A('conditional', 'exhaust_event', 0.9, 'exhaust_conditional', 'exhaust_both_gates'), A('conditional', 'strength_throughput', -0.16, 'strength_exhaust_risk', 'strength_source_active'), N()],
  ['FLAME_BARRIER', N(), N(), N(), A('conditional', 'block_source', 0.75, 'block_conditional', 'block_gate_active')],
  ['ASHEN_STRIKE', A('conditional', 'auto_ammo', 0.4, 'auto_ammo', 'auto_gate_active'), A('payoff', 'exhaust_payoff', 0.8, 'exhaust_payoff'), N(), N()],
  ['BRAND', N(), A('engine', 'exhaust_outlet', 0.65, 'exhaust_outlet'), A('core', 'strength_balance', 0.6, 'strength_balance'), N()],
  ['CONFLAGRATION', N(), N(), A('conditional', 'strength_multihit', 1, 'strength_conditional', 'strength_source_active'), N()],
  ['MOLTEN_FIST', A('conditional', 'auto_support', 0.25, 'auto_vulnerable', 'auto_vulnerable_package'), N(), A('conditional', 'strength_throughput', 0.35, 'strength_vulnerable', 'strength_vulnerable_package'), N()],
  ['INFLAME', A('support', 'auto_support', 0.45, 'auto_strength'), N(), A('gate', 'strength_source', 1, 'strength_source'), N()],
  ['BURNING_PACT', A('support', 'auto_support', 0.75, 'auto_support'), A('engine', 'exhaust_outlet', 1, 'exhaust_outlet'), N(), N()],
  ['FEED', N(), N(), N(), N()],
  ['RAGE', A('conditional', 'auto_support', 0.45, 'auto_conditional', 'auto_gate_active'), N(), A('support', 'strength_balance', 0.35, 'strength_balance'), A('support', 'block_support', 0.35, 'block_support')],
  ['INFERNO', N(), N(), N(), N()],
  ['BASH', A('support', 'auto_support', 0.3, 'auto_vulnerable'), N(), A('conditional', 'strength_throughput', 0.25, 'strength_vulnerable', 'strength_vulnerable_package'), N()],
  ['THRASH', A('softAnti', 'auto_loop', -0.15, 'auto_conflict'), A('engine', 'exhaust_outlet', 0.45, 'exhaust_outlet'), A('conditional', 'strength_multihit', 0.7, 'strength_conditional', 'strength_source_active'), N()],
  ['BREAK', A('support', 'auto_support', 0.45, 'auto_vulnerable'), N(), A('conditional', 'strength_throughput', 0.35, 'strength_vulnerable', 'strength_vulnerable_package'), N()],
  ['HAVOC', N(), A('engine', 'exhaust_outlet', 0.55, 'exhaust_outlet'), A('conditional', 'strength_throughput', -0.12, 'strength_exhaust_risk', 'strength_source_active'), N()],
  ['OFFERING', A('support', 'auto_support', 0.85, 'auto_energy'), A('support', 'exhaust_support', 0.65, 'exhaust_support'), A('support', 'strength_throughput', 0.8, 'strength_throughput'), A('support', 'block_support', 0.22, 'block_energy')],
  ['BREAKTHROUGH', N(), N(), N(), N()],
  ['CRIMSON_MANTLE', N(), N(), N(), A('conditional', 'block_source', 0.75, 'block_conditional', 'block_gate_active')],
  ['SHRUG_IT_OFF', A('support', 'auto_support', 0.55, 'auto_support'), N(), A('support', 'strength_throughput', 0.25, 'strength_throughput'), A('conditional', 'block_source', 0.65, 'block_conditional', 'block_gate_active')],
  ['TANK', N(), N(), N(), N()],
  ['CORRUPTION', N(), A('conditional', 'exhaust_event', 0.8, 'exhaust_conditional', 'exhaust_both_gates'), A('conditional', 'strength_throughput', -0.12, 'strength_exhaust_risk', 'strength_source_active'), N()],
  ['PYRE', A('support', 'auto_support', 0.55, 'auto_energy'), A('support', 'exhaust_support', 0.4, 'exhaust_support'), A('support', 'strength_throughput', 0.4, 'strength_throughput'), A('support', 'block_support', 0.18, 'block_energy')],
  ['BLOOD_WALL', N(), N(), N(), A('conditional', 'block_source', 0.85, 'block_conditional', 'block_gate_active')],
  ['FORGOTTEN_RITUAL', N(), A('support', 'exhaust_support', 0.75, 'exhaust_support'), N(), N()],
  ['EXPECT_A_FIGHT', A('conditional', 'auto_support', 0.3, 'auto_energy', 'auto_attack_package'), N(), A('support', 'strength_throughput', 0.55, 'strength_throughput'), N()],
  ['STOMP', A('conditional', 'auto_support', 0.25, 'auto_energy', 'auto_attack_package'), N(), A('support', 'strength_throughput', 0.45, 'strength_throughput'), N()],
  ['ONE_TWO_PUNCH', A('support', 'auto_support', 0.5, 'auto_attack_copy'), N(), A('conditional', 'strength_multihit', 0.9, 'strength_conditional', 'strength_source_active'), N()],
  ['EVIL_EYE', N(), A('conditional', 'exhaust_support', 0.5, 'exhaust_conditional', 'exhaust_any_gate'), N(), A('conditional', 'block_source', 0.6, 'block_conditional', 'block_gate_active')],
  ['SECOND_WIND', A('conditional', 'auto_support', 0.18, 'auto_hand_clear', 'auto_exhaust_package'), A('conditional', 'exhaust_event', 0.85, 'exhaust_conditional', 'exhaust_both_gates'), A('conditional', 'strength_throughput', -0.14, 'strength_exhaust_risk', 'strength_source_active'), A('conditional', 'block_source', 0.65, 'block_conditional', 'block_gate_active')],
  ['BLUDGEON', N(), N(), N(), N()],
  ['IRON_WAVE', N(), N(), N(), A('conditional', 'block_source', 0.35, 'block_conditional', 'block_gate_active')],
  ['THUNDERCLAP', A('support', 'auto_support', 0.25, 'auto_vulnerable'), N(), A('conditional', 'strength_throughput', 0.2, 'strength_vulnerable', 'strength_vulnerable_package'), N()],
  ['DEFEND_IRONCLAD', N(), N(), N(), A('conditional', 'block_source', 0.25, 'block_conditional', 'block_gate_active')],
  ['SETUP_STRIKE', A('conditional', 'auto_ammo', 0.9, 'auto_ammo', 'auto_gate_active'), N(), A('core', 'strength_balance', 0.6, 'strength_balance'), N()],
  ['SWORD_BOOMERANG', N(), N(), A('conditional', 'strength_multihit', 0.9, 'strength_conditional', 'strength_source_active'), N()],
  ['DARK_EMBRACE', A('conditional', 'auto_support', 0.3, 'auto_external_exhaust', 'auto_exhaust_package'), A('gate', 'exhaust_draw', 1, 'exhaust_draw'), N(), N()]
];

const IRONCLAD_ARCHETYPE_MATRIX = Object.freeze(Object.fromEntries(MATRIX_ROWS.map(([id, autoStrike, exhaust, strength, block]) => [
  id,
  Object.freeze({ autoStrike, exhaust, strength, block })
])));

function validateMatrix(matrix = IRONCLAD_ARCHETYPE_MATRIX) {
  if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) throw new TypeError('matrix must be an object');
  for (const [cardId, evaluations] of Object.entries(matrix)) {
    const keys = Object.keys(evaluations || {}).sort();
    const expected = [...ARCHETYPE_KEYS].sort();
    if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
      throw new TypeError(`${cardId} must explicitly define ${ARCHETYPE_KEYS.join(', ')}`);
    }
    for (const key of ARCHETYPE_KEYS) {
      const cell = evaluations[key];
      if (!cell || !allowed.role.has(cell.role)) throw new TypeError(`${cardId}.${key} has invalid role`);
      if (!allowed.group.has(cell.group)) throw new TypeError(`${cardId}.${key} has invalid group`);
      if (!Number.isFinite(cell.weight)) throw new TypeError(`${cardId}.${key} has invalid weight`);
      if (!allowed.reason.has(cell.reasonCode)) throw new TypeError(`${cardId}.${key} has invalid reason`);
      if (cell.reason !== REASONS[cell.reasonCode]) throw new TypeError(`${cardId}.${key} has unresolved reason`);
      if (cell.condition != null && !allowed.condition.has(cell.condition)) {
        throw new TypeError(`${cardId}.${key} has invalid condition`);
      }
    }
  }
  return true;
}
validateMatrix();

const CARD_INDEX = new Map();
for (const card of cards) {
  for (const key of [card.id, card.name]) {
    const normalized = normalizeKey(key);
    if (normalized && !CARD_INDEX.has(normalized)) CARD_INDEX.set(normalized, card.id);
  }
}

const RELIC_INDEX = new Map([
  ['STRIKE_DUMMY', '打击木偶'], ['BAG_OF_PREPARATION', '准备背包'],
  ['CHARONS_ASHES', '卡戎之灰'], ['PAPER_MONEY', '纸钱'],
  ['VAJRA', '金刚杵'], ['GIRYA', '壶铃'], ['ANCHOR', '锚'],
  ['CALIPERS', '外卡钳'], ['ORICHALCUM', '奥利哈钢']
].flatMap(([id, name]) => [[normalizeKey(id), id], [normalizeKey(name), id]]));
RELIC_INDEX.set(normalizeKey('山铜'), 'ORICHALCUM');

const CONFIG = Object.freeze({
  autoStrike: {
    axes: { auto_gate: 20, auto_loop: 25, auto_payoff: 15, auto_ammo: 15, auto_support: 15 },
    setup: ['auto_gate', 'auto_loop'],
    setupMax: 10,
    relics: { STRIKE_DUMMY: 3, BAG_OF_PREPARATION: 3 },
    gates: ['auto_gate'],
    direct: ['auto_gate', 'auto_loop', 'auto_payoff', 'auto_ammo'],
    peripheral: ['auto_support'],
    coreLoop: ['auto_gate', ['auto_loop', 'auto_payoff', 'auto_ammo']],
    ideal: ['auto_gate', 'auto_loop', 'auto_payoff', 'auto_ammo'],
    synergies: [
      { groups: ['auto_gate', 'auto_loop'], maximum: 4 },
      { groups: ['auto_gate', 'auto_ammo'], maximum: 4 },
      { groups: ['auto_gate', 'auto_payoff'], maximum: 3 }
    ]
  },
  exhaust: {
    axes: { exhaust_pain: 17.5, exhaust_draw: 17.5, exhaust_outlet: 20, exhaust_event: 15, exhaust_payoff: 20, exhaust_support: 10 },
    setup: ['exhaust_pain', 'exhaust_draw', 'exhaust_outlet'],
    setupMax: 0,
    relics: { CHARONS_ASHES: 4, PAPER_MONEY: 2 },
    gates: ['exhaust_pain', 'exhaust_draw'],
    direct: ['exhaust_pain', 'exhaust_draw', 'exhaust_outlet', 'exhaust_event', 'exhaust_payoff'],
    peripheral: ['exhaust_support'],
    coreLoop: [['exhaust_pain', 'exhaust_draw'], ['exhaust_outlet', 'exhaust_event']],
    ideal: ['exhaust_pain', 'exhaust_draw', 'exhaust_outlet', ['exhaust_event', 'exhaust_payoff']],
    synergies: [
      { groups: ['exhaust_pain', 'exhaust_outlet'], maximum: 3 },
      { groups: ['exhaust_draw', 'exhaust_event'], maximum: 3 },
      { groups: ['exhaust_pain', 'exhaust_draw', 'exhaust_outlet'], maximum: 5 }
    ]
  },
  strength: {
    axes: { strength_source: 30, strength_multihit: 40, strength_throughput: 15, strength_balance: 15 },
    setup: ['strength_source', 'strength_multihit'],
    setupMax: 0,
    relics: { VAJRA: 5, GIRYA: 4 },
    gates: ['strength_source'],
    direct: ['strength_source', 'strength_multihit', 'strength_balance'],
    peripheral: ['strength_throughput'],
    coreLoop: ['strength_source', ['strength_multihit', 'strength_balance']],
    ideal: ['strength_source', ['strength_multihit', 'strength_balance'], 'strength_throughput'],
    synergies: [
      { groups: ['strength_source', 'strength_multihit'], maximum: 8 },
      { groups: ['strength_source', 'strength_balance'], maximum: 3 }
    ]
  },
  block: {
    axes: { block_gate: 25, block_conversion: 30, block_source: 30, block_support: 15 },
    setup: ['block_gate', 'block_conversion', 'block_source'],
    setupMax: 0,
    relics: { ANCHOR: 3, CALIPERS: 4, ORICHALCUM: 2 },
    gates: ['block_gate'],
    direct: ['block_gate', 'block_conversion', 'block_source'],
    peripheral: ['block_support'],
    coreLoop: ['block_gate', 'block_conversion', 'block_source'],
    ideal: ['block_gate', 'block_conversion', 'block_source'],
    synergies: [
      { groups: ['block_gate', 'block_source'], maximum: 5 },
      { groups: ['block_gate', 'block_conversion'], maximum: 4 },
      { groups: ['block_gate', 'block_conversion', 'block_source'], maximum: 5 }
    ]
  }
});

function cardId(card) {
  return CARD_INDEX.get(normalizeKey(card?.id || card))
    || CARD_INDEX.get(normalizeKey(card?.name))
    || null;
}

function relicId(relic) {
  return RELIC_INDEX.get(normalizeKey(relic?.id || relic))
    || RELIC_INDEX.get(normalizeKey(relic?.name))
    || normalizeKey(relic?.id || relic?.name || relic)
    || null;
}

function isIronclad(character) {
  return ['IRONCLAD', '铁甲战士'].includes(normalizeKey(character));
}

function buildDeckContext(deck = []) {
  const copies = [];
  const groups = new Map();
  for (const card of deck || []) {
    const id = cardId(card);
    if (!id || !IRONCLAD_ARCHETYPE_MATRIX[id]) continue;
    const effective = inferUpgraded(card) ? 1.35 : 1;
    copies.push({ id, effective });
    for (const key of ARCHETYPE_KEYS) {
      const cell = IRONCLAD_ARCHETYPE_MATRIX[id][key];
      if (cell.group === 'none') continue;
      const groupKey = `${key}:${cell.group}`;
      groups.set(groupKey, (groups.get(groupKey) || 0) + Math.max(0, cell.weight) * effective);
    }
  }
  const has = (key, group) => (groups.get(`${key}:${group}`) || 0) > 0;
  const ids = new Set(copies.map(copy => copy.id));
  const includesAny = candidates => candidates.some(id => ids.has(id));
  const active = {
    autoGate: has('autoStrike', 'auto_gate'),
    exhaustGates: Number(has('exhaust', 'exhaust_pain')) + Number(has('exhaust', 'exhaust_draw')),
    strengthSource: has('strength', 'strength_source'),
    blockGate: has('block', 'block_gate'),
    blockConversion: has('block', 'block_conversion')
  };
  active.autoAttackPackage = active.autoGate
    && (has('autoStrike', 'auto_loop') || has('autoStrike', 'auto_ammo'));
  active.autoExhaustPackage = active.autoGate && includesAny([
    'BURNING_PACT', 'TRUE_GRIT', 'FIEND_FIRE', 'STOKE', 'HAVOC',
    'CORRUPTION', 'SECOND_WIND', 'DARK_EMBRACE', 'FEEL_NO_PAIN'
  ]);
  active.autoVulnerablePackage = active.autoGate && includesAny([
    'UPPERCUT', 'DOMINATE', 'TREMBLE', 'TAUNT', 'BASH', 'BREAK',
    'THUNDERCLAP', 'MOLTEN_FIST'
  ]);
  active.strengthVulnerablePackage = active.strengthSource && includesAny([
    'UPPERCUT', 'DOMINATE', 'TREMBLE', 'TAUNT', 'BASH', 'BREAK',
    'THUNDERCLAP', 'MOLTEN_FIST'
  ]);
  return {
    copies,
    size: (deck || []).length,
    groups,
    active
  };
}

function conditionFactor(condition, context) {
  if (!condition) return 1;
  const active = context.active;
  return {
    auto_gate_active: active.autoGate ? 1 : 0.25,
    auto_attack_package: active.autoAttackPackage ? 1 : 0.12,
    auto_exhaust_package: active.autoExhaustPackage ? 1 : 0.12,
    auto_vulnerable_package: active.autoVulnerablePackage ? 1 : 0.12,
    exhaust_any_gate: active.exhaustGates > 0 ? 1 : 0.2,
    exhaust_both_gates: active.exhaustGates === 2 ? 1 : active.exhaustGates === 1 ? 0.5 : 0.2,
    exhaust_draw_active: active.exhaustGates > 0
      && context.groups.get('exhaust:exhaust_draw') > 0 ? 1 : 0.1,
    strength_source_active: active.strengthSource ? 1 : 0.25,
    strength_vulnerable_package: active.strengthVulnerablePackage ? 1 : 0.12,
    block_gate_active: active.blockGate ? 1 : 0.25,
    block_conversion_active: active.blockConversion ? 1 : 0.25
  }[condition];
}

function noCopiesInDraw(deckSize, copies, draws) {
  if (copies <= 0 || deckSize <= 0) return 1;
  if (draws > deckSize - copies) return 0;
  let probability = 1;
  for (let index = 0; index < draws; index += 1) {
    probability *= (deckSize - copies - index) / (deckSize - index);
  }
  return probability;
}

function requirementReliability(context, key, requirements, extraDraw = 0) {
  if (!requirements.length || context.size === 0) return 0;
  const normalized = requirements.map(requirement => (
    Array.isArray(requirement) ? requirement : [requirement]
  ));
  const counts = normalized.map(groups => context.copies.reduce((total, copy) => {
    const cell = IRONCLAD_ARCHETYPE_MATRIX[copy.id][key];
    return groups.includes(cell.group) && cell.weight > 0 ? total + 1 : total;
  }, 0));
  if (counts.some(count => count === 0)) return 0;
  const draws = Math.min(context.size, 10 + extraDraw);
  let probability = 0;
  const subsetCount = 1 << counts.length;
  for (let mask = 0; mask < subsetCount; mask += 1) {
    let missingCopies = 0;
    let bits = 0;
    for (let index = 0; index < counts.length; index += 1) {
      if ((mask & (1 << index)) === 0) continue;
      missingCopies += counts[index];
      bits += 1;
    }
    const term = noCopiesInDraw(context.size, missingCopies, draws);
    probability += bits % 2 === 0 ? term : -term;
  }
  return Math.max(0, Math.min(1, probability));
}

const STACK_GROUPS = new Set([
  'auto_loop', 'exhaust_outlet', 'exhaust_event', 'strength_multihit', 'block_source', 'block_conversion'
]);
const STACK_SATURATION = 0.45;
const SLOT_SATURATION = 1.35;
const STACK_FULL_AT = 2;

function saturated(maximum, amount, rate = SLOT_SATURATION) {
  if (amount <= 0) return 0;
  return maximum * (1 - Math.exp(-rate * amount));
}

function stackFullness(context, key, groups) {
  const stacked = groups.filter(group => STACK_GROUPS.has(group));
  if (!stacked.length) return 1;
  return Math.min(...stacked.map(group => Math.min(1, (context.groups.get(`${key}:${group}`) || 0) / STACK_FULL_AT)));
}

function hasGroup(context, key, group) {
  return (context.groups.get(`${key}:${group}`) || 0) > 0;
}

function axesSatisfied(context, key, requirements) {
  return requirements.every(requirement => Array.isArray(requirement)
    ? requirement.some(group => hasGroup(context, key, group))
    : hasGroup(context, key, requirement));
}

function peripheralFactor(key, config, context) {
  const directCount = config.direct.filter(group => hasGroup(context, key, group)).length;
  if (directCount === 0) return 0.08;
  const gateActive = key === 'autoStrike' ? context.active.autoGate
    : key === 'exhaust' ? context.active.exhaustGates > 0
      : key === 'strength' ? context.active.strengthSource
        : context.active.blockGate;
  return gateActive ? 1 : 0.3;
}

function structuralFactor(key, group, context) {
  if (key === 'exhaust' && group === 'exhaust_payoff') {
    return context.active.exhaustGates === 2 ? 1 : context.active.exhaustGates === 1 ? 0.65 : 0.35;
  }
  if (key === 'block' && group === 'block_conversion') {
    return context.active.blockGate ? 1 : 0.35;
  }
  return 1;
}

const KEY_FUNCTIONS = Object.freeze({
  autoStrike: Object.freeze(['auto_gate', 'auto_loop', 'auto_payoff', 'auto_ammo']),
  exhaust: Object.freeze(['exhaust_pain', 'exhaust_draw', 'exhaust_outlet', 'exhaust_event', 'exhaust_payoff']),
  strength: Object.freeze(['strength_source', 'strength_multihit', 'strength_balance', 'strength_throughput']),
  block: Object.freeze(['block_gate', 'block_conversion', 'block_source'])
});
const FUNCTION_LABELS = Object.freeze({
  auto_gate: '自动打击启动',
  auto_loop: '抽牌循环',
  auto_payoff: '打击兑现',
  auto_ammo: '打击弹药',
  exhaust_pain: '疼痛格挡',
  exhaust_draw: '消耗抽牌',
  exhaust_outlet: '消耗出口',
  exhaust_event: '消耗事件',
  exhaust_payoff: '消耗兑现',
  strength_source: '力量来源',
  strength_multihit: '多段放大',
  strength_balance: '力量平衡',
  strength_throughput: '攻击吞吐',
  block_gate: '格挡启动',
  block_conversion: '格挡转伤',
  block_source: '格挡来源'
});
const STATUS_LABELS = Object.freeze({
  missing_starter: '尚缺启动组件',
  incomplete_loop: '已有启动，闭环尚未齐备',
  operational: '可以运转',
  stable: '稳定成型'
});
const VULNERABLE_CARD_IDS = new Set([
  'UPPERCUT', 'DOMINATE', 'TREMBLE', 'TAUNT', 'BASH', 'BREAK', 'THUNDERCLAP', 'MOLTEN_FIST'
]);
const STARTER_FUNCTIONS = Object.freeze({
  autoStrike: Object.freeze(['auto_gate']),
  exhaust: Object.freeze(['exhaust_pain', 'exhaust_draw']),
  strength: Object.freeze(['strength_source']),
  block: Object.freeze(['block_gate'])
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function conditionFullyMet(condition, context) {
  if (!condition) return true;
  const active = context.active;
  if (condition === 'strength_vulnerable_package') {
    const unconditionalSource = context.copies.some(copy => {
      const cell = IRONCLAD_ARCHETYPE_MATRIX[copy.id].strength;
      return cell.group === 'strength_source' && cell.weight > 0 && !cell.condition;
    });
    const vulnerable = context.copies.some(copy => VULNERABLE_CARD_IDS.has(copy.id));
    return unconditionalSource && vulnerable;
  }
  return {
    auto_gate_active: Boolean(active.autoGate),
    auto_attack_package: Boolean(active.autoAttackPackage),
    auto_exhaust_package: Boolean(active.autoExhaustPackage),
    auto_vulnerable_package: Boolean(active.autoVulnerablePackage),
    exhaust_any_gate: active.exhaustGates > 0,
    exhaust_both_gates: active.exhaustGates === 2,
    exhaust_draw_active: active.exhaustGates > 0 && (context.groups.get('exhaust:exhaust_draw') || 0) > 0,
    strength_source_active: Boolean(active.strengthSource),
    block_gate_active: Boolean(active.blockGate),
    block_conversion_active: Boolean(active.blockConversion)
  }[condition] === true;
}

function enabledFunctionIds(key, context) {
  const present = new Set();
  for (const copy of context.copies) {
    const cell = IRONCLAD_ARCHETYPE_MATRIX[copy.id][key];
    if (!cell || cell.weight <= 0 || cell.group === 'none') continue;
    if (!conditionFullyMet(cell.condition, context)) continue;
    present.add(cell.group);
  }
  return present;
}

function functionViews(ids) {
  return ids.map(id => Object.freeze({ id, label: FUNCTION_LABELS[id] || id }));
}

function operatingStatus(key, present, idealConsistency) {
  const has = id => present.has(id);
  if (key === 'autoStrike') {
    const starter = has('auto_gate');
    const loop = has('auto_loop') || has('auto_payoff') || has('auto_ammo');
    if (starter && has('auto_loop') && has('auto_payoff') && has('auto_ammo') && idealConsistency >= 0.6) return 'stable';
    if (starter && loop) return 'operational';
    return starter ? 'incomplete_loop' : 'missing_starter';
  }
  if (key === 'exhaust') {
    const starter = has('exhaust_pain') || has('exhaust_draw');
    const progress = has('exhaust_outlet') || has('exhaust_event');
    const stable = has('exhaust_pain') && has('exhaust_draw') && has('exhaust_outlet')
      && (has('exhaust_event') || has('exhaust_payoff'))
      && idealConsistency >= 0.6;
    if (stable) return 'stable';
    if (starter && progress) return 'operational';
    return starter ? 'incomplete_loop' : 'missing_starter';
  }
  if (key === 'strength') {
    const starter = has('strength_source');
    const combat = has('strength_multihit') || has('strength_balance');
    if (starter && combat && has('strength_throughput') && idealConsistency >= 0.6) return 'stable';
    if (starter && combat) return 'operational';
    return starter ? 'incomplete_loop' : 'missing_starter';
  }
  const ready = has('block_gate') && has('block_conversion') && has('block_source');
  if (ready && idealConsistency >= 0.6) return 'stable';
  if (ready) return 'operational';
  return has('block_gate') ? 'incomplete_loop' : 'missing_starter';
}

function hasPartialKit(key, present) {
  const starters = new Set(STARTER_FUNCTIONS[key]);
  return KEY_FUNCTIONS[key].some(id => present.has(id) && !starters.has(id));
}

function statusLabelFor(status, partial) {
  const label = STATUS_LABELS[status] || STATUS_LABELS.missing_starter;
  return status === 'missing_starter' && partial ? `${label}；已有部分配套` : label;
}

function legacyStage(status) {
  if (status === 'stable') return 'formed';
  if (status === 'operational') return 'started';
  return 'unformed';
}

function groupEnabledAmount(deck, key, group) {
  const context = buildDeckContext(deck);
  let amount = 0;
  for (const copy of context.copies) {
    const cell = IRONCLAD_ARCHETYPE_MATRIX[copy.id][key];
    if (!cell || cell.group !== group || cell.weight <= 0) continue;
    if (!conditionFullyMet(cell.condition, context)) continue;
    amount += cell.weight * copy.effective;
  }
  return amount;
}

function archetypeHasDirectKit(deck, key) {
  const context = buildDeckContext(deck);
  const direct = new Set(CONFIG[key].direct);
  return context.copies.some(copy => {
    const cell = IRONCLAD_ARCHETYPE_MATRIX[copy.id][key];
    return cell && cell.weight > 0 && direct.has(cell.group);
  });
}

function scoreIroncladArchetypes(deck, relics = []) {
  return ARCHETYPES.map(archetype => {
    const detail = affinity.evaluate(deck || [], relics, archetype.id);
    const status = detail.status;
    const partial = status === 'missing_starter' && detail.presentFunctions.length > 0;
    return {
      ...detail, name: archetype.name,
      // 旧消费者继续读 score/readiness；它们均为同一次契合度计算。
      blueprintScore: detail.coverage, consistency: detail.focus,
      stage: legacyStage(status), statusLabel: statusLabelFor(status, partial), partialKit: partial,
      started: status === 'operational' || status === 'stable', mature: status === 'stable'
    };
  });
}

function impactIroncladArchetypes(deck, relics = [], candidate) {
  const normalized = affinity.normalizeDeck([candidate])[0];
  const id = normalized.id;
  if (!id) return null;
  const before = scoreIroncladArchetypes(deck, relics);
  const after = scoreIroncladArchetypes([...(deck || []), candidate], relics);
  return ARCHETYPES.map((archetype, index) => {
    const previous = before[index], next = after[index];
    const cell = IRONCLAD_ARCHETYPE_MATRIX[id]?.[archetype.key];
    const lesson = affinity.explainImpact(deck || [], relics, candidate, archetype.id, previous, next);
    const completedFunctions = next.presentFunctions.filter(item => !previous.presentFunctions.some(existing => existing.id === item.id));
    return {
      id: archetype.id, name: archetype.name,
      beforeScore: previous.score, afterScore: next.score, readiness: next.score, affinity: next.score,
      status: next.status, beforeStatus: previous.status, afterStatus: next.status,
      beforeStage: previous.stage, afterStage: next.stage, started: previous.started,
      presentFunctions: next.presentFunctions, missingFunctions: next.missingFunctions, completedFunctions,
      beforePresentFunctions: previous.presentFunctions, beforeMissingFunctions: previous.missingFunctions,
      completedAxes: completedFunctions.map(item => item.id),
      beforeIdentity: previous.identity, afterIdentity: next.identity,
      beforeConfidence: previous.confidence, beforeReferenceName: previous.referenceName, referenceName: next.referenceName,
      referenceId: next.referenceId, referenceOrigin: next.referenceOrigin,
      gaps: next.gaps, confidence: next.confidence, uncertainties: next.uncertainties, ruleVersion: next.ruleVersion,
      role: cell?.role || 'support', ...lesson
    };
  });
}

function decorateIroncladArchetypes(character, deck, relics, candidates) {
  if (!isIronclad(character) || !Array.isArray(candidates)) return candidates;
  const archetypeScores = scoreIroncladArchetypes(deck, relics);
  return candidates.map(candidate => {
    const card = typeof candidate === 'string' ? { id: candidate, name: candidate } : candidate;
    const archetypeImpacts = impactIroncladArchetypes(deck, relics, card);
    if (!archetypeImpacts) return candidate;
    return {
      ...card,
      archetypeScores,
      archetypeImpacts,
      archetypeImpact: archetypeImpacts.find(impact => impact.id === 'auto_strike')
    };
  });
}

function generateMatrixMarkdown() {
  const ironcladCards = cards.filter(card => card.color === 'ironclad');
  const lines = [
    '# 铁甲战士四流派完整评价矩阵',
    '',
    `> 数据版本：Codex 当前快照；卡牌数：${ironcladCards.length}；矩阵版本：1。`,
    '> 此矩阵用于角色与关键提示；实时契合度由 archetype-affinity.js 按功能、配合和参照密度计算，不表示胜率。',
    '',
    '| ID | 卡牌 | 自动打击 | 消耗引擎 | 力量叠加 | 格挡壁垒 |',
    '|---|---|---|---|---|---|'
  ];
  const label = cell => `${cell.role}：${REASONS[cell.reasonCode]}`;
  for (const card of ironcladCards) {
    const row = IRONCLAD_ARCHETYPE_MATRIX[card.id];
    lines.push(`| \`${card.id}\` | ${card.name} | ${label(row.autoStrike)} | ${label(row.exhaust)} | ${label(row.strength)} | ${label(row.block)} |`);
  }
  return `${lines.join('\n')}\n`;
}

module.exports = {
  ARCHETYPES,
  ROLES,
  GROUPS,
  CONDITIONS,
  REASONS,
  IRONCLAD_ARCHETYPE_MATRIX,
  validateMatrix,
  KEY_FUNCTIONS,
  FUNCTION_LABELS,
  STATUS_LABELS,
  scoreIroncladArchetypes,
  impactIroncladArchetypes,
  decorateIroncladArchetypes,
  generateMatrixMarkdown,
  isIronclad,
  cardId,
  conditionFullyMet,
  groupEnabledAmount,
  archetypeHasDirectKit,
  buildDeckContext
};
