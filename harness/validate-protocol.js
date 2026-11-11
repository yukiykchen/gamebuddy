const assert = require('node:assert/strict');
const { DRAFT_ARCHETYPE_IDS, validateDraftImpactMessage, validateMessage, validateState } = require('./protocol');
const { FACT_SCHEMA, validateFactAck, validateFactEvent } = require('./fact-protocol');

const validState = {
  schema: 'gamebuddy.state.v1',
  timestamp: Date.now(),
  source: 'protocol-test',
  run: { act: 1, floor: 1, room: 'combat', character: 'ironclad' },
  player: { hp: 10, maxHp: 20, block: 0, gold: 0, energy: 3, maxEnergy: 3, cards: [], relics: [], potions: [] },
  combat: { turn: 1, hand: [], drawPile: [], discardPile: [], exhaustPile: [], enemies: [] },
  map: { visited: [] }
};

assert.equal(validateState(validState).ok, true);
assert.equal(validateState({ ...validState, combat: null }).ok, true);
assert.equal(validateMessage({ type: 'state', data: validState }).ok, true);
assert.equal(validateState({ ...validState, run: { ...validState.run, runId: 'run-001', startedAt: Date.now(), maxTurnDamage: 37 } }).ok, true);
assert.equal(validateState({ ...validState, run: { ...validState.run, runId: '' } }).ok, false);
assert.equal(validateMessage({
  type: 'event',
  name: 'run.started',
  timestamp: Date.now(),
  data: { runId: 'run-001', character: 'ironclad', ascension: 3, startedAt: Date.now() }
}).ok, true);
assert.equal(validateMessage({
  type: 'event',
  name: 'run.ended',
  timestamp: Date.now(),
  data: { runId: 'run-001', result: 'win', act: 3, floor: 55, bossName: '守护者', maxTurnDamage: 92 }
}).ok, true);
assert.equal(validateMessage({
  type: 'event',
  name: 'run.ended',
  timestamp: Date.now(),
  data: { runId: 'run-001', result: 'maybe' }
}).ok, false);
assert.equal(validateMessage({ type: 'event', name: 'turn.started', timestamp: Date.now(), data: { turn: 1 } }).ok, true);
assert.equal(validateMessage({ type: 'event', name: 'rest.opened', timestamp: Date.now() }).ok, true);
assert.equal(validateMessage({
  type: 'event',
  name: 'rest.closed',
  timestamp: Date.now(),
  data: { action: 'HEAL', hpBefore: 40, hpAfter: 64 }
}).ok, true);
assert.equal(validateMessage({ type: 'event', name: 'event.opened', timestamp: Date.now() }).ok, true);
assert.equal(validateMessage({ type: 'event', name: 'event.closed', timestamp: Date.now() }).ok, true);
assert.equal(validateMessage({ type: 'event', name: 'card.reward.closed', timestamp: Date.now() }).ok, true);
const validShop = {
  gold: 180,
  items: [
    { index: 0, itemType: 'card', id: 'IRON_WAVE', name: '铁斩波', price: 52, affordable: true, stocked: true, onSale: false, description: '造成伤害并获得格挡。', card: { id: 'IRON_WAVE', name: '铁斩波', upgraded: false, description: '造成伤害并获得格挡。', descriptionSource: 'runtime' } },
    { index: 1, itemType: 'relic', id: 'BAG_OF_PREPARATION', name: '准备背包', price: 175, affordable: true, stocked: true, onSale: false, description: '战斗开始时抽牌。' }
  ]
};
assert.equal(validateState({ ...validState, combat: null, shop: validShop }).ok, true);
assert.equal(validateMessage({ type: 'event', name: 'shop.opened', timestamp: Date.now(), data: validShop }).ok, true);
assert.equal(validateMessage({ type: 'event', name: 'shop.updated', timestamp: Date.now(), data: { ...validShop, gold: 128, items: validShop.items.slice(1) } }).ok, true);
assert.equal(validateMessage({ type: 'event', name: 'shop.closed', timestamp: Date.now() }).ok, true);
assert.equal(validateMessage({ type: 'event', name: 'shop.opened', timestamp: Date.now(), data: { ...validShop, items: [{ ...validShop.items[0], price: -1 }] } }).ok, false);
assert.equal(validateMessage({ type: 'event', name: 'shop.opened', timestamp: Date.now(), data: { ...validShop, items: [{ ...validShop.items[0], itemType: 'mystery' }] } }).ok, false);
assert.equal(validateMessage({
  type: 'event',
  name: 'card.reward.opened',
  timestamp: Date.now(),
  data: {
    cards: [{
      id: 'SEVEN_STARS',
      name: '七星+',
      upgraded: true,
      cost: 1,
      description: '实机升级效果。',
      descriptionSource: 'runtime',
      energyCost: 1,
      energyCostX: false,
      energyCostSource: 'runtime',
      starCost: 7,
      starCostX: false,
      starCostSource: 'runtime'
    }, 'IRON_WAVE'],
    canSkip: true,
    signature: 'SEVEN_STARS:True|IRON_WAVE:False'
  }
}).ok, true);
assert.equal(validateMessage({
  type: 'event',
  name: 'card.reward.opened',
  timestamp: Date.now(),
  data: { cards: [{ id: 'BAD_COST', energyCostX: 'yes' }] }
}).ok, false);
assert.equal(validateMessage({
  type: 'event',
  name: 'card.reward.opened',
  timestamp: Date.now(),
  data: { cards: [{ id: 'BAD_SOURCE', descriptionSource: 'guessed' }] }
}).ok, false);
assert.equal(validateMessage({
  type: 'event',
  name: 'card.reward.opened',
  timestamp: Date.now(),
  data: { cards: [] }
}).ok, false);
assert.equal(validateMessage({
  type: 'event',
  name: 'card.reward.opened',
  timestamp: Date.now(),
  data: { cards: ['IRON_WAVE'], signature: 42 }
}).ok, false);
assert.equal(validateMessage({
  type: 'event',
  name: 'card.reward.selected',
  timestamp: Date.now(),
  data: { signature: 'ANGER:False|IRON_WAVE:False', cardId: 'IRON_WAVE', upgraded: false }
}).ok, true);
assert.equal(validateMessage({
  type: 'event',
  name: 'card.reward.selected',
  timestamp: Date.now(),
  data: { signature: 'ANGER:False|IRON_WAVE:False', cardId: '', upgraded: false }
}).ok, false);
assert.equal(validateMessage({
  type: 'event',
  name: 'card.reward.selected',
  timestamp: Date.now(),
  data: { signature: 'ANGER:False|IRON_WAVE:False', cardId: 'IRON_WAVE' }
}).ok, false);
const validRemoval = {
  cards: [
    { id: 'STRIKE', name: '打击', type: 'Attack', upgraded: false, cost: 1, description: '造成 6 点伤害。', descriptionSource: 'runtime' },
    { id: 'STRIKE', name: '打击', type: 'Attack', upgraded: false, cost: 1 }
  ],
  minSelect: 2,
  maxSelect: 2,
  cancelable: false,
  promptTable: 'card_selection',
  promptKey: 'TO_REMOVE',
  inShop: false,
  candidateCount: 2
};
assert.equal(validateMessage({ type: 'event', name: 'card.removal.opened', timestamp: Date.now(), data: validRemoval }).ok, true);
assert.equal(validateMessage({ type: 'event', name: 'card.removal.closed', timestamp: Date.now() }).ok, true);
assert.equal(validateMessage({ type: 'event', name: 'card.removal.opened', timestamp: Date.now(), data: { ...validRemoval, cards: [] } }).ok, false);
assert.equal(validateMessage({ type: 'event', name: 'card.removal.opened', timestamp: Date.now(), data: { ...validRemoval, maxSelect: 'two' } }).ok, false);
assert.equal(validateMessage({ type: 'event', name: 'card.removal.opened', timestamp: Date.now(), data: { ...validRemoval, minSelect: 3, maxSelect: 2 } }).ok, false);
assert.equal(validateMessage({ type: 'event', name: 'card.removal.opened', timestamp: Date.now(), data: { ...validRemoval, cancelable: undefined } }).ok, false);
assert.equal(validateMessage({ type: 'event', name: 'card.removal.opened', timestamp: Date.now(), data: { ...validRemoval, cards: [{ name: 42 }] } }).ok, false);
assert.equal(validateMessage({ type: 'event', name: 'made.up.event', timestamp: Date.now() }).ok, false);
assert.equal(validateMessage({ type: 'state', data: { ...validState, player: { ...validState.player, energy: '3' } } }).ok, false);
assert.equal(validateMessage({ type: 'unknown' }).ok, false);

