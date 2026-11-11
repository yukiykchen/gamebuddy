'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { RunMemory } = require('../danmaku/run-memory');
const { DanmakuBridgeAdapter } = require('../danmaku/bridge-adapter');
const { DanmakuDirector } = require('../danmaku/director');
const { DanmakuLlmAtmosphere } = require('../danmaku/llm-atmosphere');
const settle = () => new Promise(resolve => setImmediate(resolve));
const state = ({ turn = 1, hp = 60, character = 'ironclad', enemies, cards = [], combat = true } = {}) => ({
  run: { runId: 'mod-run', act: 1, floor: 1, character, room: combat ? 'combat' : 'map' },
  player: { hp, maxHp: 80, energy: 3, block: 0, cards },
  combat: combat ? { turn, enemies: enemies || [{ id: 'NIBBIT', name: '小啃兽', hp: 20, maxHp: 20, intent: 'AttackIntent', alive: true }] } : null
});
const obs = (sequence, state) => ({ schema: 'gamebuddy.observation.v1', sequence, fresh: true, state });

 test('memory detects five evidenced highlights without repeating snapshots or attributing effects', () => {
  let now = 0;
  const m = new RunMemory({ now: () => now });
  const observe = input => m.observe(input, { runId: 'r', sceneId: 's' });
  observe(state({ hp: 12 }));
  now += 1000;
  observe(state({ hp: 10, turn: 2 }));
  observe(state({ hp: 10, turn: 2 }));
  assert.equal(m.pending().filter(item => item.kind === 'low_hp_survived').length, 1);
  const enemy = { id: 'NIBBIT', name: '小啃兽', hp: 3, maxHp: 20, intent: 'BuffIntent' };
  let input = state({ turn: 3, enemies: [enemy] }); observe(input);
  for (let i = 0; i < 3; i++) m.event({ name: 'card.played', eventId: `p${i}`, data: { cardName: '打击' } }, input);
  observe(input);
  assert.ok(m.moments.some(item => item.kind === 'near_finish')); // 更高优先级的受伤/残血可先进入请求
  observe(state({ turn: 4, enemies: [enemy] }));
  assert.ok(m.moments.some(item => item.kind === 'repeated_buff' && /意图/.test(item.text)));
  observe(state({ turn: 6, enemies: [enemy] }));
  observe(state({ turn: 6, enemies: [{ ...enemy, hp: 0, alive: false }] }));
  assert.ok(m.moments.some(item => item.kind === 'long_fight_down'));
  input = state({ turn: 7, cards: [{ id: 'NEW', name: '新卡' }] }); observe(input);
  m.event({ name: 'card.played', eventId: 'first-new', data: { cardId: 'NEW' } }, input);
  m.event({ name: 'card.played', eventId: 'first-new', data: { cardId: 'NEW' } }, input);
  assert.equal(m.moments.filter(item => item.kind === 'new_card_debut').length, 1);
  assert.match(m.moments.find(item => item.kind === 'new_card_debut').text, /收益尚未确认/);
});

test('missing deaths, missing play events and initial deck cannot manufacture highlights', () => {
  const m = new RunMemory();
  const observe = input => m.observe(input, { runId: 'r', sceneId: 's' });
  observe(state({ turn: 6, cards: [{ id: 'EXISTING', name: '旧卡' }] }));
  observe(state({ turn: 7, enemies: [] }));
  m.event({ name: 'card.played', eventId: 'old', data: { cardId: 'EXISTING' } }, state());
  assert.equal(m.pending().length, 0);
  m.disconnect();
  observe(state({ turn: 9, hp: 10 }));
  assert.equal(m.pending().length, 0, 'disconnect must not infer a turn transition');
});

