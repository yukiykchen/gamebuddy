const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createObservationStore } = require('./observation-store');
const { validateRecommendation } = require('../agent/recommendation');
const { rankRoutes, recommendRoute, scoreNode, scoreParts, buildScoreContext, healthBand, ensureMapRoutes, routeChoiceCount } = require('../agent/tasks/route');
const { isRestSite, recommendRest, rankSmithCards } = require('../agent/tasks/rest');
const { findCardReward, recommendCardReward, analyzeCard, cardRewardSignature } = require('../agent/tasks/card-reward');
const { findShop, shopSignature, removeTarget, buildPlans, recommendShop } = require('../agent/tasks/shop');
const { resolveItem, inferUpgraded, rankEncounterMatches } = require('../agent/knowledge/spire-codex');
const { encounterKind, encounterGuideSignature, buildEncounterGuide, mechanicStrategy } = require('../agent/tasks/encounter-guide');
const { parseJsonObject, createOpenAiClient, readLlmConfig, extractResponseText, resolveChatTemperature, parseAllowedTemperature } = require('../agent/llm/openai');
const { createOrchestrator, selectTask, restChoicePending, eventChoicePending } = require('../agent/orchestrator');
const { recommendEvent, eventPromptPayload } = require('../agent/tasks/event');
const { deriveMechanicTags, generatesNamedStatus, isStatusGenerationTrigger, inferOrbGeneration } = require('../agent/knowledge/mechanic-tags');
const { matchEventKnowledge, parseOptionEffects, analyzeEventChoices } = require('../agent/knowledge/event-rules');

const lifecycle = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'lifecycle.json'), 'utf8'));
const mapState = lifecycle[2];

const shopOverElite = rankRoutes(mapState);
assert.equal(shopOverElite[0].targetType, 'Shop');
assert.equal(shopOverElite[0].eliteCount, 0);
assert.equal(shopOverElite[1].eliteCount, 1);

const shopCtx = buildScoreContext(mapState);
assert.ok(scoreParts('Shop', shopCtx).payoff > scoreParts('Elite', shopCtx).payoff);
assert.ok(scoreParts('Shop', shopCtx).payoff >= 10);

const lowHpState = {
  ...mapState,
  player: { ...mapState.player, hp: 20, maxHp: 80, gold: 109 }
};
const lowHp = rankRoutes(lowHpState);
assert.equal(lowHp[0].targetType, 'Shop');
assert.ok(scoreNode('Elite', buildScoreContext(lowHpState)) < 0);
assert.equal(healthBand({ hpRatio: 0.65 }), 'healthy');
assert.equal(healthBand({ hpRatio: 0.5 }), 'caution');
assert.equal(healthBand({ hpRatio: 0.35 }), 'danger');

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
assert.equal(scoreParts('RestSite', buildScoreContext({ player: { ...mapState.player, hp: 40, maxHp: 80 } })).payoff, 14);

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

const sharedEntranceState = {
  ...twoTreasureState,
  map: {
    visited: ['1,1'],
    current: '1,1',
    boss: '4,1',
    nodes: [
      { id: '1,1', row: 1, col: 1, type: 'RestSite', children: ['2,0', '2,2'] },
      { id: '2,0', row: 2, col: 0, type: 'Treasure', children: ['3,0', '3,1'] },
      { id: '2,2', row: 2, col: 2, type: 'Shop', children: ['3,2'] },
      { id: '3,0', row: 3, col: 0, type: 'Unknown', children: ['4,1'] },
      { id: '3,1', row: 3, col: 1, type: 'RestSite', children: ['4,1'] },
      { id: '3,2', row: 3, col: 2, type: 'Monster', children: ['4,1'] },
      { id: '4,1', row: 4, col: 1, type: 'Boss', children: [] }
    ],
    routes: [
      ['1,1', '2,0', '3,0', '4,1'],
      ['1,1', '2,0', '3,1', '4,1'],
      ['1,1', '2,2', '3,2', '4,1']
    ]
  }
};
assert.equal(rankRoutes(sharedEntranceState).length, 2);
assert.equal(rankRoutes(sharedEntranceState).find(item => item.targetId === '2,0').route[2], '3,1');

