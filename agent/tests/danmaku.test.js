'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DanmakuDirector } = require('../danmaku/director');
const { DanmakuBridgeAdapter } = require('../danmaku/bridge-adapter');

function state({ sequence = 1, combat = true, floor = 4, enemies } = {}) {
  return {
    schema: 'gamebuddy.state.v1', timestamp: sequence,
    run: { act: 1, floor, room: combat ? 'combat' : 'map', character: 'ironclad' },
    player: { hp: 60, maxHp: 80, block: 0, gold: 120, energy: 3, maxEnergy: 3, cards: [], relics: [], potions: [] },
    combat: combat ? {
      turn: sequence,
      hand: [], drawPile: [], discardPile: [], exhaustPile: [],
      enemies: enemies || [{ id: 'NIBBIT', name: '小啃兽', hp: 20, maxHp: 20, block: 0, intent: 'AttackIntent', alive: true }]
    } : null,
    map: { visited: [] }
  };
}

function observation(sequence, input) {
  return { schema: 'gamebuddy.observation.v1', sequence, fresh: true, state: input };
}

test('director only queues explicit fixed dialogue and never adds corpus or model text', () => {
  let now = 0;
  const director = new DanmakuDirector({ now: () => now, gapMs: 450 });
  const scope = { runId: 'run', sceneId: 'scene', stateRevision: 1 };
  director.setContext(scope);
  const result = director.burst({
    ...scope,
    eventId: 'move-1',
    trigger: 'enemy_move',
    factTexts: ['撕咬！恶狠狠的：没什么，我只是要狠狠地给你来一下。']
  });
  assert.equal(result.count, 1);
  assert.equal(director.queue[0].text.startsWith('撕咬！'), true);
});

test('entry queues one local monster line with its skill details', async () => {
  const adapter = new DanmakuBridgeAdapter({ now: () => 0 });
  await adapter.ingestObservation(observation(1, state({ enemies: [
    { id: 'NIBBIT', name: '小啃兽', intent: 'AttackIntent', nextMoveName: '顶撞' },
    { id: 'NIBBIT', name: '小啃兽', intent: 'AttackIntent', nextMoveName: '顶撞' }
  ] })), { runId: 'run' });
  assert.equal(adapter.director.queue.length, 1);
  for (const item of adapter.director.queue) {
    assert.equal(item.source, 'monster_skill');
    assert.match(item.detail.lines.join(' '), /行动：顶撞/);
  }
  assert.equal(adapter.tick().length, 1);
});

test('two identical monsters alternate without saying more than one line per turn', async () => {
  let now = 0;
  const adapter = new DanmakuBridgeAdapter({ now: () => now });
  const twins = (intent, nextMoveName) => [0, 1].map(slot =>
    ({ id: 'NIBBIT', name: '小啃兽', slot, intent, nextMoveName }));
  const observe = (revision, turn, intent, move) => adapter.ingestObservation(observation(revision,
    state({ sequence: turn, enemies: twins(intent, move) })), { runId: 'run' });
  await observe(1, 1, 'DefendIntent', '缩壳');
  const first = adapter.tick()[0];
  now += 6000;
  await observe(2, 1, 'AttackIntent', '顶撞');
  assert.deepEqual(adapter.tick(), []);
  await observe(3, 2, 'AttackIntent', '顶撞');
  const second = adapter.tick()[0];
  assert.deepEqual([first.monsterTurn, second.monsterTurn], [1, 2]);
  assert.deepEqual([first.skillLabel, second.skillLabel], ['小啃兽（1） · 缩壳', '小啃兽（2） · 顶撞']);
  assert.notEqual(first.text, second.text);
});