test('run memory recalls relevant encounters and recovery, and isolates runs and characters', () => {
  const m = new RunMemory();
  m.observe(state({ hp: 10 }), { runId: 'r', sceneId: 'one', entering: true });
  m.observe(state({ hp: 50, combat: false }), { runId: 'r' });
  m.observe(state({ hp: 50 }), { runId: 'r', sceneId: 'two', entering: true });
  const memories = m.relevant(state()).join(' ');
  assert.match(memories, /第2次/); assert.match(memories, /此前包含小啃兽/); assert.match(memories, /恢复/);
  m.observe(state(), { runId: 'new-run', sceneId: 'new', entering: true });
  assert.deepEqual(m.relevant(state()), []);
  m.observe(state({ hp: 10 }), { runId: 'new-run', sceneId: 'new' });
  m.observe(state({ character: 'regent' }), { runId: 'new-run', sceneId: 'regent', entering: true });
  assert.deepEqual(m.relevant(state({ character: 'regent' })), []);
  for (let i = 0; i < 100; i++) m.addMoment('test', `event ${i}`, `${i}`);
  assert.ok(m.history.length <= 40 && m.moments.length <= 12);
});

test('ready skills and advice preempt AI while second AI waits at least six seconds after first display', () => {
  let now = 0;
  const d = new DanmakuDirector({ now: () => now });
  const scope = { runId: 'r', sceneId: 's', stateRevision: 1 }; d.setContext(scope);
  const queue = (id, source, texts, meta = {}) => d.burst({ ...scope, eventId: id, trigger: id, key: id, priority: 3,
    factTexts: texts, factSourceByText: Object.fromEntries(texts.map(text => [text, { source }])), ...meta });
  queue('ai', 'ai', ['第一条评论', '第二条评论']);
  assert.equal(d.tick()[0].text, '第一条评论');
  now = 1000; queue('skill', 'monster_skill', ['独立技能']); queue('advice', 'recommendation', ['重要建议']);
  assert.equal(d.tick()[0].text, '重要建议');
  now = 1500; assert.equal(d.tick()[0].text, '独立技能');
  now = 5999; assert.deepEqual(d.tick(), []);
  now = 6000; assert.equal(d.tick()[0].text, '第二条评论');
});

test('highlight preempts ordinary commentary and quiet messages stay thirty seconds apart', () => {
  let now = 0;
  const d = new DanmakuDirector({ now: () => now });
  const scope = { runId: 'r', sceneId: 's', stateRevision: 1 }; d.setContext(scope);
  const queue = (id, text, commentary) => d.burst({ ...scope, eventId: id, trigger: id, key: id, priority: 3,
    factTexts: [text], factSourceByText: { [text]: { source: 'ai' } }, commentaryByText: { [text]: commentary } });
  queue('ordinary', '普通评论', {}); queue('highlight', '精彩评论', { momentId: 'moment' });
  assert.equal(d.tick()[0].text, '精彩评论');
  now = 6000; assert.equal(d.tick()[0].text, '普通评论');
  now = 12000; queue('quiet', '安静评论一', { quiet: true }); assert.equal(d.tick()[0].text, '安静评论一');
  now = 27000; queue('quiet-two', '安静评论二', { quiet: true }); assert.deepEqual(d.tick(), []);
  now = 42000; assert.equal(d.tick()[0].text, '安静评论二');
});

test('adapter drops queued second line when its target dies and exposes visible skill identity', async () => {
  let now = 0;
  const adapter = new DanmakuBridgeAdapter({ now: () => now, llmAtmosphere: { generate: async () => ({ status: 'generated', phrases: ['第一句针对怪物', '第二句针对怪物'] }) } });
  await adapter.ingestObservation(obs(1, state()), { runId: 'r' }); await settle();
  assert.match(adapter.director.queue.find(item => item.source === 'monster_skill').skillLabel, /小啃兽/);
  adapter.tick(); // skill first
  now = 500; assert.equal(adapter.tick()[0].text, '第一句针对怪物');
  await adapter.ingestObservation(obs(2, state({ enemies: [] })), { runId: 'r' });
  now = 6500; assert.deepEqual(adapter.tick(), []);
  assert.equal(adapter.director.queue.some(item => item.text === '第二句针对怪物'), false);
});