const fact = (overrides = {}) => ({
  schema: FACT_SCHEMA,
  eventVersion: 1,
  eventId: 'source-test:1',
  eventType: 'card.played',
  runId: 'run-001',
  segmentId: 'segment-001',
  combatId: 'combat-001',
  decisionId: null,
  actionId: 'action-001',
  parentActionId: null,
  sourceSessionId: 'source-test',
  sourceSeq: 1,
  occurredAt: Date.now(),
  sourceElapsedMs: 100,
  attemptGeneration: 0,
  contextSnapshotId: null,
  quality: { observationMethod: 'direct_hook', unknownFields: [], unknownReasons: {} },
  payload: { cardId: 'STRIKE_IRONCLAD', playMode: 'manual' },
  ...overrides
});
assert.equal(validateFactEvent(fact()).ok, true);
assert.equal(validateMessage({ type: 'fact', data: fact() }).ok, true);
assert.equal(validateFactEvent(fact({ sourceSeq: 0 })).ok, false);
assert.equal(validateFactEvent(fact({ eventType: 'invented.fact' })).ok, false);
assert.equal(validateFactEvent(fact({
  quality: {
    observationMethod: 'direct_hook',
    unknownFields: ['parentActionId'],
    unknownReasons: { parentActionId: 'not_observed' }
  }
})).ok, true);
assert.equal(validateFactEvent(fact({
  quality: {
    observationMethod: 'direct_hook',
    unknownFields: ['parentActionId'],
    unknownReasons: { parentActionId: 'maybe' }
  }
})).ok, false);
assert.equal(validateFactEvent(fact({
  eventType: 'combat.attempt_replaced',
  attemptGeneration: 2,
  payload: { replacedGeneration: 1 }
})).ok, true);
assert.equal(validateFactEvent(fact({
  eventType: 'run.ended',
  combatId: null,
  attemptGeneration: null,
  payload: { cleared: true, endReason: 'architect' }
})).ok, true);
assert.equal(validateFactEvent(fact({
  eventType: 'capture.capability_reported',
  combatId: null,
  attemptGeneration: null,
  payload: {
    capabilities: {
      card_play: { state: 'available' },
      damage: { state: 'unavailable', reason: 'hook_failed' }
    }
  }
})).ok, true);
assert.equal(validateFactAck({ type: 'fact_ack', sourceSessionId: 'source-test', ackSourceSeq: 1 }).ok, true);
assert.equal(validateFactAck({ type: 'fact_ack', sourceSessionId: '', ackSourceSeq: -1 }).ok, false);
assert.equal(validateState({
  ...validState,
  map: {
    visited: ['1,0'],
    nodes: [{ id: '1,0', row: 1, col: 0, type: 'Unknown', children: ['2,0'] }],
    routes: [['1,0', '2,0']]
  }
}).ok, true);
assert.equal(validateState({
  ...validState,
  map: { visited: [], nodes: [{ id: '1,0' }] }
}).ok, false);
assert.equal(validateState({
  ...validState,
  combat: null,
  event: {
    eventId: 'SUNKEN_STATUE',
    pageId: 'INITIAL',
    title: '沉没雕像',
    description: '钱可是个好东西……',
    options: [{ index: 0, optionId: 'GRAB_SWORD', label: '拿起石剑', description: '获得石之剑。', locked: false }]
  }
}).ok, true);
assert.equal(validateState({
  ...validState,
  combat: null,
  event: {
    eventId: 42,
    pageId: 'INITIAL',
    title: '错误事件',
    description: '',
    options: [{ index: 0, optionId: false, label: '选项', description: '' }]
  }
}).ok, false);
assert.equal(validateState({
  ...validState,
  combat: null,
  event: {
    title: '佩尔',
    description: '有傀儡来了？能帮我去看看父亲的状况么？我太累了……',
    kind: 'ancient',
    options: [
      { index: 0, label: '佩尔之角', description: '将2张放松加入你的牌组。' },
      { index: 1, label: '佩尔之牙', description: '从你的牌组中选择5张牌移除。在每场战斗结束时，将其中随机1牌升级然后返还。' },
      { index: 2, label: '佩尔之眼', description: '你在每场战斗中第一次没有打出任何牌就结束回合时，消耗所有手牌然后进行一个额外回合。' }
    ]
  }
}).ok, true);
assert.equal(validateState({
  ...validState,
  combat: null,
  cardReward: {
    options: [{ index: 0, id: 'Bash', name: '痛击', type: 'Attack', cost: 2, upgraded: false, description: '造成伤害。' }]
  }
}).ok, true);
assert.equal(validateState({
  ...validState,
  cardReward: { options: [{ index: 0, id: 'Bash', name: '痛击', type: 'Attack', cost: '2' }] }
}).ok, false);
assert.equal(validateState({
  ...validState,
  combat: null,
  reward: { cards: [{ id: 'ANGER', name: '愤怒' }], canSkip: true }
}).ok, true);
assert.equal(validateState({
  ...validState,
  combat: null,
  reward: { cards: [] }
}).ok, false);