test('monster dialogue stays unique across fights and after the recent-text window', () => {
  let now = 0;
  const director = new DanmakuDirector({ now: () => now, repeatWindowMs: 90_000 });
  const firstFight = { runId: 'run', sceneId: 'first-fight', stateRevision: 1 };
  director.setContext(firstFight);
  const emit = (scope, eventId, factTexts) =>
    director.burst({ ...scope, eventId, key: eventId, trigger: 'monster_skill', priority: 3, factTexts });
  assert.equal(emit(firstFight, 'first-monster', ['小心，前面有坑。']).count, 1);
  assert.equal(director.tick()[0].text, '小心，前面有坑。');
  now = 100_000;
  assert.equal(emit(firstFight, 'second-monster', ['小心 前面有坑！']).reason, 'empty_or_repeated_text');
  const nextFight = { ...firstFight, sceneId: 'next-fight' };
  director.setContext(nextFight);
  assert.equal(emit(nextFight, 'next-monster', ['小心，前面有坑。', '看我的下一步。']).count, 1);
  assert.equal(director.tick()[0].text, '看我的下一步。');
  assert.equal(emit(nextFight, 'last-monster', ['小心，前面有坑。']).reason, 'empty_or_repeated_text');
});

test('queued monster dialogue expires when the turn or selected action changes', async () => {
  const adapter = new DanmakuBridgeAdapter({ now: () => 0 });
  const first = state({ enemies: [{ name: '小啃兽', intent: 'AttackIntent', nextMoveName: '顶撞' }] });
  await adapter.ingestObservation(observation(1, first), { runId: 'run' });
  const second = state({ sequence: 2, enemies: [{ name: '小啃兽', intent: 'DefendIntent', nextMoveName: '缩壳' }] });
  await adapter.ingestObservation(observation(2, second), { runId: 'run' });
  assert.equal(adapter.director.queue.length, 2);
  const [message] = adapter.tick();
  assert.equal(message.monsterTurn, 2);
  assert.match(message.skillLabel, /缩壳/);
  assert.equal(adapter.director.queue.length, 0);

  const third = state({ sequence: 3, enemies: [{ name: '小啃兽', intent: 'AttackIntent', nextMoveName: '顶撞' }] });
  await adapter.ingestObservation(observation(3, third), { runId: 'run' });
  const changed = state({ sequence: 3, enemies: [{ name: '小啃兽', intent: 'DefendIntent', nextMoveName: '缩壳' }] });
  await adapter.ingestObservation(observation(4, changed), { runId: 'run' });
  assert.deepEqual(adapter.tick(), []);
  assert.equal(adapter.director.queue.length, 0);
});

