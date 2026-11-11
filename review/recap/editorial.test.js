const test = require('node:test');
const assert = require('node:assert/strict');
const { makeTimeline } = require('./facts');
const { candidateDiagnostics, selectStories } = require('./stories');

const facts = [{ eventId: 'e', eventType: 'run.observed', runId: 'r', sourceSessionId: 's', sourceSeq: 1,
  payload: { hp: 28, maxHp: 80, totalFloor: 17, combat: { enemies: [{ hp: 1, name: '灵魂异鱼' }], turn: 10 } } }];
const t = makeTimeline('r', facts);
const candidate = { title: '异鱼先把血条藏起来了', bodyTemplate: '灵魂异鱼只剩{{enemy}}血，你还剩{{hp}}血，双方都在等最后一击。',
  evidenceIds: ['unknown_optional_reference'], bindings: { enemy: { claimIndex: 0 }, hp: { claimIndex: 1 } },
  assertions: [{ type: 'event_field', eventId: 'e', field: 'combat.enemies.0.hp', value: 1 },
    { type: 'event_field', eventId: 'e', field: 'hp', value: 28 }, { type: 'entity_name', subjectId: 'unknown', value: '灵魂异鱼' }] };
const diagnose = value => candidateDiagnostics(t, [value], { preserveModelVoice: true })[0];

test('supported numbers survive missing name lookup and optional reference', () => {
  assert.equal(diagnose(candidate).accepted, true);
});

test('a long readable story retains the model wording', () => {
  const title = '血条都快见底，谁都没从这场对峙里先退开';
  const bodyTemplate = candidate.bodyTemplate + '刀还悬在半空，药瓶也空着，屏幕前的人跟着一起憋气。那种感觉就像下楼梯时脚下突然踏空，心里还在盘算刚才那张牌打得值不值。';
  const [card] = selectStories(t, [{ ...candidate, title, bodyTemplate }], { preserveModelVoice: true });
  assert.equal(card?.title, title);
  assert.ok(card.body.endsWith('值不值。'));
});

test('wrong numbers and absolute values presented as gains are rejected', () => {
  const wrong = { ...candidate, assertions: candidate.assertions.map((c, i) => i === 1 ? { ...c, value: 29 } : c) };
  assert.equal(diagnose(wrong).reason, 'unsupported_numeric_assertion');
  const delta = { ...candidate, title: '涨上限', bodyTemplate: '上限增加{{n}}', bindings: { n: { claimIndex: 0 } },
    assertions: [{ type: 'event_field', eventId: 'e', field: 'maxHp', value: 80 }] };
  assert.equal(diagnose(delta).reason, 'absolute_value_used_as_delta');
});

test('engineering jargon and definite counterfactual victory are rejected', () => {
  assert.equal(diagnose({ ...candidate, bodyTemplate: '它准备StatusIntent' }).reason, 'unreadable_wording');
  assert.equal(diagnose({ ...candidate, bodyTemplate: '这场本来可以赢。' }).reason, 'unsupported_counterfactual_wording');
  assert.equal(diagnose({ ...candidate, bodyTemplate: '这回牺牲手牌换喘息。' }).accepted, true);
  assert.equal(diagnose({ ...candidate, bodyTemplate: '打完还剩−28血。' }).reason, 'unbound_number');
});

test('partial health must not be called full health', () => {
  const partial = { ...candidate, title: '先回满血', bodyTemplate: '现在{{hp}}/{{max}}',
    evidenceIds: ['e'], bindings: { hp: { claimIndex: 0 }, max: { claimIndex: 1 } },
    assertions: [{ type: 'event_field', eventId: 'e', field: 'hp', value: 28 },
      { type: 'event_field', eventId: 'e', field: 'maxHp', value: 80 }] };
  assert.equal(diagnose(partial).reason, 'full_health_does_not_match_numbers');
});

test('chapter and floor labels use matching overview fields without licensing other numeric claims', () => {
  const withAct = makeTimeline('r', [...facts, { eventId: 'act2', eventType: 'run.observed', runId: 'r', sourceSessionId: 's',
    sourceSeq: 2, payload: { act: 2, totalFloor: 18 } }]);
  assert.equal(candidateDiagnostics(withAct, [{ ...candidate, bodyTemplate: candidate.bodyTemplate + '随后进入第二幕。' }])[0].accepted, true);
  assert.equal(diagnose({ ...candidate, bodyTemplate: '到第17层时，血条也在报警。' }).accepted, true);
  assert.equal(diagnose({ ...candidate, bodyTemplate: '玩家打出了17点伤害。' }).reason, 'unbound_number');
});

test('a literal turn may use its cited observations without licensing the same number as damage', () => {
  const story = { ...candidate, evidenceIds: ['e'] };
  assert.equal(diagnose({ ...story, bodyTemplate: story.bodyTemplate + '第10回合，谁先眨眼谁输。' }).accepted, true);
  assert.equal(diagnose({ ...story, bodyTemplate: '第11回合，谁先眨眼谁输。' }).reason, 'unbound_number');
  assert.equal(diagnose({ ...story, bodyTemplate: '这回合打了10点伤害。' }).reason, 'unbound_number');
});

test('titles reject numeric details and the body retains them', () => {
  for (const title of ['52加49，金币先瘦一圈', '五十二加四十九，金币先瘦一圈', '异鱼只剩1血', '第十回合', '还有两瓶药', '三加四，金币大逃亡', '只剩１血', '金币只剩十！']) {
    assert.equal(diagnose({ ...candidate, title }).reason, 'number_in_title');
  }
  const [card] = selectStories(t, [candidate], { preserveModelVoice: true });
  assert.equal(card.title, candidate.title);
  assert.match(card.body, /只剩1血，你还剩28血/);
});