const rewardSignature = 'ANGER:False|POMMEL_STRIKE:False|BASH:True';
const draftImpact = {
  type: 'draft_impact',
  signature: rewardSignature,
  impacts: ['ANGER', 'POMMEL_STRIKE', 'BASH'].map((cardId, cardIndex) => ({
    cardId,
    deltaPoints: cardIndex - 1,
    reason: '兼容原因',
    archetypes: DRAFT_ARCHETYPE_IDS.map((id, archetypeIndex) => ({
      id,
      deltaPoints: cardIndex + archetypeIndex - 2,
      reason: `${id}-reason`,
      beforeScore: 10 + archetypeIndex,
      afterScore: 11 + cardIndex + archetypeIndex,
      beforeStage: 'unformed',
      afterStage: cardIndex === 2 && archetypeIndex === 0 ? 'started' : 'unformed',
      completedAxes: cardIndex === 2 && archetypeIndex === 0 ? ['auto_gate'] : []
    }))
  }))
};
draftImpact.impacts.forEach(impact => { impact.deltaPoints = impact.archetypes[0].deltaPoints; });
assert.equal(validateDraftImpactMessage(draftImpact).ok, true);
assert.equal(draftImpact.signature, rewardSignature);

const invalidDraft = mutate => {
  const copy = JSON.parse(JSON.stringify(draftImpact));
  mutate(copy);
  return validateDraftImpactMessage(copy).ok;
};
assert.equal(invalidDraft(message => message.impacts[0].archetypes.pop()), false);
assert.equal(invalidDraft(message => {
  message.impacts[0].archetypes[3].id = message.impacts[0].archetypes[0].id;
}), false);
assert.equal(invalidDraft(message => { message.impacts[1].archetypes[2].deltaPoints = 101; }), false);
assert.equal(invalidDraft(message => { message.impacts[2].archetypes[1].deltaPoints = 0.5; }), false);
assert.equal(invalidDraft(message => { message.impacts[0].deltaPoints += 1; }), false);
assert.equal(invalidDraft(message => { delete message.impacts[0].archetypes[0].afterScore; }), false);
assert.equal(invalidDraft(message => { message.impacts[0].archetypes[0].afterStage = 'winning'; }), false);
assert.equal(invalidDraft(message => { message.impacts[0].archetypes[0].completedAxes = ['auto_gate', 'auto_gate']; }), false);

