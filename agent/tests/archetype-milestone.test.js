const test = require('node:test');
const assert = require('node:assert/strict');
const { createArchetypeMilestoneTracker } = require('../../src/archetype-milestone');

function impact(cardId, archetypes) {
  return {
    type: 'draft_impact',
    signature: 'reward-1',
    impacts: [{ cardId, archetypes }]
  };
}

function archetype(id, beforeStage, afterStage, completedAxes = []) {
  return { id, beforeStage, afterStage, completedAxes };
}

test('确认拿牌后只为向上阶段跃迁生成一次反馈', () => {
  const tracker = createArchetypeMilestoneTracker();
  tracker.cache(impact('HELLRAISER', [
    archetype('auto_strike', 'unformed', 'started', ['auto_gate']),
    archetype('exhaust', 'unformed', 'unformed'),
    archetype('strength', 'started', 'started'),
    archetype('block', 'unformed', 'unformed')
  ]));
  const selection = { signature: 'reward-1', cardId: 'HELLRAISER', upgraded: false };
  const feedback = tracker.confirm(selection);
  assert.equal(feedback.level, 'started');
  assert.equal(feedback.title, '流派启动');
  assert.match(feedback.message, /自动打击.*自动打击核心接上了/);
  assert.equal(tracker.confirm(selection), null);
});

test('普通加分、签名不匹配、跳过和未知选择保持安静', () => {
  const tracker = createArchetypeMilestoneTracker();
  tracker.cache(impact('SHRUG_IT_OFF', [
    archetype('auto_strike', 'started', 'started', ['auto_loop']),
    archetype('exhaust', 'unformed', 'unformed'),
    archetype('strength', 'unformed', 'unformed'),
    archetype('block', 'unformed', 'unformed')
  ]));
  assert.equal(tracker.confirm({ signature: 'reward-1', cardId: 'SHRUG_IT_OFF', upgraded: false }), null);
  assert.equal(tracker.confirm({ signature: 'another', cardId: 'SHRUG_IT_OFF', upgraded: false }), null);
  assert.equal(tracker.confirm(null), null);
});

test('多流派跃迁合并为一条并优先展示成型', () => {
  const tracker = createArchetypeMilestoneTracker();
  tracker.cache(impact('FINISHER', [
    archetype('auto_strike', 'unformed', 'started', ['auto_payoff']),
    archetype('exhaust', 'started', 'formed', ['exhaust_payoff']),
    archetype('strength', 'unformed', 'started', ['strength_multihit']),
    archetype('block', 'started', 'started')
  ]));
  const feedback = tracker.confirm({ signature: 'reward-1', cardId: 'FINISHER', upgraded: true });
  assert.equal(feedback.level, 'formed');
  assert.equal(feedback.transitions.length, 3);
  assert.equal(feedback.transitions[0].id, 'exhaust');
  assert.equal(feedback.message, '消耗引擎、自动打击、力量叠加：核心循环完整了。');
});

test('只有确认拿牌且运转状态上升才反馈，预览和同分不庆祝', () => {
  const tracker = createArchetypeMilestoneTracker();
  tracker.cache(impact('HELLRAISER', [
    {
      id: 'auto_strike',
      beforeStatus: 'missing_starter',
      afterStatus: 'operational',
      beforeStage: 'unformed',
      afterStage: 'started',
      beforeScore: 48,
      afterScore: 52,
      completedFunctions: [{ id: 'auto_gate', label: '自动打击启动' }]
    },
    { id: 'exhaust', beforeStatus: 'missing_starter', afterStatus: 'missing_starter', beforeStage: 'unformed', afterStage: 'unformed' },
    { id: 'strength', beforeStatus: 'operational', afterStatus: 'operational', beforeStage: 'started', afterStage: 'started' },
    { id: 'block', beforeStatus: 'missing_starter', afterStatus: 'missing_starter', beforeStage: 'unformed', afterStage: 'unformed' }
  ]));
  const feedback = tracker.confirm({ signature: 'reward-1', cardId: 'HELLRAISER', upgraded: false });
  assert.equal(feedback.title, '可以运转');
  assert.match(feedback.message, /自动打击：可以运转/);
  assert.equal(tracker.confirm({ signature: 'reward-1', cardId: 'HELLRAISER', upgraded: false }), null);

  const quiet = createArchetypeMilestoneTracker();
  quiet.cache(impact('POMMEL_STRIKE', [
    { id: 'auto_strike', beforeStatus: 'operational', afterStatus: 'operational', beforeScore: 40, afterScore: 46, beforeStage: 'started', afterStage: 'started' },
    { id: 'exhaust', beforeStatus: 'missing_starter', afterStatus: 'missing_starter', beforeStage: 'unformed', afterStage: 'unformed' },
    { id: 'strength', beforeStatus: 'missing_starter', afterStatus: 'missing_starter', beforeStage: 'unformed', afterStage: 'unformed' },
    { id: 'block', beforeStatus: 'missing_starter', afterStatus: 'missing_starter', beforeStage: 'unformed', afterStage: 'unformed' }
  ]));
  assert.equal(quiet.confirm({ signature: 'reward-1', cardId: 'POMMEL_STRIKE', upgraded: false }), null);
});
