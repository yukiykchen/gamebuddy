const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createObservationStore } = require('./observation-store');
const { validateRecommendation } = require('../agent/recommendation');
const { rankRoutes, recommendRoute, scoreNode, scoreParts, buildScoreContext, ensureMapRoutes } = require('../agent/tasks/route');
const { isRestSite, recommendRest, rankSmithCards } = require('../agent/tasks/rest');
const { recommendEvent } = require('../agent/tasks/event');
const { recommendCardReward, rankCards } = require('../agent/tasks/card-reward');
const { parseJsonObject, createOpenAiClient, readLlmConfig, extractResponseText } = require('../agent/llm/openai');
const { createOrchestrator } = require('../agent/orchestrator');

const lifecycle = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'lifecycle.json'), 'utf8'));
const mapState = lifecycle[2];

const shopOverElite = rankRoutes(mapState);
assert.equal(shopOverElite[0].targetType, 'Elite');
assert.equal(shopOverElite[0].eliteCount, 1);
assert.equal(shopOverElite[1].eliteCount, 0);

const shopCtx = buildScoreContext(mapState);
assert.ok(scoreParts('Shop', shopCtx).payoff > scoreParts('Elite', shopCtx).payoff);
assert.ok(scoreParts('Shop', shopCtx).payoff >= 10);

const lowHpState = {
  ...mapState,
  player: { ...mapState.player, hp: 20, maxHp: 80, gold: 109 }
};
const lowHp = rankRoutes(lowHpState);
assert.equal(lowHp[0].targetType, 'Elite');
assert.ok(scoreNode('Elite', buildScoreContext(lowHpState)) < 0);

const healthyElite = rankRoutes({
  ...mapState,
  player: { ...mapState.player, hp: 72, maxHp: 80, gold: 20 }
});
assert.equal(healthyElite[0].targetType, 'Elite');

const fullHpSmith = rankRoutes({
  run: mapState.run,
  player: { ...mapState.player, hp: 80, maxHp: 80, gold: 20 },
  combat: null,
  map: {
    visited: ['0,0'],
    current: '0,0',
    nodes: [
      { id: '0,0', row: 0, col: 0, type: 'Unknown', children: ['1,0', '1,1'] },
      { id: '1,0', row: 1, col: 0, type: 'RestSite', children: ['2,0'] },
      { id: '1,1', row: 1, col: 1, type: 'Monster', children: ['2,0'] },
      { id: '2,0', row: 2, col: 0, type: 'Boss', children: [] }
    ],
    routes: [
      ['0,0', '1,0', '2,0'],
      ['0,0', '1,1', '2,0']
    ]
  }
});
assert.equal(fullHpSmith[0].targetType, 'RestSite');
assert.ok(scoreParts('RestSite', buildScoreContext({ player: { ...mapState.player, hp: 80, maxHp: 80 } })).payoff >= 9);

const eliteThenRest = rankRoutes({
  run: mapState.run,
  player: { ...mapState.player, hp: 40, maxHp: 80, gold: 20 },
  combat: null,
  map: {
    visited: ['0,0'],
    current: '0,0',
    nodes: [
      { id: '0,0', row: 0, col: 0, type: 'Unknown', children: ['1,0', '1,1'] },
      { id: '1,0', row: 1, col: 0, type: 'Elite', children: ['2,0'] },
      { id: '1,1', row: 1, col: 1, type: 'Elite', children: ['2,1'] },
      { id: '2,0', row: 2, col: 0, type: 'RestSite', children: ['3,0'] },
      { id: '2,1', row: 2, col: 1, type: 'Monster', children: ['3,0'] },
      { id: '3,0', row: 3, col: 0, type: 'Boss', children: [] }
    ],
    routes: [
      ['0,0', '1,0', '2,0', '3,0'],
      ['0,0', '1,1', '2,1', '3,0']
    ]
  }
});
assert.equal(eliteThenRest[0].targetType, 'Elite');
assert.ok(eliteThenRest[0].route.includes('2,0'));
assert.ok(eliteThenRest[0].score > eliteThenRest[1].score);