test('quiet battle still requests on cadence but reduces presentation; highlights enter real model context', async () => {
  let now = 0; const contexts = [];
  const adapter = new DanmakuBridgeAdapter({ now: () => now, llmAtmosphere: { generate: async context => {
    contexts.push(context); const i = contexts.length;
    return { status: 'generated', phrases: [`第${i}批观察一句`, `第${i}批观察二句`] };
  } } });
  await adapter.ingestObservation(obs(1, state({ hp: 10 })), { runId: 'r' }); await settle();
  now = 15000; adapter.tick(); await settle();
  assert.equal(contexts.length, 2); assert.equal(contexts[1].mode, 'quiet');
  assert.equal(adapter.director.queue.filter(item => /第2批/.test(item.text)).length, 1);
  now = 30000; adapter.tick(); await settle();
  assert.equal(contexts.length, 3); assert.equal(adapter.director.queue.filter(item => /第3批/.test(item.text)).length, 0);
  await adapter.ingestObservation(obs(2, state({ hp: 9, turn: 2 })), { runId: 'r' });
  now = 45000; adapter.tick(); await settle();
  assert.equal(contexts[3].mode, 'highlight');
  assert.equal(contexts[3].optionalContext, true);
  assert.ok(contexts[3].moments.some(item => item.kind === 'low_hp_survived'));
});

test('model receives perspective and memory, validates references and keeps historical highlight identity', async () => {
  let payload;
  const model = new DanmakuLlmAtmosphere({ llm: { enabled: true, completeDanmaku: async input => {
    payload = input;
    return { phrases: [
      { text: '刚才那场交锋很漫长。', momentId: 'm1', enemyKeys: [] },
      { text: '这个怪物不该被捏造。', enemyKeys: ['unknown'] },
      { text: '眼前这只还在准备。', enemyKeys: ['小啃兽#0'] }
    ] };
  } } });
  const result = await model.generate({ character: 'silent', moments: [{ id: 'm1', kind: 'long_fight_down', text: '敌人倒下' }],
    runMemories: ['本局再次遇到小啃兽'], snapshot: { enemies: [{ key: '小啃兽#0', name: '小啃兽' }] } });
  assert.ok(payload.attention.length); assert.match(payload.memoryVoice, /猎人/);
  assert.ok(payload.reactions.long_fight_down); assert.equal(payload.runMemories.length, 1);
  assert.equal(result.phrases.length, 2);
  assert.equal(result.commentaryByText[result.phrases[0]].momentId, 'm1');
  assert.deepEqual(result.commentaryByText[result.phrases[1]].enemyKeys, ['小啃兽#0']);
});

test('only fresh same-run live card facts contribute to first-play memory', async () => {
  let now = 10000;
  const adapter = new DanmakuBridgeAdapter({ now: () => now });
  await adapter.ingestObservation(obs(1, state({ combat: false })), { runId: 'r' });
  const input = state({ cards: [{ id: 'NEW', name: '新牌' }] });
  await adapter.ingestObservation(obs(2, input), { runId: 'r' });
  const fact = { eventId: 'f', eventType: 'card.played', runId: 'mod-run', occurredAt: now, payload: { cardId: 'NEW' } };
  await adapter.ingestFact({ ...fact, runId: 'other' });
  await adapter.ingestFact({ ...fact, occurredAt: 1 });
  await adapter.ingestFact(fact, { replay: true });
  assert.equal(adapter.memory.pending().length, 0);
  await adapter.ingestFact(fact); await adapter.ingestFact(fact);
  assert.equal(adapter.memory.pending().length, 1);
  assert.equal(adapter.memory.pending()[0].kind, 'new_card_debut');
});


