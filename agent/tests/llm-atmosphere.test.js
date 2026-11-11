'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DanmakuLlmAtmosphere } = require('../danmaku/llm-atmosphere');

const context = { character: 'ironclad', trigger: 'enemy_move', facts: ['小啃兽当前行动：攻击'] };

test('AI results are consumed once per context and select two distinct phrases', async () => {
  let now = 0;
  let calls = 0;
  const model = new DanmakuLlmAtmosphere({ now: () => now, llm: { enabled: true, completeDanmaku: async () => {
    calls += 1;
    return { phrases: ['这一下，记下了。', '又能往上走了。'] };
  } } });
  assert.deepEqual((await model.generate(context)).phrases, ['这一下，记下了。', '又能往上走了。']);
  now = 4000;
  assert.equal((await model.generate(context)).status, 'duplicate');
  assert.equal(calls, 1);
  now = 90_000;
  assert.equal((await model.generate(context)).status, 'generated');
  assert.equal(calls, 2);
});

test('concurrent consumers cannot replay the same pending response', async () => {
  let resolve;
  let calls = 0;
  const model = new DanmakuLlmAtmosphere({ llm: { enabled: true, completeDanmaku: () => {
    calls += 1;
    return new Promise(done => { resolve = done; });
  } } });
  const first = model.generate(context);
  assert.equal((await model.generate(context)).status, 'duplicate');
  resolve({ phrases: ['又能往上走了。'] });
  assert.equal((await first).status, 'generated');
  assert.equal(calls, 1);
});

test('different context still respects rate limit and recent-text exclusion', async () => {
  let now = 0;
  const payloads = [];
  const model = new DanmakuLlmAtmosphere({ now: () => now, llm: { enabled: true, completeDanmaku: async payload => {
    payloads.push(payload);
    return { phrases: ['这一下记下了！'] };
  } } });
  assert.equal((await model.generate({ ...context, recentTexts: ['这一下，记下了。'] })).status, 'duplicate');
  assert.deepEqual(payloads[0].recentTexts, ['这一下，记下了。']);
  assert.equal((await model.generate({ ...context, facts: ['新行动'] })).status, 'throttled');
  assert.equal(payloads.length, 1);
  now = 4000;
  assert.equal((await model.generate({ ...context, facts: ['新行动'] })).status, 'generated');
  now = 8000;
  assert.equal((await model.generate({ ...context, facts: ['另一行动'] })).status, 'duplicate');
});

test('unavailable, failed, malformed and deliberately silent outputs are distinguishable', async () => {
  assert.equal((await new DanmakuLlmAtmosphere().generate(context)).status, 'unavailable');
  for (const [completeDanmaku, expected] of [
    [async () => { throw new Error('timeout'); }, 'failed'],
    [async () => ({ phrases: ['http://bad.example'] }), 'failed'],
    [async () => ({}), 'failed'],
    [async () => ({ phrases: [] }), 'duplicate']
  ]) {
    const model = new DanmakuLlmAtmosphere({ llm: { enabled: true, completeDanmaku } });
    assert.equal((await model.generate(context)).status, expected);
    assert.equal(model.pending.size, 0);
  }
});


test('all five characters receive distinct persona styles and unknown character stays neutral', async () => {
  const { personalityFor, normalizeCharacter } = require('../danmaku/language-profile');
  const payloads = [];
  for (const character of ['ironclad', 'silent', 'defect', 'regent', 'necrobinder', 'unknown']) {
    const model = new DanmakuLlmAtmosphere({ llm: { enabled: true, completeDanmaku: async payload => {
      payloads.push(payload); return { phrases: [] };
    } } });
    await model.generate({ ...context, character });
    assert.equal(payloads.at(-1).style, personalityFor(character).style);
    assert.equal(payloads.at(-1).count, 2);
    assert.equal(payloads.at(-1).examples.length, 2);
  }
  assert.equal(new Set(payloads.map(item => item.style)).size, 6);
  assert.equal(payloads.at(-1).character, 'generic');
  assert.equal(normalizeCharacter('Necrobinder'), 'necrobinder');
  assert.equal(normalizeCharacter('亡灵契约师'), 'necrobinder');
  assert.equal(normalizeCharacter('储君'), 'regent');
});

