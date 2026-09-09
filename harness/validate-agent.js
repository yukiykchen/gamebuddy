const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createObservationStore } = require('./observation-store');
const { validateRecommendation } = require('../agent/recommendation');
const { rankRoutes, recommendRoute, scoreNode, scoreParts, buildScoreContext, ensureMapRoutes, routeChoiceCount } = require('../agent/tasks/route');
const { isRestSite, recommendRest, rankSmithCards } = require('../agent/tasks/rest');
const { findCardReward, recommendCardReward } = require('../agent/tasks/card-reward');
const { parseJsonObject, createOpenAiClient, readLlmConfig, extractResponseText } = require('../agent/llm/openai');
const { createOrchestrator, selectTask } = require('../agent/orchestrator');

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

const upgradePriorities = rankSmithCards([
  { id: 'TEST_DRAW', name: '测试过牌', type: 'Skill', cost: 1, upgraded: false, description: '抽1张牌。', upgradeDescription: '抽2张牌。' },
  { id: 'TEST_DAMAGE', name: '测试攻击', type: 'Attack', cost: 1, upgraded: false, description: '造成8点伤害。', upgradeDescription: '造成10点伤害。' }
], { hpRatio: 0.8, act: 2, threats: {} });
assert.equal(upgradePriorities[0].card.id, 'TEST_DRAW');
assert.equal(upgradePriorities[0].analysis.signals.drawOrEnergy, true);
assert.equal(upgradePriorities[0].analysis.gameVersion, 'v0.107.1');

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

const twoTreasureState = {
  run: { ...mapState.run, room: 'RestSite', currentNode: 'RestSite', currentCoord: '1,1' },
  player: mapState.player,
  combat: null,
  map: {
    visited: ['0,1', '1,1'],
    current: '1,1',
    nodes: [
      { id: '1,1', row: 1, col: 1, type: 'RestSite', children: ['2,0', '2,2'] },
      { id: '2,0', row: 2, col: 0, type: 'Treasure', children: ['3,1'] },
      { id: '2,2', row: 2, col: 2, type: 'Treasure', children: ['3,1'] },
      { id: '3,1', row: 3, col: 1, type: 'Boss', children: [] }
    ],
    routes: [
      ['1,1', '2,0', '3,1'],
      ['1,1', '2,2', '3,1']
    ]
  }
};
const treasureRoutes = rankRoutes(twoTreasureState);
assert.equal(treasureRoutes[0].displayLabel, '左侧宝箱');
assert.equal(treasureRoutes[1].displayLabel, '右侧宝箱');
assert.equal(treasureRoutes[0].score, treasureRoutes[1].score);

const fourBattleRoutes = rankRoutes({
  ...twoTreasureState,
  map: {
    visited: ['1,2'],
    current: '1,2',
    nodes: [
      { id: '1,2', row: 1, col: 2, type: 'RestSite', children: ['2,0', '2,1', '2,3', '2,4'] },
      { id: '2,0', row: 2, col: 0, type: 'Monster', children: ['3,2'] },
      { id: '2,1', row: 2, col: 1, type: 'Monster', children: ['3,2'] },
      { id: '2,3', row: 2, col: 3, type: 'Monster', children: ['3,2'] },
      { id: '2,4', row: 2, col: 4, type: 'Monster', children: ['3,2'] },
      { id: '3,2', row: 3, col: 2, type: 'Boss', children: [] }
    ],
    routes: [
      ['1,2', '2,0', '3,2'],
      ['1,2', '2,1', '3,2'],
      ['1,2', '2,3', '3,2'],
      ['1,2', '2,4', '3,2']
    ]
  }
});
assert.deepEqual(
  fourBattleRoutes.map(route => route.displayLabel),
  ['从左第1个战斗', '从左第2个战斗', '从左第3个战斗', '从左第4个战斗']
);

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

const store = createObservationStore({ staleAfterMs: 5000 });
store.ingest({ type: 'state', data: mapState }, 1723370002000);
const observation = store.getObservation(1723370002100);
assert.equal(observation.fresh, true);

const combatObservation = {
  ...observation,
  state: {
    ...mapState,
    combat: { turn: 1, hand: [], drawPile: [], discardPile: [], exhaustPile: [], enemies: [] }
  }
};
assert.equal(selectTask(combatObservation), null);

const singleChoiceState = {
  ...mapState,
  map: {
    visited: ['1,1'],
    current: '1,1',
    nodes: [
      { id: '1,1', row: 1, col: 1, type: 'RestSite', children: ['2,1'] },
      { id: '2,1', row: 2, col: 1, type: 'Monster', children: ['3,0', '3,2'] },
      { id: '3,0', row: 3, col: 0, type: 'Elite', children: ['4,1'] },
      { id: '3,2', row: 3, col: 2, type: 'RestSite', children: ['4,1'] },
      { id: '4,1', row: 4, col: 1, type: 'Boss', children: [] }
    ],
    routes: [
      ['1,1', '2,1', '3,0', '4,1'],
      ['1,1', '2,1', '3,2', '4,1']
    ]
  }
};
const singleChoiceObservation = { ...observation, state: singleChoiceState };
assert.equal(routeChoiceCount(singleChoiceState), 1);
assert.equal(selectTask(singleChoiceObservation), null);