const sameTypeSplit = rankRoutes({
  run: mapState.run,
  player: { ...mapState.player, hp: 72, maxHp: 80, gold: 20 },
  combat: null,
  map: {
    visited: ['0,0'],
    current: '0,0',
    nodes: [
      { id: '0,0', row: 0, col: 1, type: 'Unknown', children: ['1,0', '1,1', '1,2'] },
      { id: '1,0', row: 1, col: 0, type: 'Monster', children: ['2,0'] },
      { id: '1,1', row: 1, col: 1, type: 'Monster', children: ['2,1'] },
      { id: '1,2', row: 1, col: 2, type: 'Monster', children: ['2,2'] },
      { id: '2,0', row: 2, col: 0, type: 'Elite', children: ['3,0'] },
      { id: '2,1', row: 2, col: 1, type: 'RestSite', children: ['3,0'] },
      { id: '2,2', row: 2, col: 2, type: 'Monster', children: ['3,0'] },
      { id: '3,0', row: 3, col: 1, type: 'Boss', children: [] }
    ],
    routes: [
      ['0,0', '1,0', '2,0', '3,0'],
      ['0,0', '1,1', '2,1', '3,0'],
      ['0,0', '1,2', '2,2', '3,0']
    ]
  }
});
assert.equal(sameTypeSplit[0].targetType, 'Monster');
assert.equal(sameTypeSplit[0].targetPosition, '左侧');
assert.equal(sameTypeSplit[0].eliteCount, 1);

const fourWaySplit = {
  nodes: [
    { id: '0,0', row: 1, col: 0 },
    { id: '0,1', row: 1, col: 1 },
    { id: '0,2', row: 1, col: 2 },
    { id: '0,3', row: 1, col: 3 }
  ]
};
assert.equal(require('../agent/tasks/route').targetPositionLabel(fourWaySplit, '0,0'), '从左第1个');
assert.equal(require('../agent/tasks/route').targetPositionLabel(fourWaySplit, '0,2'), '从左第3个');

function restState(hp) {
  return {
    ...mapState,
    run: { ...mapState.run, room: 'RestSite', currentNode: 'RestSite' },
    player: { ...mapState.player, hp, maxHp: 80 }
  };
}

assert.equal(isRestSite(mapState), false);
assert.equal(isRestSite(restState(72)), true);
assert.equal(rankSmithCards(mapState.player.cards)[0].card.name, '痛击');

const merged = readLlmConfig({
  GAMEBUDDY_LLM_API_KEY: 'sk-test-kimi',
  GAMEBUDDY_LLM_BASE_URL: 'https://api.moonshot.cn/v1',
  GAMEBUDDY_LLM_MODEL: 'kimi-k2.5',
  GAMEBUDDY_LLM_WIRE_API: 'chat',
  GAMEBUDDY_LLM_REASONING_EFFORT: 'high'
});
assert.equal(merged.enabled, true);
assert.equal(merged.model, 'kimi-k2.5');
assert.equal(merged.wireApi, 'chat');
assert.equal(merged.source, 'env');
assert.equal(extractResponseText({ output_text: '{"index":1}' }), '{"index":1}');

const eventState = {
  ...mapState,
  run: { ...mapState.run, room: 'EventRoom' },
  event: {
    title: '沉没雕像',
    description: '钱可是个好东西……',
    options: [
      { index: 0, label: '拿起石剑', description: '获得石之剑。', locked: false },
      { index: 1, label: '潜水', description: '获得112金币。失去7点生命。', locked: false }
    ]
  }
};
const cardRewardState = {
  ...mapState,
  player: {
    ...mapState.player,
    cards: [...mapState.player.cards, { id: 'Defend_R', name: '防御', type: 'Skill', cost: 1, upgraded: false }]
  },
  cardReward: {
    options: [
      { index: 0, id: 'Strike_R', name: '打击', type: 'Attack', cost: 1, upgraded: false, description: '造成 6 点伤害。' },
      { index: 1, id: 'PommelStrike', name: '剑柄打击', type: 'Attack', cost: 1, upgraded: false, description: '造成伤害。抽 1 张牌。' },
      { index: 2, id: 'ShrugItOff', name: '耸肩无视', type: 'Skill', cost: 1, upgraded: false, description: '获得格挡。抽 1 张牌。' }
    ]
  }
};
const store = createObservationStore({ staleAfterMs: 5000 });
store.ingest({ type: 'state', data: mapState }, 1723370002000);
const observation = store.getObservation(1723370002100);
assert.equal(observation.fresh, true);