test('periodic batch IDs bypass consumed context cache but keep output dedupe', async () => {
  let now = 0; let calls = 0;
  const model = new DanmakuLlmAtmosphere({ now: () => now, llm: { enabled: true, completeDanmaku: async () => {
    calls += 1;
    return { phrases: calls === 1 ? ['这一拳记下了。', '这一拳，记下了！'] : ['这一拳记下了。', '这伤疤也算个纪念。'] };
  } } });
  assert.equal((await model.generate({ ...context, batchId: 'one' })).phrases.length, 1);
  now = 15000;
  assert.deepEqual((await model.generate({ ...context, batchId: 'two' })).phrases, ['这伤疤也算个纪念。']);
  assert.equal(calls, 2);
});

test('60 second client accepts slow results and keeps the deadline through response body reading', async t => {
  const { createOpenAiClient } = require('../llm/openai');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(console, 'log', () => {});
  let request;
  const client = createOpenAiClient({ enabled: true, apiKey: 'test-only', model: 'test', baseURL: 'https://mock.invalid', wireApi: 'chat' }, {
    timeoutMs: 60_000,
    fetchImpl: async (_url, options) => {
      request = { ...options };
      return { ok: true, json: () => new Promise((resolve, reject) => {
        request.resolve = resolve;
        options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }) };
    }
  });
  const first = client.completeDanmaku({ character: 'regent', style: '矜贵自负', count: 2 });
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(16_000);
  assert.equal(request.signal.aborted, false);
  const body = JSON.parse(request.body);
  assert.match(body.messages[0].content, /生成 2 句/);
  assert.match(body.messages[0].content, /都是可选素材/);
  assert.match(body.messages[0].content, /两句可以说不同的事/);
  assert.doesNotMatch(body.messages[0].content, /优先围绕最高优先级的一件事/);
  request.resolve({ choices: [{ message: { content: '{"phrases":["这里的迎宾礼欠缺教养。","王冠可以歪，仪态不能。"]}' } }] });
  assert.equal((await first).phrases.length, 2);
  const second = client.completeDanmaku({ character: 'silent' });
  const rejection = assert.rejects(second, /aborted/);
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(59_999);
  assert.equal(request.signal.aborted, false);
  t.mock.timers.tick(1);
  assert.equal(request.signal.aborted, true);
  await rejection;
});

test('scene abort propagates without changing other clients default 120 second timeout', async t => {
  const { createOpenAiClient } = require('../llm/openai');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(console, 'log', () => {});
  const requests = [];
  const client = createOpenAiClient({ enabled: true, apiKey: 'test-only', model: 'test', baseURL: 'https://mock.invalid' }, {
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      requests.push(options);
      options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    })
  });
  const controller = new AbortController();
  const first = client.completeDanmaku({}, { signal: controller.signal });
  const firstRejection = assert.rejects(first, /aborted/);
  controller.abort();
  await firstRejection;
  const second = client.completeDanmaku({});
  const secondRejection = assert.rejects(second, /aborted/);
  t.mock.timers.tick(60_000);
  assert.equal(requests[1].signal.aborted, false);
  t.mock.timers.tick(60_000);
  await secondRejection;
});

test('人格例子覆盖多种可选角度，近似换词复述被过滤', async () => {
  let payload;
  const model = new DanmakuLlmAtmosphere({ llm: { enabled: true, completeDanmaku: async input => {
    payload = input;
    return { phrases: ['这一下真疼，但我还站得住。', '疼归疼，手还握得住。'] };
  } } });
  const result = await model.generate({ ...context, reactionFocus: 'player_hurt', recentTexts: ['这一下很疼，但我还站得住。'] });
  assert.equal(payload.reactionFocus, undefined);
  assert.match(payload.topicPolicy, /可选素材/);
  assert.ok(Object.keys(payload.scenarioExamples).length >= 5);
  assert.ok(Object.keys(payload.creativeAngles).length >= 10);
  assert.ok(Object.keys(payload.scenarioExamples).some(key => ['self_mockery', 'observation', 'atmosphere', 'journey', 'banter', 'card', 'enemy'].includes(key)));
  assert.deepEqual(result.phrases, ['疼归疼，手还握得住。']);
});