test('adding another copy cannot claim that an indistinguishable old copy was the new card debut', () => {
  const m = new RunMemory();
  const card = { id: 'STRIKE', name: '打击' };
  m.observe(state({ cards: [card] }), { runId: 'r', sceneId: 's' });
  const input = state({ cards: [card, card] });
  m.observe(input, { runId: 'r', sceneId: 's' });
  m.event({ name: 'card.played', eventId: 'copy', data: { cardId: 'STRIKE' } }, input);
  assert.equal(m.moments.some(item => item.kind === 'new_card_debut'), false);
});

test('historical highlights expire and never survive into another combat scene', () => {
  let now = 0;
  const m = new RunMemory({ now: () => now });
  m.observe(state(), { runId: 'r', sceneId: 's' });
  m.addMoment('long_fight_down', '已观察到敌人倒下。', 'death');
  const id = m.pending()[0].id;
  assert.equal(m.validMoment(id), true);
  now = 60_000;
  assert.equal(m.validMoment(id), false);
  m.addMoment('low_hp_survived', '低生命进入下一回合。', 'survive');
  const other = m.pending()[0].id;
  m.observe(state(), { runId: 'r', sceneId: 'next', entering: true });
  assert.equal(m.validMoment(other), false);
});


test('authoritative Mod run change clears memories even when a caller reuses its run key', async () => {
  const adapter = new DanmakuBridgeAdapter();
  await adapter.ingestObservation(obs(1, state({ hp: 10 })), { runId: 'reused-seed' });
  const oldScene = adapter.scope.sceneId;
  assert.ok(adapter.memory.history.length);
  const input = state(); input.run.runId = 'different-mod-run';
  await adapter.ingestObservation(obs(2, input), { runId: 'reused-seed' });
  assert.notEqual(adapter.scope.sceneId, oldScene);
  assert.equal(adapter.memory.history.length, 0);
});

test('商店关键提醒在售出或离场前丢弃，无模型时仍立即发出且人格节奏不变', () => {
  let now = 0;
  const calls = [];
  const adapter = new DanmakuBridgeAdapter({
    now: () => now,
    llmAtmosphere: { generate: async () => { calls.push('llm'); return { status: 'generated', phrases: [] }; } }
  });
  assert.equal(adapter.aiIntervalMs, 15_000);
  const live = {
    run: { runId: 'shop-run', act: 1, floor: 3, totalFloor: 3, room: 'shop', character: 'ironclad', currentCoord: '1,2' },
    player: {
      gold: 200,
      cards: [{ id: 'POMMEL_STRIKE', name: '剑柄打击' }, { id: 'STRIKE_IRONCLAD', name: '打击' }],
      relics: []
    }
  };
  const shop = items => ({
    name: 'shop.opened',
    data: { visitId: 'shop:visit-1', gold: live.player.gold, items }
  });
  const hellraiser = { itemType: 'card', id: 'HELLRAISER', name: '地狱狂徒', price: 80, stocked: true, stockKey: 'card:2', card: { upgraded: false } };
  const dummy = { itemType: 'relic', id: 'STRIKE_DUMMY', name: '打击木偶', price: 150, stocked: true, stockKey: 'relic:1' };
  adapter.syncKeyComponents(shop([hellraiser, dummy]), live, 'shop-run');
  assert.equal(calls.length, 0);
  assert.equal(adapter.director.queue.filter(item => item.source === 'key_component').length, 1);
  assert.equal((adapter.director.queue[0].text.match(/务必拿下/g) || []).length <= 1, true);
  live.player.gold = 100;
  adapter.syncKeyComponents({ ...shop([hellraiser, dummy]), name: 'shop.updated' }, live, 'shop-run');
  assert.match(adapter.director.queue[0].text, /金币不足|只能优先其一|重点关注/);
  assert.doesNotMatch(adapter.director.queue[0].text, /两件都可以/);
  adapter.syncKeyComponents({ name: 'shop.updated', data: { visitId: 'shop:visit-1', gold: 100, items: [] } }, live, 'shop-run');
  assert.equal(adapter.director.queue.some(item => item.source === 'key_component'), false);
  adapter.syncKeyComponents(shop([hellraiser]), { ...live, player: { ...live.player, gold: 200 } }, 'shop-run');
  adapter.syncKeyComponents({ name: 'shop.closed', data: {} }, live, 'shop-run');
  assert.equal(adapter.director.queue.some(item => item.source === 'key_component'), false);
  adapter.syncKeyComponents(shop([hellraiser]), { ...live, player: { ...live.player, gold: 10 } }, 'shop-run');
  assert.match(adapter.director.queue[0].text, /金币不足/);
  assert.doesNotMatch(adapter.director.queue[0].text, /务必拿下/);
  now = 0;
  assert.equal(adapter.tick()[0].source, 'key_component');
  adapter.syncKeyComponents(shop([hellraiser]), { ...live, player: { ...live.player, gold: 10 } }, 'shop-run');
  assert.equal(adapter.director.queue.some(item => item.source === 'key_component'), false);
});