test('普通推荐只留在面板，adapter不再生成推荐复述弹幕', async () => {
  const adapter = new DanmakuBridgeAdapter({ now: () => 0 });
  const result = await adapter.ingestRecommendation({
    schema: 'gamebuddy.recommendation.v1',
    task: 'card_reward',
    timestamp: 12,
    source: 'rules',
    primary: {
      action: 'TAKE_CARD', cardName: '测试护盾卡',
      analysis: { description: '获得 8 点格挡并抽 1 张牌' }
    },
    reason: '当前牌组缺少稳定防御。'
  }, {
    runId: 'run',
    observation: { sequence: 4, state: state({ combat: false }) }
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'recommendation_panel_only');
  assert.equal(adapter.director.queue.length, 0);
});

test('stale duplicate observations do not create a second combat wave', async () => {
  const adapter = new DanmakuBridgeAdapter({ now: () => 0 });
  await adapter.ingestObservation(observation(1, state()), { runId: 'run' });
  const count = adapter.director.queue.length;
  const result = await adapter.ingestObservation(observation(1, state()), { runId: 'run' });
  assert.equal(result.reason, 'old_observation');
  assert.equal(adapter.director.queue.length, count);
});

test('shared combat messages are fetched by character and monster scene without blocking local facts', async () => {
  const sharedClient = {
    enabled: true,
    async list({ sceneKey, phase }) {
      assert.equal(sceneKey, 'sts2-v1:ironclad:combat:nibbit');
      assert.equal(phase, 'combat');
      return [{ id: 'shared-1', text: '这虫子看着憨，打起来全是心眼。' }];
    }
  };
  const adapter = new DanmakuBridgeAdapter({ now: () => 0, sharedClient });
  await adapter.ingestObservation(observation(1, state()), { runId: 'run' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(adapter.getSharedScene().sceneKey, 'sts2-v1:ironclad:combat:nibbit');
  assert.ok(adapter.director.queue.some(item => item.text === '这虫子看着憨，打起来全是心眼。'));
});

test('death switches shared timing to death while keeping the same scene object', async () => {
  const sharedClient = {
    enabled: true,
    async list({ phase }) {
      return phase === 'death' ? [{ id: 'shared-death', text: '倒在这里，也算见过世面了。' }] : [];
    }
  };
  const adapter = new DanmakuBridgeAdapter({ now: () => 0, sharedClient });
  await adapter.ingestObservation(observation(1, state()), { runId: 'run' });
  const dead = state({ sequence: 2, combat: false });
  dead.player.hp = 0;
  await adapter.ingestObservation(observation(2, dead), { runId: 'run' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(adapter.getSharedScene().phase, 'death');
  assert.equal(adapter.getSharedScene().sceneKey, 'sts2-v1:ironclad:combat:nibbit');
  assert.ok(adapter.director.queue.some(item => item.text === '倒在这里，也算见过世面了。'));
});

const settle = () => new Promise(resolve => setImmediate(resolve));

test('text dedupe covers queued, recent and cross-scene comments but expires', () => {
  let now = 0;
  const d = new DanmakuDirector({ now: () => now });
  let scope = { runId: 'r', sceneId: 's', stateRevision: 1 };
  d.setContext(scope);
  const emit = (id, text) => d.burst({ ...scope, eventId: id, trigger: 'ai_atmosphere', key: id, priority: 3, factTexts: [text] });
  assert.equal(emit('a', '这一拳，记下了。').count, 1);
  assert.equal(emit('b', '这一拳记下了！').accepted, false);
  assert.equal(d.tick().length, 1);
  scope = { ...scope, sceneId: 'next' };
  d.setContext(scope);
  now = 20_000;
  assert.equal(emit('c', '这一拳记下了').accepted, false);
  now = 90_000;
  assert.equal(emit('d', '这一拳记下了').count, 1);
});

test('same short advice for distinct decisions is preserved', () => {
  const d = new DanmakuDirector();
  const scope = { runId: 'r', sceneId: 's', stateRevision: 1 };
  d.setContext(scope);
  for (const id of ['reward-1', 'reward-2']) {
    assert.equal(d.burst({ ...scope, eventId: id, trigger: 'recommendation', key: id, recommendationId: id,
      priority: 3, factTexts: ['跳过这次奖励。'] }).accepted, true);
  }
  assert.equal(d.queue.length, 2);
});

test('enemy deaths, summons and temporary empty lists do not repeat entry or shared fetch', async () => {
  let requests = 0;
  const adapter = new DanmakuBridgeAdapter({ now: () => 0, sharedClient: {
    enabled: true, list: async () => { requests += 1; return []; }
  } });
  await adapter.ingestObservation(observation(1, state()), { runId: 'run' });
  const sceneId = adapter.scope.sceneId;
  for (const [i, enemies] of [[], [{ id: 'OTHER', name: '新敌人', intent: 'AttackIntent' }], []].entries()) {
    await adapter.ingestObservation(observation(i + 2, state({ enemies })), { runId: 'run' });
    assert.equal(adapter.scope.sceneId, sceneId);
  }
  assert.equal(requests, 1);
  await adapter.ingestObservation(observation(5, state({ combat: false })), { runId: 'run' });
  await adapter.ingestObservation(observation(6, state({ floor: 5 })), { runId: 'run' });
  assert.notEqual(adapter.scope.sceneId, sceneId);
  assert.equal(requests, 2);
});

test('explicit new combat ID changes scene without needing an empty snapshot', async () => {
  const adapter = new DanmakuBridgeAdapter();
  const first = state(); first.combat.combatId = 'a';
  await adapter.ingestObservation(observation(1, first), { runId: 'run' });
  const previous = adapter.scope.sceneId;
  const second = state(); second.combat.combatId = 'b';
  await adapter.ingestObservation(observation(2, second), { runId: 'run' });
  assert.notEqual(adapter.scope.sceneId, previous);
});

test('entry requests two AI lines while preserving skill introductions', async () => {
  const contexts = [];
  const adapter = new DanmakuBridgeAdapter({ llmAtmosphere: { generate: async context => {
    contexts.push(context);
    return { status: 'generated', phrases: ['这一下，记下了。', '又能往上走了。', '第三句不显示。'] };
  } } });
  await adapter.ingestObservation(observation(1, state()), { runId: 'run' });
  await settle();
  assert.equal(contexts[0].trigger, 'periodic');
  assert.equal(adapter.director.queue.filter(item => item.source === 'ai').length, 2);
  assert.equal(adapter.director.queue.filter(item => item.source === 'monster_skill').length, 1);
});

test('unavailable, failed or repeated AI does not produce fixed filler or remove skill messages', async () => {
  for (const status of ['unavailable', 'failed', 'throttled', 'duplicate']) {
    const adapter = new DanmakuBridgeAdapter({ llmAtmosphere: { generate: async () => ({ status, phrases: [] }) } });
    await adapter.ingestObservation(observation(1, state()), { runId: 'run' });
    await settle();
    assert.equal(adapter.director.queue.length, 1);
    assert.equal(adapter.director.queue[0].source, 'monster_skill');
  }
});

test('every 15 seconds uses latest state and Mod events even while an earlier batch is pending', async () => {
  let now = 0;
  const requests = [];
  const adapter = new DanmakuBridgeAdapter({ now: () => now, llmAtmosphere: { generate: (context, options) =>
    new Promise(resolve => requests.push({ context, options, resolve })) } });
  await adapter.ingestObservation(observation(1, state()), { runId: 'run' });
  await settle();
  now = 4000;
  const next = state({ enemies: [{ name: '新怪物', intent: 'DefendIntent', nextMoveName: '缩壳', hp: 12 }] });
  next.player.hp = 25;
  await adapter.ingestObservation(observation(2, next), { runId: 'run' });
  await adapter.ingestEvent({ name: 'card.played', eventId: 'card-1', data: { cardName: '痛击' } });
  await adapter.ingestEvent({ name: 'card.played', eventId: 'card-1', data: { cardName: '痛击' } });
  adapter.tick(); await settle();
  assert.equal(requests.length, 1);
  now = 14999; adapter.tick(); await settle();
  assert.equal(requests.length, 1);
  now = 15000; adapter.tick(); await settle();
  assert.equal(requests.length, 2);
  const second = requests[1].context;
  assert.equal(second.snapshot.player.hp, 25);
  assert.equal(second.snapshot.enemies[0].name, '新怪物');
  assert.equal(second.snapshot.enemies[0].nextMoveName, '缩壳');
  assert.match(second.facts.join(' '), /生命从60降到25/);
  assert.equal(second.optionalContext, true);
  assert.ok(second.moments.some(item => item.kind === 'player_hurt'));
  assert.equal(second.recentEvents.length, 1);
  assert.match(second.recentEvents[0].facts.join(' '), /痛击/);
  assert.notEqual(second.batchId, requests[0].context.batchId);
  requests[0].resolve({ status: 'generated', phrases: ['刚才那一下，记下了。', '这伤口也算纪念。'] });
  await settle();
  assert.equal(adapter.director.queue.filter(item => item.source === 'ai').length, 0, 'old target disappeared before its response');
  now = 80000; adapter.tick(); await settle();
  assert.equal(requests.length, 3, 'missed slots must not trigger a burst of requests');
  assert.equal(requests[2].context.recentEvents.length, 0);
  adapter.invalidate();
  assert.ok(requests.slice(1).every(item => item.options.signal.aborted));
  requests.slice(1).forEach(item => item.resolve({ status: 'cancelled', phrases: [] }));
  await settle();
});

test('same-scene pending AI survives ordinary snapshot and action changes', async () => {
  let resolve;
  const adapter = new DanmakuBridgeAdapter({ llmAtmosphere: { generate: () => new Promise(done => { resolve = done; }) } });
  await adapter.ingestObservation(observation(1, state()), { runId: 'run' });
  await settle();
  const next = state({ enemies: [{ name: '小啃兽', intent: 'DefendIntent' }] }); next.player.energy -= 1;
  await adapter.ingestObservation(observation(2, next), { runId: 'run' });
  resolve({ status: 'generated', phrases: ['这一下，记下了。'] });
  await settle();
  assert.equal(adapter.director.queue.some(item => item.text === '这一下，记下了。'), true);
});

test('leaving, disconnect, death, new run or character cancels pending AI and prevents stale display', async () => {
  for (const change of ['invalidate', 'new_scene', 'close', 'death', 'character', 'run']) {
    const requests = [];
    const adapter = new DanmakuBridgeAdapter({ llmAtmosphere: { generate: (context, options) =>
      new Promise(resolve => requests.push({ context, options, resolve })) } });
    await adapter.ingestObservation(observation(1, state()), { runId: 'run' });
    await settle();
    if (change === 'invalidate') adapter.invalidate();
    if (change === 'new_scene') await adapter.ingestObservation(observation(2, state({ floor: 5 })), { runId: 'run' });
    if (change === 'close') await adapter.ingestEvent({ name: 'combat.ended' });
    if (change === 'death') { const dead = state({ combat: false }); dead.player.hp = 0;
      await adapter.ingestObservation(observation(2, dead), { runId: 'run' }); }
    if (change === 'run') await adapter.ingestObservation(observation(2, state()), { runId: 'new-run' });
    if (change === 'character') { const other = state(); other.run.character = 'necrobinder';
      await adapter.ingestObservation(observation(2, other), { runId: 'run' }); }
    await settle();
    assert.equal(requests[0].options.signal.aborted, true, change);
    requests[0].resolve({ status: 'generated', phrases: ['这是已经过时的感想。'] });
    await settle();
    assert.equal(adapter.director.queue.some(item => item.text === '这是已经过时的感想。'), false, change);
    if (change === 'character') assert.equal(requests[1].context.character, 'necrobinder');
    adapter.invalidate();
    requests.slice(1).forEach(item => item.resolve({ status: 'cancelled', phrases: [] }));
    await settle();
  }
});

test('duplicate death notifications cannot refetch the same death scene', async () => {
  let deaths = 0;
  const adapter = new DanmakuBridgeAdapter({ sharedClient: { enabled: true, list: async ({ phase }) => {
    if (phase === 'death') deaths += 1;
    return [];
  } } });
  await adapter.ingestObservation(observation(1, state()), { runId: 'run' });
  const dead = state({ combat: false }); dead.player.hp = 0;
  await adapter.ingestObservation(observation(2, dead), { runId: 'run' });
  await adapter.ingestEvent({ name: 'combat.ended', eventId: 'ended-again' });
  await settle();
  assert.equal(deaths, 1);
  assert.equal(adapter.getSharedScene().phase, 'death');
});

test('presentation ratios count only unique renderer acknowledgements and separate advice/shared', () => {
  let now = 0;
  const d = new DanmakuDirector({ now: () => now });
  const scope = { runId: 'r', sceneId: 's', stateRevision: 1 };
  d.setContext(scope);
  assert.equal(d.presentationStats().aiPercent, null);
  for (const [i, source] of ['ai', 'original_template', 'recommendation', 'shared'].entries()) {
    const text = `来源测试 ${i}`;
    d.burst({ ...scope, eventId: `${i}`, trigger: 'test', key: `${i}`, priority: 3, factTexts: [text],
      factSourceByText: { [text]: { source } } });
    now = i * 6000;
    const [message] = d.tick();
    assert.equal(d.presentationStats().total, i);
    assert.equal(d.acknowledgePresented('unknown'), false);
    assert.equal(d.acknowledgePresented(message.id), true);
    assert.equal(d.acknowledgePresented(message.id), false);
  }
  assert.equal(d.presentationStats().total, 4);
  assert.equal(d.presentationStats().aiPercent, 25);
  assert.equal(d.presentationStats().commentaryAiPercent, 50);
  d.burst({ ...scope, eventId: 'never-rendered', trigger: 'test', key: 'never', priority: 3, factTexts: ['已经过时了。'] });
  now += 40_000;
  assert.deepEqual(d.tick(), []);
  assert.equal(d.presentationStats().total, 4);
});

test('queued fixed comments cannot bunch up after a backlog or block AI', () => {
  let now = 0;
  const d = new DanmakuDirector({ now: () => now });
  const scope = { runId: 'r', sceneId: 's', stateRevision: 1 };
  d.setContext(scope);
  const texts = ['固定一', '固定二', '新鲜评论'];
  d.burst({ ...scope, eventId: 'batch', trigger: 'test', factTexts: texts,
    factSourceByText: { 新鲜评论: { source: 'ai' } } });
  now = 10_000;
  assert.equal(d.tick()[0].text, '固定一');
  now = 12_000;
  assert.equal(d.tick()[0].text, '新鲜评论');
  assert.equal(d.queue.length, 0);
});

test('关键组件按机会和对象去重，优先于人格弹幕且不丢掉技能和建议', () => {
  let now = 0;
  const scheduled = [];
  const adapter = new DanmakuBridgeAdapter({ now: () => now, schedule: callback => scheduled.push(callback) });
  assert.equal(adapter.aiIntervalMs, 15_000);
  const deck = [{ id: 'POMMEL_STRIKE', name: '剑柄打击' }, { id: 'STRIKE_IRONCLAD', name: '打击' }];
  const live = state({ combat: false });
  live.run.runId = 'run-key';
  live.player.cards = deck;
  live.player.gold = 120;
  const reward = {
    name: 'card.reward.opened',
    data: {
      opportunityId: 'reward:1',
      signature: 'HELLRAISER:False',
      source: 'combat',
      cards: [{ id: 'HELLRAISER', name: '地狱狂徒', upgraded: false }]
    }
  };
  adapter.syncKeyComponents(reward, live, 'run-key');
  adapter.syncKeyComponents(reward, live, 'run-key');
  assert.equal(adapter.director.queue.filter(item => item.source === 'key_component').length, 1);
  assert.equal(adapter.director.queue[0].displayPriority, 7);
  assert.equal(adapter.director.queue[0].contentKey, 'key:run-key:reward:1:system:ironclad:auto-strike:card:HELLRAISER:false');
  adapter.director.queue.push({
    ...adapter.director.context,
    id: 'skill-kept',
    source: 'monster_skill',
    text: '技能仍会播放',
    contentKey: 'skill:kept',
    displayPriority: 5,
    dueAt: 0,
    expiresAt: 100000,
    generation: adapter.director.generation
  });
  adapter.director.queue.push({
    ...adapter.director.context,
    id: 'advice-kept',
    source: 'recommendation',
    text: '建议仍会播放',
    contentKey: 'recommendation:kept',
    displayPriority: 6,
    dueAt: 0,
    expiresAt: 100000,
    generation: adapter.director.generation
  });
  const first = adapter.tick()[0];
  assert.equal(first.source, 'key_component');
  assert.match(first.text, /务必拿下/);
  now = 500;
  assert.equal(adapter.tick()[0].text, '建议仍会播放');
  now = 1000;
  assert.equal(adapter.tick()[0].text, '技能仍会播放');
  adapter.syncKeyComponents(reward, live, 'run-key');
  assert.equal(adapter.director.queue.some(item => item.source === 'key_component'), false);
  assert.equal(scheduled.length, 0);

  const eventReward = {
    name: 'event.opened',
    data: {
      opportunityId: 'reward:event-1',
      source: 'event',
      cards: [{ id: 'HELLRAISER', name: '地狱狂徒', upgraded: false }]
    }
  };
  adapter.syncKeyComponents(eventReward, live, 'run-key');
  assert.equal(adapter.director.queue.filter(item => item.source === 'key_component').length, 1);
  assert.match(adapter.director.queue[0].contentKey, /reward:event-1/);
});