test('血量与防御换词复述受主题冷却，其他话题照常通过，后续请求看到实际历史', async () => {
  let now = 0; const payloads = [];
  const batches = [
    [{ text: '血量已经不多了。', topic: 'health', motif: '残血担忧' }, { text: '这点格挡不太够。', topic: 'defense', motif: '缺少防御' }],
    [{ text: '剩下的生命没多少了。', topic: 'banter', motif: '生命不足' }, { text: '现在几乎没有护甲。', topic: 'other', motif: '护甲不足' }],
    [{ text: '我本想夸一句，话到嘴边又省了。', topic: 'self_mockery', motif: '夸奖说不出口' }, { text: '这名字听着很有分量。', topic: 'card', motif: '名字很有分量' }],
    [{ text: '这会儿血量还是很少。', topic: 'health', motif: '残血担忧' }]
  ];
  const model = new DanmakuLlmAtmosphere({ now: () => now, llm: { enabled: true, completeDanmaku: async payload => { payloads.push(payload); return { phrases: batches[payloads.length - 1] }; } } });
  const generate = batchId => model.generate({ runId: 'r', character: 'ironclad', batchId });
  assert.equal((await generate('one')).phrases.length, 2);
  now = 15000; assert.equal((await generate('two')).phrases.length, 0);
  assert.deepEqual(payloads[1].avoidTopics, ['health', 'defense']);
  assert.equal(payloads[1].recentTopics.length, 2);
  assert.equal('player_hurt' in payloads[1].scenarioExamples, false);
  now = 30000; assert.equal((await generate('three')).phrases.length, 2);
  now = 120000; assert.equal((await generate('four')).phrases.length, 1);
});

test('相同笑点不同句子被抑制，并发返回会重新读取主题历史', async () => {
  let now = 0; const pending = [];
  const model = new DanmakuLlmAtmosphere({ now: () => now, llm: { enabled: true, completeDanmaku: () => new Promise(resolve => pending.push(resolve)) } });
  const one = model.generate({ runId: 'r', character: 'ironclad', batchId: 'one' });
  now = 15000;
  const two = model.generate({ runId: 'r', character: 'ironclad', batchId: 'two' });
  pending[0]({ phrases: [{ text: '血还没有流干。', topic: 'health', motif: '尚能生存' }] });
  assert.equal((await one).phrases.length, 1);
  pending[1]({ phrases: [{ text: '这生命值快见底了。', topic: 'health', motif: '生命担忧' }] });
  assert.equal((await two).phrases.length, 0);
  now = 30000;
  model.llm.completeDanmaku = async () => ({ phrases: ['倒是还站得很直。', '我还没倒下，别急。'] });
  assert.equal((await model.generate({ runId: 'r', character: 'ironclad', batchId: 'three' })).phrases.length, 0, '还站着也是生存话题，不能改成闲谈标签绕过冷却');
  now = 45000;
  assert.equal((await model.generate({ runId: 'r', character: 'ironclad', batchId: 'four' })).phrases.length, 0);
  now = 135000; // 第一批在15秒时才返回，冷却从接受时计时
  assert.equal((await model.generate({ runId: 'r', character: 'ironclad', batchId: 'five' })).phrases.length, 1);
});

test('话题记忆按局与角色隔离且有容量上限，旧字符串返回仍能工作', async () => {
  let now = 0;
  const model = new DanmakuLlmAtmosphere({ now: () => now, llm: { enabled: true, completeDanmaku: async () => ({ phrases: ['这点血量实在不多。'] }) } });
  await model.generate({ runId: 'one', character: 'ironclad' });
  now = 15000;
  assert.deepEqual(model.variety.constraints({ runId: 'two', character: 'ironclad' }).avoidTopics, []);
  assert.deepEqual(model.variety.constraints({ runId: 'one', character: 'silent' }).avoidTopics, []);
  assert.deepEqual(model.variety.constraints({ runId: 'one', character: 'ironclad' }).avoidTopics, ['health']);
  for (let i = 0; i < 100; i++) model.variety.accept({ runId: 'bounded', character: 'silent' }, { text: `不同观察${i}`, topic: 'observation', motif: `不同观察${i}` });
  assert.ok(model.variety.scope({ runId: 'bounded', character: 'silent' }).length <= 48);
  for (let i = 0; i < 20; i++) model.variety.constraints({ runId: `run-${i}`, character: 'ironclad' });
  assert.ok(model.variety.scopes.size <= 8);
});