recommendRoute(mapState, { now: 1 }).then(async rulesRec => {
  assert.equal(validateRecommendation(rulesRec).ok, true);
  assert.equal(rulesRec.source, 'rules');
  assert.equal(rulesRec.task, 'map_route');
  assert.equal(rulesRec.primary.action, 'TAKE_ROUTE');
  assert.equal(rulesRec.primary.targetId, '2,1');
  assert.match(rulesRec.reason, /精英和.*火堆|遗物|升级/);

  const llm = {
    enabled: true,
    completeRoute: async () => ({ index: 1, reason: '生命够用，去打精英换遗物。' })
  };
  const llmRec = await recommendRoute(mapState, { llm, now: 2 });
  assert.equal(llmRec.source, 'rules');
  assert.equal(llmRec.primary.label, '精英');
  assert.match(llmRec.reason, /精英/);

  const tiedTreasureRec = await recommendRoute(twoTreasureState, { now: 2 });
  assert.equal(tiedTreasureRec.tie.isTie, true);
  assert.equal(tiedTreasureRec.tie.targets.length, 2);
  assert.equal(tiedTreasureRec.primary.displayLabel, '左侧宝箱');
  assert.match(tiedTreasureRec.reason, /可以任选/);

  let capturedRoutePayload;
  await recommendRoute(twoTreasureState, {
    now: 2,
    llm: {
      enabled: true,
      completeRoute: async payload => {
        capturedRoutePayload = payload;
        return { index: 0, reason: '选择左侧宝箱。' };
      }
    }
  });
  assert.equal(capturedRoutePayload.candidates[0].targetId, '2,0');
  assert.equal(capturedRoutePayload.candidates[0].direction, '左侧');
  assert.equal(capturedRoutePayload.candidates[1].direction, '右侧');

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
  assert.equal(empty, null);
  assert.equal(published, null);
  orchestrator.clearRecommendation();
  assert.equal(orchestrator.getRecommendation(), null);
  assert.equal(published, null);

  let combatPublished;
  const combatOrchestrator = createOrchestrator({
    llm: { enabled: false },
    onRecommendation: rec => { combatPublished = rec; },
    now: () => 3
  });
  const beforeCombat = await combatOrchestrator.consider(observation);
  assert.equal(beforeCombat.task, 'map_route');
  assert.equal(combatPublished.task, 'map_route');
  const duringCombat = await combatOrchestrator.consider(combatObservation);
  assert.equal(duringCombat, null);
  assert.equal(combatPublished, null);
  assert.equal(combatOrchestrator.getRecommendation(), null);

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

  const rewardObservation = {
    schema: 'gamebuddy.observation.v1',
    fresh: true,
    state: mapState,
    recentEvents: [{
      name: 'card.reward.opened',
      data: {
        cards: [
          { id: 'ANGER', name: '愤怒' },
          { id: 'IRON_WAVE', name: '铁斩波' },
          { id: 'BARRICADE', name: '壁垒' }
        ],
        canSkip: true,
        context: { defeatedType: 'Elite' }
      }
    }]
  };
  const fakeCodex = {
    loadDraftContext: async () => ({
      source: 'spire-codex',
      deckCards: mapState.player.cards,
      relics: [],
      coach: null,
      cards: [
        { id: 'ANGER', name: '愤怒', type_key: 'Attack', rarity_key: 'Common', cost: 0, damage: 6 },
        { id: 'IRON_WAVE', name: '铁斩波', type_key: 'Attack', rarity_key: 'Common', cost: 1, damage: 5, block: 5 },
        { id: 'BARRICADE', name: '壁垒', type_key: 'Power', rarity_key: 'Rare', cost: 3, description: '格挡不再在回合开始时失去。' }
      ]
    })
  };
  assert.equal(findCardReward(rewardObservation).cards.length, 3);
  const closedRewardObservation = {
    ...rewardObservation,
    state: {
      ...mapState,
      run: { ...mapState.run, room: 'Monster' },
      cardReward: { options: rewardObservation.recentEvents[0].data.cards }
    },
    recentEvents: [
      ...rewardObservation.recentEvents,
      { name: 'card.reward.closed' }
    ]
  };
  assert.equal(findCardReward(closedRewardObservation), null);
  assert.equal(selectTask(closedRewardObservation), null);
  const rewardRec = await recommendCardReward(rewardObservation, { codex: fakeCodex, now: 14 });
  assert.equal(validateRecommendation(rewardRec).ok, true);
  assert.equal(rewardRec.task, 'card_reward');
  assert.equal(rewardRec.options.length, 3);
  assert.ok(rewardRec.options.every(card => card.fit?.boss && card.fit?.elite));

  console.log('Agent recommendation cases passed: 32');
}).catch(error => {
  console.error(error);
  process.exit(1);
});
