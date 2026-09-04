const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createObservationStore } = require('./observation-store');
const { validateRecommendation } = require('../agent/recommendation');
const { rankRoutes, recommendRoute, scoreNode, scoreParts, buildScoreContext, ensureMapRoutes } = require('../agent/tasks/route');
const { isRestSite, recommendRest, rankSmithCards } = require('../agent/tasks/rest');
const { parseJsonObject, createOpenAiClient, readLlmConfig, extractResponseText } = require('../agent/llm/openai');
const { loadCodexLlmConfig } = require('../agent/llm/codex-config');
const { createOrchestrator } = require('../agent/orchestrator');

const lifecycle = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'lifecycle.json'), 'utf8'));
const mapState = lifecycle[2];

const shopOverElite = rankRoutes(mapState);
assert.equal(shopOverElite[0].targetType, 'Shop');
assert.ok(shopOverElite[0].score > shopOverElite[1].score);

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

const codexHome = path.join(__dirname, 'fixtures', 'codex-home');
const fromCodex = loadCodexLlmConfig({ env: { GAMEBUDDY_CODEX_HOME: codexHome } });
assert.equal(fromCodex.model, 'gpt-5.5');
assert.equal(fromCodex.wireApi, 'responses');
assert.equal(fromCodex.apiKey, 'sk-test-codex');
assert.equal(fromCodex.baseURL, 'https://ai.gs88.shop/v1');
assert.equal(fromCodex.reasoningEffort, 'xhigh');

const merged = readLlmConfig({ GAMEBUDDY_CODEX_HOME: codexHome });
assert.equal(merged.enabled, true);
assert.equal(merged.model, 'gpt-5.5');
assert.equal(merged.wireApi, 'responses');
assert.equal(merged.source, 'codex');
assert.equal(extractResponseText({ output_text: '{"index":1}' }), '{"index":1}');

const store = createObservationStore({ staleAfterMs: 5000 });
store.ingest({ type: 'state', data: mapState }, 1723370002000);
const observation = store.getObservation(1723370002100);
assert.equal(observation.fresh, true);

recommendRoute(mapState, { now: 1 }).then(async rulesRec => {
  assert.equal(validateRecommendation(rulesRec).ok, true);
  assert.equal(rulesRec.source, 'rules');
  assert.equal(rulesRec.task, 'map_route');
  assert.equal(rulesRec.primary.action, 'TAKE_ROUTE');
  assert.equal(rulesRec.primary.targetId, '2,0');
  assert.match(rulesRec.reason, /删起手牌|遗物|升级/);

  const llm = {
    enabled: true,
    completeRoute: async () => ({ index: 1, reason: '生命够用，去打精英换遗物。' })
  };
  const llmRec = await recommendRoute(mapState, { llm, now: 2 });
  assert.equal(llmRec.source, 'llm');
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

  console.log('Agent route cases passed: 23');
}).catch(error => {
  console.error(error);
  process.exit(1);
});