const readinessDraft = JSON.parse(JSON.stringify(draftImpact));
for (const impact of readinessDraft.impacts) {
  for (const archetype of impact.archetypes) {
    archetype.readiness = archetype.afterScore;
    archetype.status = archetype.afterStage === 'started' ? 'operational' : 'missing_starter';
    archetype.beforeStatus = 'missing_starter';
    archetype.afterStatus = archetype.status;
    archetype.presentFunctions = archetype.completedAxes.map(id => ({ id, label: id }));
    archetype.missingFunctions = [{ id: 'auto_loop', label: '抽牌循环' }];
    archetype.completedFunctions = archetype.presentFunctions;
  }
}
assert.equal(validateDraftImpactMessage(readinessDraft).ok, true);
assert.equal(validateDraftImpactMessage(draftImpact).ok, true);
assert.equal(invalidDraft(message => {
  message.impacts[0].archetypes[0].readiness = message.impacts[0].archetypes[0].afterScore;
  message.impacts[0].archetypes[0].status = 'operational';
}), false);
assert.equal(validateMessage({
  type: 'event',
  name: 'card.reward.opened',
  timestamp: Date.now(),
  data: {
    opportunityId: 'reward:1',
    source: 'event',
    signature: 'HELLRAISER:False',
    cards: [{ id: 'HELLRAISER', name: '地狱狂徒' }]
  }
}).ok, true);
assert.equal(validateMessage({
  type: 'event',
  name: 'shop.updated',
  timestamp: Date.now(),
  data: {
    ...validShop,
    visitId: 'shop:1',
    items: [{ ...validShop.items[0], stockKey: 'card:2' }]
  }
}).ok, true);

// C# ShopItemSnapshot 对删牌服务使用默认 StockKey=null，CamelCase序列化仍保留null。
const nullableShop = { ...validShop, items: [...validShop.items, {
  index: 20, itemType: 'service', id: 'CARD_REMOVAL', name: '删除一张牌', price: 75,
  stocked: true, affordable: true, onSale: false, card: null, stockKey: null
}] };
assert.equal(validateMessage({ type: 'event', name: 'shop.opened', timestamp: Date.now(), data: nullableShop }).ok, true);
assert.equal(validateMessage({ type: 'state', data: { ...validState, combat: null, shop: nullableShop } }).ok, true);
for (const stockKey of [5, {}, '', 'x'.repeat(65)]) {
  assert.equal(validateMessage({ type: 'event', name: 'shop.updated', timestamp: Date.now(), data: { ...nullableShop, items: [{ ...nullableShop.items[0], stockKey }] } }).ok, false);
}

console.log('Protocol validation cases passed, including four-archetype draft impacts');