const truncatedChoices = ensureMapRoutes({
  ...sharedEntranceState.map,
  routes: [['1,1', '2,0', '3,1', '4,1']],
  routesTruncated: true
});
assert.equal(routeChoiceCount({ map: truncatedChoices }), 2);
assert.equal(truncatedChoices.routes.length, 2);

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
assert.equal(merged.thinking, '');
const k26 = readLlmConfig({
  GAMEBUDDY_LLM_API_KEY: 'sk-test-kimi',
  GAMEBUDDY_LLM_BASE_URL: 'https://api.moonshot.cn/v1',
  GAMEBUDDY_LLM_MODEL: 'kimi-k2.6',
  GAMEBUDDY_LLM_WIRE_API: 'chat',
  GAMEBUDDY_LLM_THINKING: 'disabled'
});
assert.equal(k26.model, 'kimi-k2.6');
assert.equal(k26.thinking, 'disabled');
assert.equal(k26.temperature, undefined);
assert.equal(resolveChatTemperature(k26), 0.6);
assert.equal(resolveChatTemperature({ model: 'demo' }), undefined);
assert.equal(parseAllowedTemperature('invalid temperature: only 0.6 is allowed for this model'), 0.6);
const withTemp = readLlmConfig({
  GAMEBUDDY_LLM_API_KEY: 'sk-test',
  GAMEBUDDY_LLM_MODEL: 'demo',
  GAMEBUDDY_LLM_TEMPERATURE: '0.2'
});
assert.equal(withTemp.temperature, 0.2);
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
  assert.equal(rulesRec.primary.targetId, '2,0');
  assert.equal(rulesRec.routeProfiles.active, 'growth');
  assert.equal(rulesRec.routeProfiles.healthBand, 'healthy');
  assert.ok(rulesRec.routeProfiles.balanced);
  assert.match(rulesRec.reason, /商店|购物/);

  const llm = {
    enabled: true,
    completeRoute: async () => ({ index: 1, reason: '生命够用，去打精英换遗物。' })
  };
  const llmRec = await recommendRoute(mapState, { llm, now: 2 });
  assert.equal(llmRec.source, 'llm');
  assert.equal(llmRec.primary.label, '精英');
  assert.match(llmRec.reason, /精英/);

  const unsafePick = await recommendRoute(lowHpState, { llm, now: 2 });
  assert.equal(unsafePick.primary.targetId, '2,0');
  assert.equal(unsafePick.routeProfiles.active, 'safe');

  let sharedPayload;
  await recommendRoute(sharedEntranceState, {
    now: 2,
    llm: { enabled: true, completeRoute: async payload => {
      sharedPayload = payload;
      return { index: 0, reason: '比较两个不同入口。' };
    } }
  });
  assert.deepEqual(new Set(sharedPayload.candidates.map(item => item.targetId)), new Set(['2,0', '2,2']));
  assert.equal(sharedPayload.candidates.length, 2);

  const tiedTreasureRec = await recommendRoute(twoTreasureState, { now: 2 });
  assert.equal(tiedTreasureRec.tie, null);
  assert.equal(tiedTreasureRec.uncertainty.isClose, true);
  assert.equal(tiedTreasureRec.uncertainty.targets.length, 2);
  assert.equal(tiedTreasureRec.primary.displayLabel, '左侧宝箱');
  assert.match(tiedTreasureRec.reason, /暂时优先左侧宝箱/);
  assert.doesNotMatch(tiedTreasureRec.reason, /任选/);

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
      const body = JSON.parse(options.body);
      assert.equal(body.temperature, undefined);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"index":1,"reason":"打精英"}' } }] })
      };
    }
  });
  const llmPick = await client.completeRoute({ candidates: [{ index: 0 }, { index: 1 }], state: mapState });
  assert.equal(llmPick.index, 1);
  assert.equal(llmPick.reason, '打精英');

  const llmLogs = [];
  const loggingClient = createOpenAiClient({
    enabled: true,
    apiKey: 'test-key-secret',
    baseURL: 'https://example.test/v1',
    model: 'demo',
    wireApi: 'chat'
  }, {
    onLog: entry => llmLogs.push(entry),
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"index":1,"reason":"打精英"}' } }] })
    })
  });
  await loggingClient.completeRoute({ candidates: [{ index: 0, label: '商店' }, { index: 1, label: '精英' }] });
  const phases = llmLogs.map(entry => entry.phase);
  assert.deepEqual(phases.slice(0, 4), ['start', 'system', 'input', 'output']);
  assert.equal(phases.includes('parsed'), true);
  assert.match(llmLogs.find(entry => entry.phase === 'system').text, /路线顾问/);
  assert.match(llmLogs.find(entry => entry.phase === 'input').text, /"label": "商店"/);
  assert.match(llmLogs.find(entry => entry.phase === 'output').text, /打精英/);
  assert.equal(llmLogs.some(entry => `${entry.label}\n${entry.text}`.includes('test-key-secret')), false);

  let capturedChatBody;
  const thinkingOffClient = createOpenAiClient({
    enabled: true,
    apiKey: 'test-key',
    baseURL: 'https://api.moonshot.cn/v1',
    model: 'kimi-k2.6',
    wireApi: 'chat',
    thinking: 'disabled'
  }, {
    fetchImpl: async (_url, options) => {
      capturedChatBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"index":0,"reason":"这张"}' } }] })
      };
    }
  });
  const thinkingOffPick = await thinkingOffClient.completeCardReward({ candidates: [{ index: 0 }] });
  assert.equal(capturedChatBody.model, 'kimi-k2.6');
  assert.equal(capturedChatBody.temperature, 0.6);
  assert.equal(capturedChatBody.thinking.type, 'disabled');
  assert.equal(thinkingOffPick.index, 0);
  assert.match(capturedChatBody.messages[0].content, /升级后效果/);
  assert.match(capturedChatBody.messages[0].content, /不得单独作为 SKIP/);
  assert.match(capturedChatBody.messages[0].content, /随机生成一个充能球/);
  assert.match(capturedChatBody.messages[0].content, /任意种类/);

  let temperatureCalls = 0;
  const retryClient = createOpenAiClient({
    enabled: true,
    apiKey: 'test-key',
    baseURL: 'https://example.test/v1',
    model: 'demo',
    wireApi: 'chat',
    temperature: 1
  }, {
    fetchImpl: async (_url, options) => {
      temperatureCalls += 1;
      const body = JSON.parse(options.body);
      if (body.temperature === 1) {
        return {
          ok: false,
          status: 400,
          text: async () => '{"error":{"message":"invalid temperature: only 0.6 is allowed for this model","type":"invalid_request_error"}}',
          json: async () => ({})
        };
      }
      assert.equal(body.temperature, 0.6);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"index":2,"reason":"跳过"}' } }] })
      };
    }
  });
  const retried = await retryClient.completeCardReward({ candidates: [{ index: 0 }, { index: 1 }, { index: 2 }] });
  assert.equal(temperatureCalls, 2);
  assert.equal(retried.index, 2);

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
  assert.equal(first.primary.targetId, '2,0');
  assert.equal(published.primary.targetId, '2,0');
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

  const restForkObservation = {
    schema: 'gamebuddy.observation.v1',
    fresh: true,
    state: {
      ...twoTreasureState,
      player: { ...twoTreasureState.player, hp: 40, maxHp: 80 }
    },
    recentEvents: [{ name: 'rest.opened' }]
  };
  assert.equal(restChoicePending(restForkObservation), true);
  assert.equal(selectTask(restForkObservation), 'rest_site');

  const restHealedObservation = {
    schema: 'gamebuddy.observation.v1',
    fresh: true,
    state: {
      ...twoTreasureState,
      player: { ...twoTreasureState.player, hp: 68, maxHp: 80 }
    },
    recentEvents: [
      { name: 'rest.opened' },
      { name: 'rest.closed', data: { action: 'HEAL', hpBefore: 40, hpAfter: 68 } }
    ]
  };
  assert.equal(restChoicePending(restHealedObservation), false);
  assert.equal(selectTask(restHealedObservation), 'map_route');

  const restThenRouteOrch = createOrchestrator({ llm: { enabled: false }, now: () => 14 });
  const restThenOpened = await restThenRouteOrch.consider(restForkObservation);
  assert.equal(restThenOpened.task, 'rest_site');
  const restThenRoute = await restThenRouteOrch.consider(restHealedObservation, { force: true });
  assert.equal(restThenRoute.task, 'map_route');

  const paelEvent = {
    eventId: 'PAEL',
    pageId: null,
    title: '佩尔',
    description: '有傀儡来了？能帮我去看看父亲的状况么？我太累了……',
    kind: 'ancient',
    options: [
      { index: 0, label: '佩尔之角', description: '将2张放松加入你的牌组。' },
      { index: 1, label: '佩尔之牙', description: '从你的牌组中选择5张牌移除。在每场战斗结束时，将其中随机1牌升级然后返还。' },
      { index: 2, label: '佩尔之眼', description: '你在每场战斗中第一次没有打出任何牌就结束回合时，消耗所有手牌然后进行一个额外回合。' }
    ]
  };
  const paelObservation = {
    schema: 'gamebuddy.observation.v1',
    fresh: true,
    state: {
      ...twoTreasureState,
      run: { ...twoTreasureState.run, room: 'Event', currentNode: 'Ancient' },
      event: paelEvent
    },
    recentEvents: [{ name: 'map.opened' }, { name: 'event.opened' }]
  };
  assert.equal(selectTask(paelObservation), 'event_choice');

  const ancientDialogue = {
    ...paelObservation,
    state: {
      ...paelObservation.state,
      event: { title: '佩尔', description: paelEvent.description, kind: 'ancient', options: [] }
    },
    recentEvents: [{ name: 'map.opened' }]
  };
  assert.equal(eventChoicePending(ancientDialogue), true);
  assert.equal(selectTask(ancientDialogue), null);

  const ancientWithoutEvent = {
    schema: 'gamebuddy.observation.v1',
    fresh: true,
    state: {
      ...twoTreasureState,
      run: { ...twoTreasureState.run, room: 'Event', currentNode: 'Ancient' }
    },
    recentEvents: [{ name: 'map.opened' }]
  };
  assert.equal(selectTask(ancientWithoutEvent), null);

  const afterAncientClosed = {
    schema: 'gamebuddy.observation.v1',
    fresh: true,
    state: {
      ...twoTreasureState,
      run: { ...twoTreasureState.run, room: 'Event', currentNode: 'Ancient' }
    },
    recentEvents: [{ name: 'map.opened' }, { name: 'event.opened' }, { name: 'event.closed' }]
  };
  assert.equal(selectTask(afterAncientClosed), 'map_route');

  const eventPayload = eventPromptPayload(paelObservation.state);
  assert.equal(eventPayload.kind, 'ancient');
  assert.equal(eventPayload.energyPerTurn, paelObservation.state.player.maxEnergy);
  assert.equal(eventPayload.options.length, 3);
  assert.equal(eventPayload.eventKnowledge.eventId, 'PAEL');
  assert.ok(eventPayload.allowedIndexes.includes(1));

  const llmEventRec = await recommendEvent(paelObservation.state, {
    now: 20,
    llm: {
      enabled: true,
      completeEvent: async payload => {
        assert.equal(payload.kind, 'ancient');
        assert.ok(Array.isArray(payload.deck));
        assert.ok(Array.isArray(payload.relics));
        assert.ok(Array.isArray(payload.potions));
        assert.ok(payload.options.every(option => option.analysis));
        return { index: 1, reason: '删牌并升级更适合当前牌组。' };
      }
    }
  });
  assert.equal(validateRecommendation(llmEventRec).ok, true);
  assert.equal(llmEventRec.source, 'llm');
  assert.equal(llmEventRec.primary.label, '佩尔之牙');
  assert.match(llmEventRec.reason, /删牌/);

  const rulesEventRec = await recommendEvent(paelObservation.state, { now: 21 });
  assert.equal(rulesEventRec.source, 'rules');
  assert.equal(rulesEventRec.primary.label, '佩尔之牙');
  assert.ok(rulesEventRec.primary.analysis.pros.some(item => /移除 5 张牌/.test(item)));
  assert.equal(rulesEventRec.eventKnowledge.gameVersion, 'v0.107.1');

  const bathsState = {
    ...paelObservation.state,
    player: { ...paelObservation.state.player, hp: 3, maxHp: 80, gold: 40 },
    event: {
      eventId: 'ABYSSAL_BATHS',
      pageId: 'INITIAL',
      title: '深渊浴场',
      description: '池水正在等待。',
      kind: 'event',
      options: [
        { index: 0, optionId: 'IMMERSE', label: '投身其中', description: '获得2点最大生命值。受到3点伤害。', locked: false },
        { index: 1, optionId: 'ABSTAIN', label: '敬而远之', description: '回复10点生命。', locked: false }
      ]
    }
  };
  const bathsAnalysis = analyzeEventChoices(bathsState);
  assert.equal(bathsAnalysis.eventKnowledge.match, 'event-id');
  assert.equal(bathsAnalysis.eventKnowledge.pageId, 'INITIAL');
  assert.equal(bathsAnalysis.options[0].analysis.fatal, true);
  assert.equal(bathsAnalysis.options[0].analysis.eligible, false);
  assert.ok(bathsAnalysis.options[1].analysis.pros.some(item => /回复 10 生命/.test(item)));
  const rejectedUnsafeLlm = await recommendEvent(bathsState, {
    now: 22,
    llm: { enabled: true, completeEvent: async () => ({ index: 0, reason: '错误选择致命选项' }) }
  });
  assert.equal(rejectedUnsafeLlm.source, 'rules');
  assert.equal(rejectedUnsafeLlm.primary.optionIndex, 1);

  const flowerKnowledge = matchEventKnowledge({
    eventId: 'COLOSSAL_FLOWER',
    pageId: 'REACH_DEEPER_2',
    title: '巨大花卉',
    description: '继续深入。',
    options: [
      { index: 0, optionId: 'EXTRACT_INSTEAD', label: '采集花蜜', description: '获得135金币。' },
      { index: 1, optionId: 'POLLINOUS_CORE', label: '抵达核心', description: '失去7点生命值。获得花粉核心。' }
    ]
  });
  assert.equal(flowerKnowledge.page.id, 'REACH_DEEPER_2');
  assert.equal(flowerKnowledge.completeness, 'complete');

  const effects = parseOptionEffects('获得303-363金币。失去7点生命。得到贪婪。');
  assert.ok(effects.some(effect => effect.type === 'gold_gain' && effect.max === 363));
  assert.ok(effects.some(effect => effect.type === 'hp_loss' && effect.min === 7));
  assert.ok(parseOptionEffects('获得石之剑。').some(effect => effect.type === 'gain_relic'));

  const unknownEventState = {
    ...paelObservation.state,
    event: {
      title: '未收录事件', description: '无法理解的装置。', kind: 'event',
      options: [
        { index: 0, label: '左边', description: '未知结果。', locked: false },
        { index: 1, label: '右边', description: '未知结果。', locked: false }
      ]
    }
  };
  assert.equal(await recommendEvent(unknownEventState, { now: 23 }), null);
  const unknownStatuses = [];
  const unknownOrchestrator = createOrchestrator({
    llm: { enabled: false },
    now: () => 24,
    onAgentStatus: status => unknownStatuses.push(status)
  });
  const unknownObservation = {
    schema: 'gamebuddy.observation.v1', fresh: true, state: unknownEventState,
    recentEvents: [{ name: 'event.opened' }]
  };
  assert.equal(await unknownOrchestrator.consider(unknownObservation), null);
  assert.equal(unknownStatuses.at(-1).reason, 'event-rules-incomplete');
  const statusCount = unknownStatuses.length;
  assert.equal(await unknownOrchestrator.consider(unknownObservation), null);
  assert.equal(unknownStatuses.length, statusCount);

  const unaffordableState = {
    ...paelObservation.state,
    player: { ...paelObservation.state.player, gold: 40 },
    event: {
      eventId: 'ZEN_WEAVER', pageId: 'INITIAL', title: '修禅织网者', description: '', kind: 'event',
      options: [
        { index: 0, optionId: 'BREATHING_TECHNIQUES', label: '呼吸技法', description: '支付50金币。将2张开悟加入到你的牌组。', locked: false },
        { index: 1, optionId: 'EMOTIONAL_AWARENESS', label: '情绪觉察', description: '支付125金币。从你的牌组中移除1张牌。', locked: false }
      ]
    }
  };
  const unaffordable = analyzeEventChoices(unaffordableState);
  assert.ok(unaffordable.options.every(option => option.analysis.insufficientResources));
  assert.ok(unaffordable.options.every(option => option.analysis.eligible === false));
  assert.equal(await recommendEvent(unaffordableState, { now: 25 }), null);

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

  const llmCardRec = await recommendCardReward(rewardObservation, {
    codex: fakeCodex,
    now: 15,
    llm: {
      enabled: true,
      completeCardReward: async () => ({ index: 0, reason: 'LLM确认这张' })
    }
  });
  assert.equal(llmCardRec.source, 'llm');
  assert.equal(llmCardRec.reason, 'LLM确认这张');

  let cardEnergyPrompt;
  const leftoverEnergyObservation = {
    ...rewardObservation,
    state: {
      ...rewardObservation.state,
      player: { ...rewardObservation.state.player, energy: 2, maxEnergy: 3 }
    }
  };
  await recommendCardReward(leftoverEnergyObservation, {
    codex: fakeCodex,
    now: 15,
    llm: {
      enabled: true,
      completeCardReward: async payload => {
        cardEnergyPrompt = payload;
        return { index: 0, reason: '按每回合能量判断' };
      }
    }
  });
  assert.equal(cardEnergyPrompt.player.energy, undefined);
  assert.equal(cardEnergyPrompt.player.energyPerTurn, 3);
  assert.equal(cardEnergyPrompt.player.maxEnergy, 3);

  const runtimeCardIndex = new Map([['SEVENSTARS', {
    id: 'SEVEN_STARS',
    name: '七星',
    description: '目录中的旧文本。',
    cost: 2,
    star_cost: 5,
    is_x_star_cost: false
  }]]);
  const runtimeCard = resolveItem({
    id: 'SEVEN_STARS',
    name: '七星+',
    upgraded: true,
    description: '实机升级文本：对所有敌人造成伤害。',
    descriptionSource: 'runtime',
    cost: 1,
    energyCost: 1,
    energyCostX: false,
    energyCostSource: 'runtime',
    starCost: 7,
    starCostX: false,
    starCostSource: 'runtime'
  }, runtimeCardIndex);
  assert.match(runtimeCard.description, /实机升级文本/);
  assert.equal(runtimeCard.descriptionSource, 'runtime');
  assert.equal(runtimeCard.energyCost, 1);
  assert.equal(runtimeCard.starCost, 7);
  assert.equal(runtimeCard.starCostSource, 'runtime');
  const runtimeXCard = resolveItem({
    id: 'RUNTIME_X_CARD',
    name: '实机X费牌',
    upgraded: false,
    description: '消耗所有能量并按消耗量生效。',
    descriptionSource: 'runtime',
    energyCost: null,
    energyCostX: true,
    energyCostSource: 'runtime',
    starCost: null,
    starCostX: false,
    starCostSource: 'runtime'
  }, new Map());
  const partialRuntimeCard = resolveItem({
    id: 'UNKNOWN_RUNTIME_CARD',
    name: '未知实机牌',
    upgraded: false,
    description: null,
    descriptionSource: 'unavailable',
    energyCost: 1,
    energyCostX: false,
    energyCostSource: 'runtime',
    starCost: null,
    starCostX: false,
    starCostSource: 'unavailable'
  }, new Map());

  let completeCardPrompt;
  const runtimeCodex = {
    loadDraftContext: async () => ({
      source: 'spire-codex',
      deckCards: [runtimeCard],
      relics: [],
      potions: [],
      coach: null,
      threats: { knownBoss: null, possibleBosses: [], possibleElites: [], knownUpcomingElites: [], defeatedEncounters: [] },
      cards: [runtimeCard, runtimeXCard, partialRuntimeCard]
    })
  };
  await recommendCardReward(rewardObservation, {
    codex: runtimeCodex,
    now: 15,
    llm: {
      enabled: true,
      completeCardReward: async payload => {
        completeCardPrompt = payload;
        return { index: payload.candidates.findIndex(item => item.id === 'SEVEN_STARS'), reason: '按实机完整效果判断' };
      }
    }
  });
  const runtimeCandidate = completeCardPrompt.candidates.find(item => item.id === 'SEVEN_STARS');
  const xCandidate = completeCardPrompt.candidates.find(item => item.id === 'RUNTIME_X_CARD');
  const partialCandidate = completeCardPrompt.candidates.find(item => item.id === 'UNKNOWN_RUNTIME_CARD');
  assert.equal(runtimeCandidate.upgraded, true);
  assert.match(runtimeCandidate.description, /实机升级文本/);
  assert.equal(runtimeCandidate.descriptionSource, 'runtime');
  assert.deepEqual(runtimeCandidate.costs, {
    energy: 1,
    energyX: false,
    stars: 7,
    starsX: false,
    source: { energy: 'runtime', stars: 'runtime' }
  });
  assert.equal(runtimeCandidate.contextCompleteness, 'complete');
  assert.equal(xCandidate.costs.energy, null);
  assert.equal(xCandidate.costs.energyX, true);
  assert.equal(partialCandidate.description, null);
  assert.equal(partialCandidate.descriptionSource, 'unavailable');
  assert.equal(partialCandidate.contextCompleteness, 'partial');
  assert.equal(completeCardPrompt.deck[0].contextCompleteness, 'complete');

  const momentumCatalog = {
    id: 'MOMENTUM_STRIKE',
    name: '趁势打击',
    cost: 1,
    type: '攻击',
    description: '造成10点伤害。这张牌的耗能降为0。',
    upgradeDescription: '造成13点伤害。这张牌的耗能降为0。'
  };
  const momentumIndex = new Map([['MOMENTUMSTRIKE', momentumCatalog]]);
  const momentumMerged = resolveItem({
    id: 'MOMENTUM_STRIKE',
    name: '趁势打击+',
    cost: 1,
    upgraded: true,
    type: 'Attack'
  }, momentumIndex);
  assert.equal(inferUpgraded({ name: '趁势打击+' }), true);
  assert.equal(momentumMerged.upgraded, true);
  assert.equal(momentumMerged.name, '趁势打击+');
  assert.equal(momentumMerged.cost, 1);
  assert.equal(momentumMerged.descriptionSource, 'catalog');
  assert.match(momentumMerged.upgradeDescription, /13点伤害/);
  const momentumAnalysis = analyzeCard({
    ...momentumMerged,
    evaluation: {
      prior: { score: 30, tier: 'F' },
      advice: {
        rank: 'F',
        expertSummary: '同版本社区数据给出的基础档位为 F。主要价值是10 点总伤害。',
        badWhen: ['它不能改善当前牌组缺口，拿取只会降低核心牌抽取频率时']
      }
    }
  }, mapState, {
    size: 12,
    attacks: 6,
    skills: 5,
    powers: 1,
    draw: 1,
    blockCards: 3,
    counts: new Map(),
    tagCounts: new Map(),
    act: 1
  }, { eliteSoon: false, bossSoon: false }, undefined, new Set());
  assert.equal(momentumAnalysis.upgraded, true);
  assert.match(momentumAnalysis.description, /13点伤害/);
  assert.ok(!/10点/.test(momentumAnalysis.description));
  assert.ok(!momentumAnalysis.cons.some(item => /基础数据表现偏低/.test(item)));
  assert.match(momentumAnalysis.knowledgeEvaluation.note, /未升级/);

  const upgradeFlickerBase = {
    schema: 'gamebuddy.observation.v1',
    fresh: true,
    state: mapState,
    recentEvents: [{
      name: 'card.reward.opened',
      data: {
        cards: [
          { id: 'MOMENTUM_STRIKE', name: '趁势打击', upgraded: false },
          { id: 'GUNK_UP', name: '污秽攻击', upgraded: false },
          { id: 'UPROAR', name: '骚动', upgraded: false }
        ],
        canSkip: true
      }
    }]
  };
  const upgradeFlickerLater = {
    ...upgradeFlickerBase,
    recentEvents: [{
      name: 'card.reward.opened',
      data: {
        cards: [
          { id: 'MOMENTUM_STRIKE', name: '趁势打击+', upgraded: true },
          { id: 'GUNK_UP', name: '污秽攻击', upgraded: false },
          { id: 'UPROAR', name: '骚动', upgraded: false }
        ],
        canSkip: true
      }
    }]
  };
  assert.equal(cardRewardSignature(upgradeFlickerBase), cardRewardSignature(upgradeFlickerLater));

  let upgradedCardPayload;
  const upgradedRewardObservation = {
    ...upgradeFlickerLater,
    recentEvents: [{
      name: 'card.reward.opened',
      data: {
        cards: [
          { id: 'MOMENTUM_STRIKE', name: '趁势打击+', cost: 1, upgraded: true },
          { id: 'GUNK_UP', name: '污秽攻击', cost: 1, upgraded: false },
          { id: 'UPROAR', name: '骚动', cost: 2, upgraded: false }
        ],
        canSkip: true
      }
    }]
  };
  await recommendCardReward(upgradedRewardObservation, {
    now: 52,
    llm: {
      enabled: true,
      completeCardReward: async payload => {
        upgradedCardPayload = payload;
        return { index: 0, reason: '升级后是13点伤害' };
      }
    },
    codex: {
      loadDraftContext: async (_state, reward) => ({
        source: 'test',
        deckCards: mapState.player.cards,
        relics: [],
        coach: null,
        cards: (reward.cards || []).map(card => {
          if (card.id === 'MOMENTUM_STRIKE') {
            return {
              ...resolveItem(card, momentumIndex),
              evaluation: {
                prior: { score: 30, tier: 'F' },
                advice: {
                  rank: 'F',
                  expertSummary: '同版本社区数据给出的基础档位为 F。主要价值是10 点总伤害。',
                  badWhen: ['它不能改善当前牌组缺口，拿取只会降低核心牌抽取频率时']
                }
              }
            };
          }
          return {
            ...card,
            type_key: 'Attack',
            description: card.id === 'GUNK_UP' ? '造成4点伤害3次。' : '造成6点伤害两次。',
            evaluation: { prior: { score: 45, tier: 'D' } }
          };
        }),
        threats: {}
      })
    }
  });
  const momentumCandidate = upgradedCardPayload.candidates.find(item => item.id === 'MOMENTUM_STRIKE');
  assert.equal(momentumCandidate.upgraded, true);
  assert.equal(momentumCandidate.cost, 1);
  assert.match(momentumCandidate.description, /13点伤害/);
  assert.match(momentumCandidate.knowledgeEvaluation.note, /未升级/);

  let restEnergyPrompt;
  await recommendRest({
    ...restState(76),
    player: { ...mapState.player, hp: 76, maxHp: 80, energy: 1, maxEnergy: 3 }
  }, {
    now: 12,
    llm: {
      enabled: true,
      completeRest: async payload => {
        restEnergyPrompt = payload;
        return { index: 1, reason: '升级' };
      }
    }
  });
  assert.equal(restEnergyPrompt.energy, undefined);
  assert.equal(restEnergyPrompt.energyPerTurn, 3);
  assert.equal(restEnergyPrompt.maxEnergy, 3);

  assert.equal(generatesNamedStatus('抽3张牌。将一张灼伤加入你的弃牌堆。'), true);
  assert.equal(generatesNamedStatus('获得13点格挡。将2张伤口加入你的弃牌堆。'), true);
  assert.equal(generatesNamedStatus('每当你生成状态牌的时候，随机生成一个充能球。'), false);
  assert.equal(isStatusGenerationTrigger('每当你生成状态牌的时候，随机生成一个充能球。'), true);
  assert.ok(deriveMechanicTags({ description: '抽3张牌。将一张灼伤加入你的弃牌堆。' }).includes('status_generate'));
  assert.ok(!deriveMechanicTags({ description: '每当你生成状态牌的时候，随机生成一个充能球。' }).includes('status_generate'));
  assert.equal(inferOrbGeneration('每当你生成状态牌的时候，随机生成一个充能球。'), 'random');
  assert.equal(inferOrbGeneration('生成1个闪电充能球。'), 'lightning');
  assert.equal(inferOrbGeneration('在每场战斗开始时，生成1个闪电充能球。'), 'lightning');
  assert.equal(inferOrbGeneration('生成1个闪电充能球。生成1个冰霜充能球。生成1个黑暗充能球。'), 'lightning,frost,dark');

  const statusDeck = [
    { id: 'OVERCLOCK', name: '超频', type: '技能', cost: 0, description: '抽3张牌。将一张灼伤加入你的弃牌堆。' },
    { id: 'FIGHT_THROUGH', name: '强撑', type: '技能', cost: 1, description: '获得13点格挡。将2张伤口加入你的弃牌堆。' },
    { id: 'ITERATION', name: '迭代', type: '能力', cost: 1, description: '每回合你第一次抽到状态牌时，抽2张牌。' },
    { id: 'ZAP', name: '电击', type: '技能', cost: 1, description: '生成1个闪电充能球。' },
    { id: 'DUALCAST', name: '双重释放', type: '技能', cost: 1, description: '激发你最右侧的充能球两次。' }
  ];
  const trashCard = {
    id: 'TRASH_TO_TREASURE',
    name: '化废为宝',
    type_key: 'Power',
    rarity_key: 'Rare',
    cost: 1,
    description: '每当你生成状态牌的时候，随机生成一个充能球。',
    evaluation: {
      prior: { score: 82, tier: 'A' },
      mechanicTags: ['generate', 'orb', 'conditional'],
      advice: {
        goodWhen: ['当前充能球类型和槽位支持该效果时'],
        badWhen: ['球槽、集中或目标球类型与它不匹配时']
      }
    }
  };
  const statusRewardObservation = {
    schema: 'gamebuddy.observation.v1',
    fresh: true,
    state: {
      ...mapState,
      combat: null,
      player: { ...mapState.player, hp: 21, maxHp: 75, cards: statusDeck }
    },
    recentEvents: [{
      name: 'card.reward.opened',
      data: {
        cards: [
          trashCard,
          { id: 'MACHINE_LEARNING', name: '机器学习', description: '在你的回合开始时，额外抽1张牌。' },
          { id: 'SPINNER', name: '旋转工艺', description: '在你的回合开始时，生成1个玻璃充能球。' }
        ],
        canSkip: true
      }
    }]
  };
  const statusCodex = {
    loadDraftContext: async (state, reward) => ({
      source: 'test',
      deckCards: statusDeck,
      relics: [],
      coach: null,
      cards: (reward.cards || []).map(card => (card.id === 'TRASH_TO_TREASURE' ? trashCard : {
        ...card,
        type_key: 'Power',
        rarity_key: card.id === 'SPINNER' ? 'Common' : 'Rare',
        evaluation: { prior: { score: 70, tier: 'B' }, mechanicTags: card.id === 'SPINNER' ? ['orb'] : ['draw'] }
      })),
      threats: {}
    })
  };
  const statusRec = await recommendCardReward(statusRewardObservation, { llm: { enabled: false }, now: 40, codex: statusCodex });
  assert.equal(validateRecommendation(statusRec).ok, true);
  assert.equal(statusRec.primary.action, 'TAKE_CARD');
  assert.equal(statusRec.primary.cardId, 'TRASH_TO_TREASURE');
  assert.match(statusRec.reason, /状态牌|伤口|灼伤|超频|强撑/);
  const trashAnalysis = statusRec.primary.analysis || statusRec.options.find(card => card.id === 'TRASH_TO_TREASURE');
  assert.ok(trashAnalysis.pros.some(item => /状态牌/.test(item)));
  assert.ok(!trashAnalysis.pros.some(item => /「orb」/.test(item)));
  assert.ok((trashAnalysis.knowledgeEvaluation?.goodWhen || []).some(item => /状态牌/.test(item)));
  assert.ok(!(trashAnalysis.knowledgeEvaluation?.goodWhen || []).some(item => /充能球类型/.test(item)));

  let statusPrompt;
  await recommendCardReward(statusRewardObservation, {
    codex: statusCodex,
    now: 41,
    llm: {
      enabled: true,
      completeCardReward: async payload => {
        statusPrompt = payload;
        return { index: 0, reason: '超频和强撑能生成状态牌，化废为宝可以兑现' };
      }
    }
  });
  assert.equal(statusPrompt.candidates[0].id, 'TRASH_TO_TREASURE');
  assert.match(statusPrompt.candidates[0].trigger, /状态牌/);
  assert.equal(statusPrompt.candidates[0].synergy.tag, 'status_generate');
  assert.equal(statusPrompt.candidates[0].synergy.count, 2);
  assert.equal(statusPrompt.candidates[0].orbGeneration, 'random');
  assert.ok(!(statusPrompt.candidates[0].knowledgeEvaluation?.badWhen || []).some(item => /目标球/.test(item)));

  const mixedOrbDeck = [
    ...statusDeck,
    trashCard,
    { id: 'ZAP', name: '电击+', type: '技能', cost: 0, description: '生成1个闪电充能球。' }
  ];
  const coolantCard = {
    id: 'COOLANT',
    name: '冷却剂',
    type_key: 'Power',
    rarity_key: 'Rare',
    cost: 1,
    description: '在你的回合开始时，你每有一种不同的充能球，就获得2点格挡。',
    evaluation: { prior: { score: 71, tier: 'B' }, mechanicTags: ['orb'] }
  };
  let orbKindPrompt;
  await recommendCardReward({
    schema: 'gamebuddy.observation.v1',
    fresh: true,
    state: {
      ...mapState,
      combat: null,
      player: { ...mapState.player, cards: mixedOrbDeck }
    },
    recentEvents: [{
      name: 'card.reward.opened',
      data: {
        cards: [
          coolantCard,
          { id: 'ITERATION', name: '迭代+', cost: 1, upgraded: true, description: '每回合你第一次抽到状态牌时，抽3张牌。' }
        ],
        canSkip: true
      }
    }]
  }, {
    now: 53,
    llm: {
      enabled: true,
      completeCardReward: async payload => {
        orbKindPrompt = payload;
        return { index: 1, reason: '迭代更贴状态循环' };
      }
    },
    codex: {
      loadDraftContext: async (state, reward) => ({
        source: 'test',
        deckCards: mixedOrbDeck,
        relics: [{ id: 'CRACKED_CORE', name: '破损核心', description: '在每场战斗开始时，生成1个闪电充能球。' }],
        coach: null,
        cards: (reward.cards || []).map(card => (card.id === 'COOLANT' ? coolantCard : {
          ...card,
          type_key: 'Power',
          evaluation: { prior: { score: 70, tier: 'B' }, mechanicTags: ['draw'] }
        })),
        threats: {}
      })
    }
  });
  const trashInDeck = orbKindPrompt.deck.find(card => card.id === 'TRASH_TO_TREASURE');
  const zapInDeck = orbKindPrompt.deck.find(card => card.id === 'ZAP');
  const crackedCore = orbKindPrompt.relics.find(relic => relic.id === 'CRACKED_CORE');
  assert.equal(trashInDeck.orbGeneration, 'random');
  assert.equal(zapInDeck.orbGeneration, 'lightning');
  assert.equal(crackedCore.orbGeneration, 'lightning');

  const failedLlmCard = await recommendCardReward(rewardObservation, {
    codex: fakeCodex,
    now: 16,
    llm: {
      enabled: true,
      completeCardReward: async () => {
        throw new Error('llm down');
      }
    }
  });
  assert.equal(failedLlmCard, null);

  let routeCalls = 0;
  let releaseRoute;
  const holdRoute = new Promise(resolve => { releaseRoute = resolve; });
  const overlapping = createOrchestrator({
    llm: {
      enabled: true,
      completeRoute: async () => {
        routeCalls += 1;
        await holdRoute;
        return { index: 0, reason: '走这条' };
      }
    },
    now: () => 30
  });
  const firstPending = overlapping.consider(observation);
  const secondPending = overlapping.consider(observation, { force: true });
  const thirdPending = overlapping.consider(observation);
  releaseRoute();
  const [firstOverlap, secondOverlap, thirdOverlap] = await Promise.all([firstPending, secondPending, thirdPending]);
  assert.equal(routeCalls, 1);
  assert.equal(firstOverlap.task, 'map_route');
  assert.equal(secondOverlap, firstOverlap);
  assert.equal(thirdOverlap, firstOverlap);

  let cardCalls = 0;
  let releaseCard;
  const holdCard = new Promise(resolve => { releaseCard = resolve; });
  let publishedCard;
  const overlappingCards = createOrchestrator({
    llm: {
      enabled: true,
      completeCardReward: async () => {
        cardCalls += 1;
        await holdCard;
        return { index: 0, reason: 'LLM确认这张' };
      }
    },
    onRecommendation: rec => { publishedCard = rec; },
    now: () => 40
  });
  const noisyReward = {
    ...rewardObservation,
    state: {
      ...rewardObservation.state,
      player: { ...rewardObservation.state.player, gold: 99 }
    }
  };
  const cardFirst = overlappingCards.consider(rewardObservation);
  const cardSecond = overlappingCards.consider(noisyReward, { force: true });
  releaseCard();
  const [firstCardOverlap, secondCardOverlap] = await Promise.all([cardFirst, cardSecond]);
  assert.equal(cardCalls, 1);
  assert.equal(firstCardOverlap.task, 'card_reward');
  assert.equal(firstCardOverlap.source, 'llm');
  assert.equal(secondCardOverlap, firstCardOverlap);
  assert.equal(publishedCard.source, 'llm');

  let failNextCard = false;
  let publishedKeep;
  const keepCard = createOrchestrator({
    llm: {
      enabled: true,
      completeCardReward: async () => {
        if (failNextCard) throw new Error('timeout');
        return { index: 0, reason: '先给这张' };
      }
    },
    onRecommendation: rec => { publishedKeep = rec; },
    now: () => 41
  });
  const keptCard = await keepCard.consider(rewardObservation);
  assert.equal(keptCard.source, 'llm');
  failNextCard = true;
  const afterFail = await keepCard.consider(rewardObservation, { force: true });
  assert.equal(afterFail.source, 'llm');
  assert.equal(afterFail.reason, '先给这张');
  assert.equal(publishedKeep.source, 'llm');
  assert.equal(publishedKeep.reason, '先给这张');

  let lockedCalls = 0;
  const publishedLocked = [];
  const lockedCards = createOrchestrator({
    llm: {
      enabled: true,
      completeCardReward: async () => {
        lockedCalls += 1;
        return { index: lockedCalls === 1 ? 0 : 1, reason: `pick-${lockedCalls}` };
      }
    },
    onRecommendation: rec => { if (rec) publishedLocked.push(rec); },
    now: () => 42
  });
  const firstLocked = await lockedCards.consider(rewardObservation);
  const autoForceLocked = await lockedCards.consider(rewardObservation, { force: true });
  const openedAgain = await lockedCards.consider(noisyReward, { force: true });
  assert.equal(lockedCalls, 1);
  assert.equal(publishedLocked.length, 1);
  assert.equal(firstLocked.reason, 'pick-1');
  assert.equal(autoForceLocked, firstLocked);
  assert.equal(openedAgain, firstLocked);
  assert.equal(publishedLocked[0].reason, 'pick-1');
  assert.equal(lockedCards.hasPublishedFor(rewardObservation), true);

  const refreshed = await lockedCards.consider(rewardObservation, { force: true, reason: 'refresh' });
  assert.equal(lockedCalls, 2);
  assert.equal(publishedLocked.length, 2);
  assert.equal(refreshed.reason, 'pick-2');
  assert.equal(publishedLocked[1].reason, 'pick-2');
  const afterRefreshForce = await lockedCards.consider(rewardObservation, { force: true });
  assert.equal(lockedCalls, 2);
  assert.equal(publishedLocked.length, 2);
  assert.equal(afterRefreshForce, refreshed);

  let flickerCalls = 0;
  const publishedFlicker = [];
  const flickerCards = createOrchestrator({
    llm: {
      enabled: true,
      completeCardReward: async () => {
        flickerCalls += 1;
        return { index: flickerCalls === 1 ? 0 : 1, reason: `flicker-${flickerCalls}` };
      }
    },
    onRecommendation: rec => { if (rec) publishedFlicker.push(rec); },
    now: () => 43
  });
  const firstFlicker = await flickerCards.consider(upgradeFlickerBase);
  const laterFlicker = await flickerCards.consider(upgradeFlickerLater, { force: true });
  assert.equal(flickerCalls, 1);
  assert.equal(publishedFlicker.length, 1);
  assert.equal(firstFlicker.reason, 'flicker-1');
  assert.equal(laterFlicker, firstFlicker);
  assert.equal(laterFlicker.reason, 'flicker-1');

  const normalCombatState = {
    ...mapState,
    run: { ...mapState.run, act: 1, actId: 'OVERGROWTH', room: 'Monster', currentNode: 'Monster', currentCoord: '3,1' },
    combat: {
      turn: 1,
      hand: [],
      drawPile: [],
      discardPile: [],
      exhaustPile: [],
      enemies: [
        { id: 'SCALER', name: '成长怪', hp: 20, maxHp: 20, intent: 'BuffIntent', alive: true },
        { id: 'MINION', name: '随从', hp: 12, maxHp: 12, intent: 'AttackIntent', alive: true }
      ]
    }
  };
  assert.equal(encounterKind(normalCombatState), 'Normal');
  assert.equal(encounterKind({ ...normalCombatState, run: { ...normalCombatState.run, room: 'Event', currentNode: 'Unknown' } }), 'Normal');
  assert.equal(
    encounterGuideSignature(normalCombatState),
    encounterGuideSignature({ ...normalCombatState, combat: { ...normalCombatState.combat, turn: 2 } })
  );

  const normalMatches = rankEncounterMatches([
    { id: 'PARTIAL_NORMAL', room_type: 'Monster', act: 'Act 1 - Overgrowth', monsters: [{ id: 'SCALER' }] },
    { id: 'EXACT_NORMAL', room_type: 'Monster', act: 'Act 1 - Overgrowth', monsters: [{ id: 'SCALER' }, { id: 'MINION' }] },
    { id: 'WRONG_ACT_NORMAL', room_type: 'Monster', act: 'Act 2 - Hive', monsters: [{ id: 'SCALER' }, { id: 'MINION' }] }
  ], normalCombatState.combat.enemies, { kind: 'Normal', act: 1, actId: 'OVERGROWTH' });
  assert.equal(normalMatches[0].item.id, 'EXACT_NORMAL');
  assert.equal(normalMatches[0].exactComposition, true);
  assert.equal(normalMatches.find(match => match.item.id === 'PARTIAL_NORMAL').exactComposition, false);
  assert.ok(!normalMatches.some(match => match.item.id === 'WRONG_ACT_NORMAL'));

  const normalKnowledge = {
    source: 'spire-codex',
    kind: 'Normal',
    encounter: { id: 'EXACT_NORMAL', name: '成长怪与随从', act: 'Act 1 - Overgrowth', isWeak: false, tags: [] },
    monsters: [
      {
        id: 'SCALER', name: '成长怪', hp: { min: 20, max: 20 }, innatePowers: [],
        attackPattern: { description: '强化后攻击。' }, mechanicTags: ['scaling'],
        moves: [{ id: 'GROW', name: '成长', intent: 'Buff', damage: null, block: null, heal: null, powers: [] }]
      },
      {
        id: 'MINION', name: '随从', hp: { min: 12, max: 12 }, innatePowers: [],
        attackPattern: { description: '持续攻击。' }, mechanicTags: ['multi_hit'],
        moves: [{ id: 'HIT', name: '连击', intent: 'Attack', damage: null, block: null, heal: null, powers: [] }]
      }
    ]
  };
  const derivedNormal = mechanicStrategy(normalKnowledge, normalCombatState);
  assert.equal(derivedNormal.basis, 'mechanics');
  assert.equal(derivedNormal.reviewStatus, 'mechanic-derived');
  for (const field of ['deckChecks', 'priorityTargets', 'dangerWindows', 'tips', 'avoid']) {
    assert.ok(derivedNormal[field].length > 0);
  }
  const normalGuide = await buildEncounterGuide(normalCombatState, {
    now: 60,
    codex: { loadEncounterContext: async () => normalKnowledge }
  });
  assert.equal(normalGuide.kind, 'normal');
  assert.equal(normalGuide.title, '成长怪与随从');
  assert.equal(normalGuide.strategy.basis, 'mechanics');
  assert.ok(normalGuide.monsters.length === 2);

  const shopState = {
    ...mapState,
    run: { ...mapState.run, room: 'Merchant', currentNode: 'Shop' },
    player: {
      ...mapState.player,
      gold: 180,
      maxPotionSlots: 3,
      cards: [
        { id: 'STRIKE', name: '打击', type: 'Attack', upgraded: false, description: '造成 6 点伤害。' },
        { id: 'DEFEND', name: '防御', type: 'Skill', upgraded: false, description: '获得 5 点格挡。' }
      ],
      relics: [],
      potions: []
    },
    combat: null,
    shop: {
      gold: 180,
      items: [
        { index: 0, itemType: 'card', id: 'IRON_WAVE', name: '铁斩波', price: 50, affordable: true, stocked: true, onSale: false, card: { id: 'IRON_WAVE', name: '铁斩波', type: 'Attack', upgraded: true, description: '造成伤害并获得格挡。', descriptionSource: 'runtime', energyCost: 1, energyCostSource: 'runtime', starCostSource: 'unavailable' } },
        { index: 1, itemType: 'relic', id: 'RINGING_TRIANGLE', name: '三角铃鼓', price: 120, affordable: true, stocked: true, onSale: true, description: '在每场战斗的第一回合保留你的手牌。' },
        { index: 2, itemType: 'potion', id: 'REGEN_POTION', name: '再生药水', price: 55, affordable: true, stocked: true, onSale: false, description: '获得 5 层再生。' },
        { index: 3, itemType: 'service', id: 'CARD_REMOVAL', name: '删除一张牌', price: 75, affordable: true, stocked: true, onSale: false, description: '从牌组中永久删除一张牌。' }
      ]
    }
  };
  const shopObservation = { state: shopState, fresh: true, recentEvents: [{ name: 'shop.opened', data: shopState.shop }] };
  assert.equal(findShop(shopObservation).items.length, 4);
  assert.notEqual(shopSignature(shopObservation), shopSignature({ ...shopObservation, state: { ...shopState, shop: { ...shopState.shop, gold: 80 } }, recentEvents: [{ name: 'shop.updated', data: { ...shopState.shop, gold: 80 } }] }));
  assert.equal(removeTarget(shopState.player.cards).name, '打击');
  const legalPlans = buildPlans(shopState.shop.items.map(item => ({ ...item, score: 70 })), shopState.shop, shopState);
  assert.ok(legalPlans.some(plan => plan.action === 'SAVE_GOLD'));
  assert.ok(legalPlans.every(plan => plan.totalSpend <= shopState.shop.gold));
  const shopKnowledge = {
    source: 'spire-codex',
    cards: [shopState.shop.items[0].card],
    deckCards: shopState.player.cards,
    relics: [],
    potions: [],
    threats: { knownBoss: { name: '守护者', exact: true, monsters: [] }, knownUpcomingElites: [], possibleElites: [], possibleBosses: [] },
    coach: null
  };
  const shopRec = await recommendShop(shopObservation, {
    now: 61,
    codex: { loadDraftContext: async () => shopKnowledge },
    llm: { enabled: true, completeShop: async () => ({ index: 999, reason: '非法索引' }) }
  });
  assert.equal(shopRec.task, 'shop_choice');
  assert.equal(validateRecommendation(shopRec).ok, true);
  assert.ok(shopRec.primary.totalSpend <= shopState.shop.gold);
  assert.ok(['BUY_ITEM', 'REMOVE_CARD', 'SAVE_GOLD'].includes(shopRec.primary.action));

  console.log('Agent recommendation cases passed: 82');
}).catch(error => {
  console.error(error);
  process.exit(1);
});