test('完美打击独立播报跨过战斗退出快照，不受火焰屏障首选影响且只播一次', async () => {
  let now = 0;
  const adapter = new DanmakuBridgeAdapter({ now: () => now });
  const cards = [...Array(5).fill({ id: 'STRIKE_IRONCLAD', name: '打击' }), ...Array(4).fill({ id: 'DEFEND_IRONCLAD', name: '防御' }), { id: 'BASH', name: '痛击' }];
  const combat = state({ cards });
  await adapter.ingestObservation(obs(1, combat), { runId: 'r' });
  const reward = { name: 'card.reward.opened', data: { opportunityId: 'perfect-reward', cards: [{ id: 'PERFECTED_STRIKE', name: '完美打击' }, { id: 'FLAME_BARRIER', name: '火焰屏障' }] } };
  adapter.syncKeyComponents(reward, combat, 'r');
  assert.ok(adapter.director.queue.some(item => item.source === 'key_component' && /完美打击/.test(item.text)));
  const after = state({ cards, combat: false }); after.run.room = 'card_reward';
  await adapter.ingestObservation(obs(2, after), { runId: 'r' });
  await adapter.ingestRecommendation({ id: 'rec-flame', task: 'card_reward', title: '拿「火焰屏障」', choice: { name: '火焰屏障' } }, { runId: 'r', observation: obs(2, after) });
  const first = adapter.tick()[0];
  assert.equal(first?.source, 'key_component'); assert.match(first.text, /完美打击/);
  assert.equal('reconfirm' in first, false);
  assert.deepEqual(structuredClone(first), first);
  now = 500; assert.equal(adapter.tick().some(item => item.source === 'recommendation'), false);
  adapter.syncKeyComponents(reward, after, 'r');
  assert.equal(adapter.director.queue.some(item => item.source === 'key_component'), false);
});

test('关闭奖励后异步建议和退出快照不复活核心提醒，新战斗也清掉旧机会', async () => {
  const adapter = new DanmakuBridgeAdapter();
  const input = state({ cards: [{ id: 'STRIKE_IRONCLAD', name: '打击' }] });
  await adapter.ingestObservation(obs(1, input), { runId: 'r' });
  const reward = { name: 'card.reward.opened', data: { opportunityId: 'closed', cards: [{ id: 'PERFECTED_STRIKE', name: '完美打击' }] } };
  adapter.syncKeyComponents(reward, input, 'r');
  adapter.syncKeyComponents({ name: 'card.reward.selected' }, input, 'r');
  await adapter.ingestObservation(obs(2, state({ combat: false })), { runId: 'r' });
  await adapter.ingestRecommendation({ id: 'late', task: 'card_reward', title: '旧建议' }, { runId: 'r' });
  assert.equal(adapter.director.queue.some(item => item.source === 'key_component'), false);
  adapter.syncKeyComponents(reward, input, 'r');
  const next = state(); next.run.floor = 2;
  await adapter.ingestObservation(obs(3, next), { runId: 'r' });
  assert.equal(adapter.keyOffer, null);
  assert.equal(adapter.director.queue.some(item => item.source === 'key_component'), false);
});

