const test = require('node:test');
const assert = require('node:assert/strict');
const {
  escapeHtml,
  buildStatus,
  selectCardImpacts,
  renderOverview,
  renderCardImpacts
} = require('../../src/archetype-ui');

const scores = [
  { id: 'auto_strike', name: '自动打击流', score: 18, stage: 'started' },
  { id: 'exhaust', name: '消耗引擎', score: 42, stage: 'started' },
  { id: 'strength', name: '力量叠加', score: 12, stage: 'unformed' },
  { id: 'block', name: '格挡壁垒', score: 7, stage: 'unformed' }
];

test('主流派状态覆盖阈值、唯一最高、并列和未成型', () => {
  assert.deepEqual(buildStatus(scores), {
    kind: 'primary',
    label: '主方向 · 消耗引擎 · 可以运转',
    archetypeIds: ['exhaust']
  });
  assert.equal(buildStatus(scores.map(item => ({ ...item, score: item.id === 'auto_strike' ? 42 : item.score }))).kind, 'mixed');
  assert.equal(buildStatus(scores.map(item => ({ ...item, score: 14, stage: 'unformed' }))).kind, 'unformed');
  assert.equal(buildStatus(scores.map(item => ({
    ...item,
    score: item.id === 'exhaust' ? 15 : 3,
    stage: item.id === 'exhaust' ? 'started' : 'unformed'
  }))).kind, 'unformed');
});

test('候选增量显式优先、绝对值降序、固定流派顺序且最多两条', () => {
  const selected = selectCardImpacts([
    { id: 'block', deltaPoints: -8, explicit: false },
    { id: 'strength', deltaPoints: 3, explicit: true },
    { id: 'exhaust', deltaPoints: -3, explicit: true },
    { id: 'auto_strike', deltaPoints: 9, explicit: false }
  ], scores);
  assert.deepEqual(selected.map(item => item.id), ['exhaust', 'strength']);
  assert.equal(selected.length, 2);
});

test('全是纯稀释时只显示当前最高流派的一条', () => {
  const selected = selectCardImpacts([
    { id: 'auto_strike', deltaPoints: -2, explicit: false },
    { id: 'exhaust', deltaPoints: -1, explicit: false },
    { id: 'strength', deltaPoints: -3, explicit: false },
    { id: 'block', deltaPoints: -1, explicit: false }
  ], scores);
  assert.deepEqual(selected.map(item => item.id), ['exhaust']);
});

test('铜铁面板显示四套构筑点和阶段，候选给出真实前后点数与跃迁', () => {
  const overview = renderOverview(scores);
  assert.match(overview, /archetype-iron-plate/);
  assert.match(overview, /契合度衡量教学路线的贴合程度，不等于胜率或拿牌优先级/);
  assert.match(overview, /主方向 · 消耗引擎 · 可以运转/);
  for (const item of scores) {
    assert.match(overview, new RegExp(item.name));
    assert.match(overview, new RegExp(`契合度 ${item.score}`));
  }
  const positive = renderCardImpacts([
    {
      id: 'exhaust', name: '消耗引擎', beforeScore: 42, afterScore: 45, deltaPoints: 3,
      beforeStage: 'unformed', afterStage: 'started', completedAxes: ['exhaust_outlet'],
      explicit: true, reason: '出口'
    }
  ], scores);
  const negative = renderCardImpacts([
    {
      id: 'strength', name: '力量叠加', beforeScore: 18, afterScore: 16, deltaPoints: -2,
      beforeStage: 'started', afterStage: 'started', completedAxes: [],
      explicit: true, reason: '稀释'
    }
  ], scores);
  assert.match(positive, /消耗引擎：契合度 42 → 45（\+3） · 可以运转/);
  assert.match(positive, /补齐：消耗出口/);
  assert.match(positive, /milestone/);
  assert.match(positive, /archetype-impact positive/);
  assert.doesNotMatch(positive, /%/);
  assert.match(negative, /力量叠加：契合度 18 → 16（-2）/);
  assert.doesNotMatch(negative, /可以运转|稳定成型|已启动|已成型/);
  assert.match(negative, /archetype-impact negative/);
});

test('流派 HTML 输出转义名称和原因', () => {
  const hostile = '<img src=x onerror="boom">&\'';
  assert.equal(escapeHtml(hostile), '&lt;img src=x onerror=&quot;boom&quot;&gt;&amp;&#39;');
  const overview = renderOverview([{ id: 'exhaust', name: hostile, score: 20 }]);
  const impacts = renderCardImpacts([
    {
      id: 'exhaust', name: hostile, beforeScore: 20, afterScore: 22, deltaPoints: 2,
      beforeStage: 'started', afterStage: 'started', completedAxes: [], explicit: true, reason: hostile
    }
  ], [{ id: 'exhaust', score: 20 }]);
  assert.doesNotMatch(overview, /<img/);
  assert.doesNotMatch(impacts, /<img/);
  assert.match(impacts, /&lt;img/);
  assert.match(impacts, /契合度衡量教学路线的贴合程度，不等于胜率或拿牌优先级/);
});

test('契合度文案列出运转状态和功能，分数上升但不改状态时不显示启动', () => {
  const overview = renderOverview([{
    id: 'auto_strike',
    name: '自动打击流',
    score: 72,
    readiness: 72,
    status: 'missing_starter',
    statusLabel: '尚缺启动组件；已有部分配套',
    presentFunctions: [{ id: 'auto_loop', label: '抽牌循环' }],
    missingFunctions: [{ id: 'auto_gate', label: '自动打击启动' }]
  }]);
  assert.match(overview, /自动打击流：契合度 72 \/ 尚缺启动组件；已有部分配套/);
  assert.match(overview, /已有：抽牌循环/);
  assert.match(overview, /待补足：自动打击启动/);
  const sameStatus = renderCardImpacts([{
    id: 'auto_strike',
    name: '自动打击流',
    beforeScore: 70,
    afterScore: 72,
    deltaPoints: 2,
    beforeStatus: 'missing_starter',
    afterStatus: 'missing_starter',
    beforeStage: 'unformed',
    afterStage: 'unformed',
    completedAxes: [],
    completedFunctions: [],
    explicit: true,
    reason: '抽牌'
  }], []);
  assert.match(sameStatus, /契合度 70 → 72（\+2）/);
  assert.doesNotMatch(sameStatus, /可以运转|稳定成型|启动|成型/);
});