test('五角色每人有丰富跨话题例子，抽样不要求强制轮换输出或虚构回忆', () => {
  const { personalityFor } = require('../danmaku/language-profile');
  const { exampleSample } = require('../danmaku/variety');
  for (const key of ['ironclad', 'silent', 'defect', 'regent', 'necrobinder']) {
    const profile = personalityFor(key);
    assert.ok(Object.keys(profile.scenarioExamples).length >= 13);
    assert.ok(Object.values(profile.scenarioExamples).flat().length >= 26);
    const first = exampleSample(profile, 0), next = exampleSample(profile, 1);
    assert.ok(Object.keys(first).length <= 6);
    assert.notDeepEqual(first, next);
    assert.equal('memory' in first, false);
  }
});

test('卡名痛击不会因为痛字被误算成疼痛话题', () => {
  const { conditionTopics } = require('../danmaku/variety');
  assert.deepEqual(conditionTopics('痛击这个名字，倒是省解释。'), []);
  assert.deepEqual(conditionTopics('这一下很痛。'), ['health']);
});


test('旧血量格挡不反复灌入模型，只有新的可用状态素材带生命数值，怪物笑话不连说', async () => {
  let now = 0; const payloads = [];
  const model = new DanmakuLlmAtmosphere({ now: () => now, llm: { enabled: true, completeDanmaku: async input => {
    payloads.push(input); return { phrases: payloads.length === 1 ? [{ text: '生命不多，但脑子还清楚。', topic: 'health' }] : [] };
  } } });
  const input = { runId: 'r', character: 'ironclad', snapshot: { player: { hp: 12, maxHp: 80, block: 0, energy: 1 }, enemies: [] }, facts: ['自己的生命12/80。'], moments: [{ id: 'low', kind: 'low_hp', text: '生命低。' }] };
  await model.generate({ ...input, batchId: 'one' });
  assert.equal(payloads[0].snapshot.player.hp, 12);
  assert.equal(payloads[0].snapshot.player.block, undefined);
  now = 15000;
  await model.generate({ ...input, batchId: 'two' });
  assert.deepEqual(payloads[1].snapshot.player, {});
  assert.equal(payloads[1].moments.length, 0);
  assert.deepEqual(payloads[1].facts, []);
  const { CommentaryVariety } = require('../danmaku/variety');
  const variety = new CommentaryVariety({ now: () => now });
  assert.equal(variety.accept(input, { text: '磨牙磨得挺认真。', topic: 'enemy' }), true);
  now += 15000;
  assert.equal(variety.accept(input, { text: '这份牙口可真勤快。', topic: 'other' }), false);
  assert.ok(variety.constraints(input).avoidTopics.includes('enemy'));
});


test('同一怪物的两句换标签也只能接收一条，不能假扮氛围话题绕过', async () => {
  const model = new DanmakuLlmAtmosphere({ llm: { enabled: true, completeDanmaku: async () => ({ phrases: [
    { text: '血条薄得能透光，我还在看它磨牙。', topic: 'health', enemyKeys: ['e'] },
    { text: '塔里只有一嘴牙等着你。', topic: 'atmosphere', enemyKeys: ['e'] }
  ] }) } });
  const result = await model.generate({ runId: 'r', character: 'ironclad', snapshot: { player: {}, enemies: [{ key: 'e', name: '小啃兽' }] } });
  assert.equal(result.phrases.length, 1);
  assert.deepEqual(model.variety.constraints({ runId: 'r', character: 'ironclad' }).avoidTopics, ['health', 'enemy']);
});