test('攻击、伤害、受伤与充足生命来自明确证据，重复/断线/切场不会伪造差分', () => {
  let now = 0;
  const m = new RunMemory({ now: () => now });
  const observe = (input, sceneId = 's') => m.observe(input, { runId: 'r', sceneId });
  const input = state({ hp: 72, cards: [{ id: 'STRIKE_IRONCLAD', name: '打击' }] });
  observe(input); observe(input);
  assert.equal(m.moments.filter(item => item.kind === 'high_hp').length, 1);
  m.claim(m.pending());
  const attack = { name: 'card.played', eventId: 'hit1', data: { cardId: 'STRIKE_IRONCLAD' } };
  m.event(attack, input); m.event(attack, input);
  assert.equal(m.moments.filter(item => item.kind === 'attack_played').length, 1);
  assert.match(m.pending()[0].text, /尚未确认命中/);
  const changed = state({ hp: 67, enemies: [{ id: 'NIBBIT', name: '小啃兽', hp: 11, maxHp: 20 }] });
  observe(changed); observe(changed);
  assert.equal(m.moments.filter(item => item.kind === 'player_hurt').length, 1);
  assert.equal(m.moments.filter(item => item.kind === 'damage_observed').length, 1);
  assert.match(m.moments.find(item => item.kind === 'damage_observed').text, /不能归于某张牌/);
  assert.match(m.moments.find(item => item.kind === 'player_hurt').text, /来源未知/);
  m.claim(m.pending());
  m.disconnect();
  observe(state({ hp: 30, enemies: [{ id: 'NIBBIT', name: '小啃兽', hp: 2 }] }));
  assert.equal(m.pending().length, 0);
  now += 9000;
  observe(state({ hp: 25, enemies: [{ id: 'NIBBIT', name: '小啃兽', hp: 1 }] }), 'new-scene');
  assert.equal(m.pending().length, 0);
  assert.equal(m.moments.filter(item => item.kind === 'player_hurt').length, 1);
});

test('生命充足每场只反应一次，怪物意图变化留作背景，不占用下一批主要主题', async () => {
  let now = 0; const contexts = [];
  const adapter = new DanmakuBridgeAdapter({ now: () => now, llmAtmosphere: { generate: async input => { contexts.push(input); return { status: 'generated', phrases: [] }; } } });
  await adapter.ingestObservation(obs(1, state({ hp: 80 })), { runId: 'r' }); await settle();
  assert.ok(contexts[0].moments.some(item => item.kind === 'high_hp'));
  assert.equal(contexts[0].optionalContext, true);
  const next = state({ hp: 80, enemies: [{ name: '小啃兽', id: 'NIBBIT', hp: 20, intent: 'DefendIntent', nextMoveName: '缩壳' }] });
  await adapter.ingestObservation(obs(2, next), { runId: 'r' });
  now = 15000; adapter.tick(); await settle();
  assert.equal(contexts[1].mode, 'quiet');
  assert.equal(contexts[1].moments.length, 0);
  assert.doesNotMatch(contexts[1].facts.join(' '), /生命|80/);
  assert.doesNotMatch(contexts[1].facts.join(' '), /缩壳|小啃兽/);
  assert.equal(contexts[1].snapshot.enemies[0].nextMoveName, '缩壳');
  assert.equal(adapter.director.queue.some(item => item.source === 'monster_skill'), false);
  const hurt = state({ hp: 60 });
  await adapter.ingestObservation(obs(3, hurt), { runId: 'r' });
  await adapter.ingestObservation(obs(4, state({ hp: 80 })), { runId: 'r' });
  assert.equal(adapter.memory.moments.filter(item => item.kind === 'high_hp').length, 1);
});