recommendRoute(mapState, { now: 1 }).then(async rulesRec => {
  assert.equal(validateRecommendation(rulesRec).ok, true);
  assert.equal(rulesRec.source, 'rules');
  assert.equal(rulesRec.task, 'map_route');
  assert.equal(rulesRec.primary.action, 'TAKE_ROUTE');
  assert.equal(rulesRec.primary.targetId, '2,1');
  assert.match(rulesRec.reason, /精英和.*火堆/);

  const eventFallback = await recommendEvent(eventState, { now: 1 });
  assert.equal(eventFallback.task, 'event_choice');
  assert.equal(eventFallback.source, 'rules');
  const eventLlm = await recommendEvent(eventState, {
    llm: { enabled: true, completeEvent: async () => ({ index: 1, reason: '生命代价可接受，金币收益更高。' }) },
    now: 2
  });
  assert.equal(eventLlm.source, 'llm');
  assert.equal(eventLlm.primary.optionIndex, 1);

  const rewardFallback = await recommendCardReward(cardRewardState, { now: 3 });
  assert.equal(validateRecommendation(rewardFallback).ok, true);
  assert.equal(rewardFallback.task, 'card_reward');
  assert.equal(rewardFallback.primary.action, 'CHOOSE_CARD');
  assert.equal(rewardFallback.primary.cardIndex, 2);
  assert.match(rewardFallback.reason, /防御|牌|卡组/);
  assert.equal(rankCards(cardRewardState)[0].card.name, '耸肩无视');
  const rewardLlm = await recommendCardReward(cardRewardState, {
    llm: { enabled: true, completeCardReward: async () => ({ index: 1, reason: '可以抽牌，提升卡组循环。' }) },
    now: 4
  });
  assert.equal(rewardLlm.source, 'llm');
  assert.equal(rewardLlm.primary.cardIndex, 1);

  const llm = {
    enabled: true,
    completeRoute: async () => ({ index: 1, reason: '生命够用，去打精英换遗物。' })
  };
  const llmRec = await recommendRoute(mapState, { llm, now: 2 });
  assert.equal(llmRec.source, 'rules');
  assert.equal(llmRec.primary.label, '精英');
  assert.match(llmRec.reason, /精英/);

  const parsed = parseJsonObject('```json\n{"index":0,"reason":"去商店"}\n```');
  assert.equal(parsed.index, 0);

  const { createOpenAiClient } = require('../agent/llm/openai');
  const client = createOpenAiClient({
    enabled: true,
    apiKey: 'test-key',
    baseURL: 'https://example.test/v1',
    model: 'demo',
    wireApi: 'chat'
  }, {
    fetchImpl: async (url, options) => {
      assert.match(url, /chat\/completions$/);
      assert.match(options.headers.Authorization, /Bearer test-key/);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"index":1,"reason":"打精英"}' } }] })
      };
    }
  });
  const llmPick = await client.completeRoute({ candidates: [{ index: 0 }, { index: 1 }], state: mapState });
  assert.equal(llmPick.index, 1);
  assert.equal(llmPick.reason, '打精英');

  const responsesClient = createOpenAiClient({
    enabled: true,
    apiKey: 'sk-test',
    baseURL: 'https://ai.gs88.shop/v1',
    model: 'gpt-5.5',
    wireApi: 'responses',
    reasoningEffort: 'xhigh'
  }, {
    fetchImpl: async (url, options) => {
      assert.match(url, /\/responses$/);
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'gpt-5.5');
      assert.equal(body.store, false);
      assert.equal(body.reasoning.effort, 'xhigh');
      return {
        ok: true,
        json: async () => ({ output_text: '{"index":0,"reason":"回血"}' })
      };
    }
  });
  const restPick = await responsesClient.completeRest({ hp: 20, candidates: [{ index: 0, action: 'HEAL' }] });
  assert.equal(restPick.index, 0);
  assert.equal(restPick.reason, '回血');

  const eventClient = createOpenAiClient({
    enabled: true,
    apiKey: 'sk-test',
    baseURL: 'https://api.moonshot.cn/v1',
    model: 'kimi-k3',
    wireApi: 'chat'
  }, {
    fetchImpl: async (url, options) => {
      assert.match(url, /chat\/completions$/);
      const body = JSON.parse(options.body);
      assert.match(body.messages[0].content, /事件选择顾问/);
      assert.equal(body.temperature, 1);
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"index":1,"reason":"金币收益更高"}' } }] }) };
    }
  });
  const eventPick = await eventClient.completeEvent({ options: [{ index: 0 }, { index: 1 }] });
  assert.equal(eventPick.index, 1);
  const rewardClient = createOpenAiClient({
    enabled: true,
    apiKey: 'sk-test',
    baseURL: 'https://api.moonshot.cn/v1',
    model: 'kimi-k2.5',
    wireApi: 'chat'
  }, {
    fetchImpl: async (url, options) => {
      assert.match(url, /chat\/completions$/);
      const body = JSON.parse(options.body);
      assert.match(body.messages[0].content, /选牌顾问/);
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"index":2,"reason":"补足防御和抽牌"}' } }] }) };
    }
  });
  const rewardPick = await rewardClient.completeCardReward({ candidates: cardRewardState.cardReward.options });
  assert.equal(rewardPick.index, 2);

  let published;
  const orchestrator = createOrchestrator({
    llm: { enabled: false },
    onRecommendation: rec => { published = rec; },
    now: () => 3
  });
  const first = await orchestrator.consider(observation);
  assert.equal(first.primary.targetId, '2,1');
  assert.equal(published.primary.targetId, '2,1');
  const second = await orchestrator.consider(observation);
  assert.equal(second, first);

  const empty = await orchestrator.consider({
    schema: 'gamebuddy.observation.v1',
    fresh: true,
    state: { ...mapState, map: { visited: [], routes: [] } }
  });
  assert.equal(empty, first);

  const offGraphMap = {
    ...mapState.map,
    current: '-1,0',
    start: null,
    routes: []
  };
  const synthesized = ensureMapRoutes(offGraphMap);
  assert.ok(synthesized.routes.length > 0);
  assert.ok(synthesized.routes.some(route => route.includes('3,0')));

  const offGraphState = { ...mapState, map: offGraphMap };
  const synthesizedRec = await recommendRoute(offGraphState, { now: 4 });
  assert.equal(synthesizedRec.task, 'map_route');
  assert.equal(synthesizedRec.primary.action, 'TAKE_ROUTE');
  assert.ok(synthesizedRec.primary.targetId);

  const staleOrch = createOrchestrator({ llm: { enabled: false }, now: () => 5 });
  const staleRec = await staleOrch.consider({
    schema: 'gamebuddy.observation.v1',
    fresh: false,
    state: offGraphState
  });
  assert.equal(staleRec.task, 'map_route');
  assert.ok(staleRec.primary.targetId);

  const healRec = await recommendRest(restState(24), { now: 10 });
  assert.equal(validateRecommendation(healRec).ok, true);
  assert.equal(healRec.task, 'rest_site');
  assert.equal(healRec.primary.action, 'HEAL');

  const smithRec = await recommendRest(restState(76), { now: 11 });
  assert.equal(smithRec.primary.action, 'SMITH');
  assert.equal(smithRec.primary.cardName, '痛击');

  const restObservation = {
    schema: 'gamebuddy.observation.v1',
    fresh: true,
    state: restState(76)
  };
  const restOrch = createOrchestrator({ llm: { enabled: false }, now: () => 12 });
  const restPublished = await restOrch.consider(restObservation);
  assert.equal(restPublished.task, 'rest_site');
  assert.equal(restPublished.primary.action, 'SMITH');

  const restByEvent = createOrchestrator({ llm: { enabled: false }, now: () => 13 });
  const viaEvent = await restByEvent.consider({
    schema: 'gamebuddy.observation.v1',
    fresh: true,
    state: { ...mapState, run: { ...mapState.run, currentNode: 'RestSite' } },
    recentEvents: [{ name: 'rest.opened' }]
  });
  assert.equal(viaEvent.task, 'rest_site');

  const eventStatuses = [];
  const eventOrch = createOrchestrator({
    llm: { enabled: true, completeEvent: async () => ({ index: 1, reason: '金币收益更高。' }) },
    onAgentStatus: status => eventStatuses.push(status),
    now: () => 14
  });
  const eventRec = await eventOrch.consider({ schema: 'gamebuddy.observation.v1', fresh: true, state: eventState });
  assert.equal(eventRec.task, 'event_choice');
  assert.equal(eventRec.source, 'llm');
  assert.deepEqual(eventStatuses.map(status => status.status), ['thinking', 'ready']);

  const rewardStatuses = [];
  const rewardOrch = createOrchestrator({
    llm: { enabled: false },
    onAgentStatus: status => rewardStatuses.push(status),
    now: () => 15
  });
  const rewardRec = await rewardOrch.consider({ schema: 'gamebuddy.observation.v1', fresh: true, state: cardRewardState });
  assert.equal(rewardRec.task, 'card_reward');
  assert.equal(rewardRec.primary.cardIndex, 2);
  assert.deepEqual(rewardStatuses.map(status => status.status), ['thinking', 'ready']);

  console.log('Agent route/event/card reward cases passed');
}).catch(error => {
  console.error(error);
  process.exit(1);
});