test('真实试生成暴露的残血比喻和站直换词不能改标签绕过主题冷却', async () => {
  let now = 0; let call = 0;
  const rows = [
    [{ text: '这点血，像件穿旧了的盔甲，还披着。', topic: 'self_mockery', motif: '旧盔甲自嘲' }],
    [{ text: '手边没剩多少气力，站直就行。', topic: 'self_mockery', motif: '站直就行' }],
    [{ text: '站直就行，剩下的路又不长嘴。', topic: 'journey', motif: '路不长嘴' }],
    [{ text: '血不多了，脾气倒还剩一点。', topic: 'self_mockery', motif: '脾气剩一点' }]
  ];
  const model = new DanmakuLlmAtmosphere({ now: () => now, llm: { enabled: true, completeDanmaku: async () => ({ phrases: rows[call++] }) } });
  const output = [];
  for (let i = 0; i < rows.length; i++) { now = i * 15000; output.push((await model.generate({ runId: 'r', character: 'ironclad', batchId: `b${i}` })).phrases.length); }
  assert.deepEqual(output, [1, 0, 0, 0]);
});

test('五角色实际请求携带独立声音规则，含节奏用词笑点与性格反差', async () => {
  const voices = [];
  for (const character of ['ironclad', 'silent', 'defect', 'regent', 'necrobinder']) {
    const model = new DanmakuLlmAtmosphere({ llm: { enabled: true, completeDanmaku: async payload => { voices.push(payload.voice); return { phrases: [] }; } } });
    await model.generate({ character });
  }
  assert.equal(new Set(voices.map(voice => JSON.stringify(voice))).size, 5);
  for (const voice of voices) for (const key of ['rhythm', 'diction', 'humor', 'contradiction']) assert.ok(voice[key]?.length > 8);
});


test('写作示例不再是黑名单，首次生成可以播放', async () => {
  const model = new DanmakuLlmAtmosphere({ llm: { enabled: true, completeDanmaku: async () => ({ phrases: ['手没抖，够了。', '这名字倒像个不肯解释的家伙。'] }) } });
  const result = await model.generate({ character: 'ironclad' });
  assert.deepEqual(result.phrases, ['手没抖，够了。', '这名字倒像个不肯解释的家伙。']);
});

test('机器人与骨头人别名通过真实请求链路保留专属反应及系统声音摘要', async t => {
  const { createOpenAiClient } = require('../llm/openai');
  const { personalityFor } = require('../danmaku/language-profile');
  t.mock.method(console, 'log', () => {});
  const requests = [];
  for (const [character, wireApi] of [['机器人', 'chat'], ['骨头人', 'responses']]) {
    const client = createOpenAiClient({ enabled: true, apiKey: 'test-only', model: 'test', baseURL: 'https://mock.invalid', wireApi }, {
      fetchImpl: async (_url, options) => {
        requests.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ choices: [{ message: { content: '{"phrases":[]}' } }] }) };
      }
    });
    await new DanmakuLlmAtmosphere({ llm: client }).generate({ character, runId: 'synthetic' });
  }
  const robotSystem = requests[0].messages[0].content;
  const necroSystem = requests[1].instructions;
  const robot = JSON.parse(requests[0].messages[1].content);
  const necro = JSON.parse(requests[1].input);
  assert.equal(robot.character, 'defect'); assert.equal(necro.character, 'necrobinder');
  assert.match(robotSystem.slice(robotSystem.indexOf('本次唯一说话者')), /机械思维与意愿/);
  assert.match(necroSystem.slice(necroSystem.indexOf('本次唯一说话者')), /家常逻辑面对诡异/);
  assert.doesNotMatch(robotSystem.slice(robotSystem.indexOf('本次唯一说话者')), /亡灵契约师/);
  assert.doesNotMatch(necroSystem.slice(necroSystem.indexOf('本次唯一说话者')), /故障机器人/);
  assert.match(robot.reactions.attack_played, /机械式/);
  assert.match(necro.reactions.attack_played, /家务/);
  assert.match(robot.reactions.player_hurt, /个人不满/);
  assert.match(necro.reactions.player_hurt, /衣物/);
  assert.deepEqual(robot.voice.contrasts, personalityFor('defect').voice.contrasts);
  assert.deepEqual(necro.voice.contrasts, personalityFor('necrobinder').voice.contrasts);
  assert.equal(robot.topicPolicy, necro.topicPolicy);
  assert.match(robot.topicPolicy, /不是每场\/每批必说/);
});