test('旧的高血量评论在掉血后失效，之后的受伤反应仍可说', async () => {
  let resolve;
  const adapter = new DanmakuBridgeAdapter({ llmAtmosphere: { generate: () => new Promise(done => { resolve = done; }) } });
  await adapter.ingestObservation(obs(1, state({ hp: 80 })), { runId: 'r' }); await settle();
  const highId = adapter.memory.moments.find(item => item.kind === 'high_hp').id;
  await adapter.ingestObservation(obs(2, state({ hp: 40 })), { runId: 'r' });
  assert.equal(adapter.memory.validMoment(highId), false);
  resolve({ status: 'generated', phrases: ['我还满是力气。'], commentaryByText: { '我还满是力气。': { momentId: highId, enemyKeys: [] } } });
  await settle();
  assert.equal(adapter.director.queue.some(item => item.source === 'ai'), false);
  assert.ok(adapter.memory.pending().some(item => item.kind === 'player_hurt'));
});

test('受伤或再次出手不会强制清掉有效的自由闲谈，普通台词无需绑定事件', async () => {
  let now = 0;
  const adapter = new DanmakuBridgeAdapter({ now: () => now, llmAtmosphere: { generate: async () => ({ status: 'generated', phrases: ['本想说句狠话。嫌长。'], commentaryByText: { '本想说句狠话。嫌长。': { momentId: null, enemyKeys: [] } } }) } });
  await adapter.ingestObservation(obs(1, state()), { runId: 'r' }); await settle();
  await adapter.ingestObservation(obs(2, state({ hp: 40 })), { runId: 'r' });
  adapter.tick(); // 优先技能，不能因受伤主题尚待生成而删除自由闲谈
  assert.ok(adapter.director.queue.some(item => item.text === '本想说句狠话。嫌长。'));
  now = 500;
  assert.equal(adapter.tick()[0].text, '本想说句狠话。嫌长。');
});

test('Mod含null库存键的商店快照可接收并生成推荐，重连无需opened也能提醒关键卡牌遗物', async () => {
  const { createObservationStore } = require('../../harness/observation-store');
  const { recommendShop } = require('../tasks/shop');
  const { validateRecommendation } = require('../recommendation');
  const adapter = new DanmakuBridgeAdapter();
  const store = createObservationStore();
  const input = { ...state({ combat: false, cards: [{ id: 'STRIKE_IRONCLAD', name: '打击' }, { id: 'POMMEL_STRIKE', name: '剑柄打击' }] }),
    schema: 'gamebuddy.state.v1', timestamp: 100, source: 'mod-nullable-shop', map: { visited: [] } };
  input.run.room = 'Merchant';
  Object.assign(input.player, { gold: 300, maxEnergy: 3, relics: [], potions: [] });
  input.shop = { gold: 300, items: [
    { index: 0, stockKey: 'card:0', itemType: 'card', id: 'HELLRAISER', name: '地狱狂徒', price: 80, stocked: true, card: { id: 'HELLRAISER', name: '地狱狂徒' } },
    { index: 1, stockKey: 'relic:0', itemType: 'relic', id: 'STRIKE_DUMMY', name: '打击木偶', price: 100, stocked: true },
    { index: 2, stockKey: null, itemType: 'service', id: 'CARD_REMOVAL', name: '删除一张牌', price: 75, stocked: true, card: null }
  ] };
  const ingested = store.ingest({ type: 'state', data: input }, 1000);
  assert.equal(ingested.kind, 'state'); assert.equal(ingested.accepted, true);
  const observation = store.getObservation(1001);
  await adapter.ingestObservation(observation, { runId: 'app-run' });
  const recommendation = await recommendShop(observation, { llm: { enabled: false }, codex: { loadDraftContext: async () => ({
    source: 'test-local', cards: input.shop.items.filter(item => item.card).map(item => item.card), deckCards: input.player.cards,
    relics: [], potions: [], threats: { knownUpcomingElites: [], possibleElites: [] }
  }) } });
  assert.equal(validateRecommendation(recommendation).ok, true);
  assert.equal(recommendation.inventory.length, 3);
  await adapter.ingestRecommendation(recommendation, { runId: 'app-run', observation });
  const alert = adapter.tick()[0];
  assert.equal(alert.source, 'key_component'); assert.match(alert.text, /地狱狂徒/); assert.match(alert.text, /打击木偶/);
  assert.deepEqual(structuredClone(alert), alert);
  adapter.syncKeyComponents({ name: 'shop.opened', data: { ...input.shop, visitId: 'real-visit' } }, input, 'app-run');
  assert.equal(adapter.director.queue.some(item => item.source === 'key_component' || item.source === 'recommendation'), false);
  await adapter.ingestObservation(obs(observation.sequence + 1, input), { runId: 'app-run' });
  assert.equal(adapter.director.queue.some(item => item.source === 'key_component'), false);
});

test('商店快照会更新未播提醒，已售出或离场不补播，新访问仍可提醒', async () => {
  const adapter = new DanmakuBridgeAdapter();
  const input = state({ combat: false, cards: [{ id: 'POMMEL_STRIKE', name: '剑柄打击' }] });
  input.run.room = 'Merchant'; input.player.gold = 100;
  input.shop = { gold: 100, items: [{ itemType: 'card', id: 'HELLRAISER', name: '地狱狂徒', price: 80, stockKey: null, stocked: true, card: { id: 'HELLRAISER', name: '地狱狂徒' } }] };
  await adapter.ingestObservation(obs(1, input), { runId: 'r' });
  assert.equal(adapter.director.queue.filter(item => item.source === 'key_component').length, 1);
  const sold = structuredClone(input); sold.player.gold = 20; sold.shop = { gold: 20, items: [] };
  await adapter.ingestObservation(obs(2, sold), { runId: 'r' });
  assert.equal(adapter.director.queue.some(item => item.source === 'key_component'), false);
  await adapter.ingestObservation(obs(3, input), { runId: 'r' });
  const away = structuredClone(input); away.run.room = 'map'; away.shop = null;
  await adapter.ingestObservation(obs(4, away), { runId: 'r' });
  assert.equal(adapter.keyOffer, null); assert.equal(adapter.director.queue.some(item => item.source === 'key_component'), false);
  await adapter.ingestObservation(obs(5, input), { runId: 'r' });
  assert.equal(adapter.tick()[0].source, 'key_component');
});

test('辅助牌按流派排队并分开去重，同一流派合并，一牌多流派互不吞提醒',()=>{
  let now=0;const adapter=new DanmakuBridgeAdapter({now:()=>now});
  const live=state({combat:false,cards:[]});live.run.character='silent';live.run.room='Shop';live.player.gold=200;
  const items=[{itemType:'card',id:'PIERCING_WAIL',price:24,stockKey:'card:0'}, {itemType:'card',id:'ABRASIVE',price:144,stockKey:'card:1'}];
  const event={name:'shop.opened',data:{visitId:'group-1',gold:200,items}};
  adapter.syncKeyComponents(event,live,'group-run');
  assert.equal(adapter.director.queue.length,2);
  const first=adapter.tick()[0];assert.match(first.text,/敏捷防线/);assert.match(first.text,/尖啸/);assert.match(first.text,/磨蚀/);
  adapter.syncKeyComponents({...event,name:'shop.updated'},live,'group-run');
  assert.equal(adapter.director.queue.length,1);assert.match(adapter.director.queue[0].text,/弃牌周转/);
  now=500;const second=adapter.tick()[0];assert.match(second.text,/磨蚀/);
  adapter.syncKeyComponents({...event,name:'shop.updated'},live,'group-run');assert.equal(adapter.director.queue.length,0);
  adapter.syncKeyComponents({name:'shop.closed'},live,'group-run');
  adapter.syncKeyComponents({...event,data:{...event.data,visitId:'group-2'}},live,'group-run');assert.equal(adapter.director.queue.length,2);
});