test('人格改写对照也只作参考，未出现过时不因示例身份被过滤', async () => {
  const { personalityFor } = require('../danmaku/language-profile');
  for (const character of ['defect', 'necrobinder']) {
    const example = personalityFor(character).voice.contrasts[0];
    const model = new DanmakuLlmAtmosphere({ llm: { enabled: true, completeDanmaku: async () => ({
      phrases: [example.inVoice, example.neutral, '这里的台阶倒是不懂什么叫客气。']
    }) } });
    assert.deepEqual((await model.generate({ character })).phrases, [example.inVoice, example.neutral]);
  }
});

test('机器人示例加词改写仍可播出，只有几乎照抄样句才过滤', async () => {
  const model = new DanmakuLlmAtmosphere({ llm: { enabled: true, completeDanmaku: async () => ({
    phrases: ['动作已经结束了。想再挥一次，不是动作的一部分。']
  }) } });
  assert.deepEqual((await model.generate({ character: 'defect' })).phrases, ['动作已经结束了。想再挥一次，不是动作的一部分。']);
});

test('不因机器人归类或契约师待客用词拦截不同台词，真正重复仍过滤', async () => {
  for (const [character, rows] of [
    ['defect', ['这种心情不便归档，我想单独留着。', '归类的时候，我偏偏不想把它放进去。']],
    ['necrobinder', ['给奇怪的念头留个位置，免得它无处可去。', '这份沉默也值得留一张凳子吧。']]
  ]) {
    let now = 0, call = 0;
    const model = new DanmakuLlmAtmosphere({ now: () => now, llm: { enabled: true, completeDanmaku: async () => ({
      phrases: [{ text: rows[call++], topic: 'other', motif: `改标-${call}` }]
    }) } });
    assert.equal((await model.generate({ character, runId: 'r', batchId: 'one' })).phrases.length, 1);
    now = 15000;
    assert.equal((await model.generate({ character, runId: 'r', batchId: 'two' })).phrases.length, 1);
    now = 90001; call = 1;
    assert.equal((await model.generate({ character, runId: 'r', batchId: 'three' })).phrases.length, 0);
  }
});

test('五人格统一只因真实历史拒绝同一句，配置中的例子本身不触发黑名单', async () => {
  const { personalityFor } = require('../danmaku/language-profile');
  for (const character of ['ironclad', 'silent', 'defect', 'regent', 'necrobinder']) {
    let now = 0;
    const text = personalityFor(character).examples[0];
    const model = new DanmakuLlmAtmosphere({ now: () => now, llm: { enabled: true, completeDanmaku: async () => ({ phrases: [text] }) } });
    assert.deepEqual((await model.generate({ character, batchId: 'first' })).phrases, [text]);
    now = 4000;
    assert.deepEqual((await model.generate({ character, batchId: 'second' })).phrases, []);
  }
});

test('已知唯一怪物名称或ID可还原实例key，未知目标或时刻仍不误作有效句子', async () => {
  const model = new DanmakuLlmAtmosphere({ llm: { enabled: true, completeDanmaku: async () => ({ phrases: [
    { text: '这场交锋里，倒不缺脾气。', enemyKeys: ['NIBBIT'] },
    { text: '这个目标并不存在，不能保留。', enemyKeys: ['UNKNOWN'] },
    { text: '这个时刻并不存在，不能保留。', momentId: 'unknown-moment' }
  ] }) } });
  const result = await model.generate({ character: 'defect', snapshot: { enemies: [{ id: 'NIBBIT', key: 'NIBBIT#0', name: '小啃兽' }] } });
  assert.deepEqual(result.phrases, ['这场交锋里，倒不缺脾气。']);
  assert.deepEqual(result.commentaryByText[result.phrases[0]].enemyKeys, ['NIBBIT#0']);
});

test('模型无效响应明确记录失败，不再把零条输出记成成功', async () => {
  const logs = [];
  const model = new DanmakuLlmAtmosphere({ onLog: entry => logs.push(entry), llm: { enabled: true, completeDanmaku: async () => null } });
  assert.equal((await model.generate({ character: 'defect' })).reason, 'invalid_response');
  assert.equal(logs[0].event, 'failed');
});
