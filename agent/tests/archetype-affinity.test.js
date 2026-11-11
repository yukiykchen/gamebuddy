const test = require('node:test');
const assert = require('node:assert/strict');
const { expand, references, variants, evaluate, evaluateAll, explainImpact, describeDirection, normalizeDeck } = require('../knowledge/archetype-affinity');
const { impactIroncladArchetypes, scoreIroncladArchetypes, decorateIroncladArchetypes } = require('../knowledge/ironclad-archetypes');
const ui = require('../../src/archetype-ui');
const deck = ids => ids.map(id => ({ id }));

test('每条完整教学参照满足自己的需求，参考自身满分不算独立验证', () => {
  for (const [key, plans] of Object.entries(variants)) {
    for (const plan of plans) {
      assert.match(plan.origin, /^https:\/\/spire-codex.com\/zhs\/runs\//);
      const result = evaluate(expand(plan.cards), [], key);
      assert.equal(result.score, 100, plan.id);
    }
  }
});

test('不同路线分别计算，缺黑暗之拥或无惧疼痛不硬截断其他功能', () => {
  const full = expand(references.exhaust.cards);
  const withoutPain = full.filter(c => c.id !== 'FEEL_NO_PAIN');
  const result = evaluate(withoutPain, [], 'exhaust');
  assert.equal(result.score, Math.max(...result.routes.map(route => route.score)));
  assert.ok(result.routes.some(route => route.referenceId === 'exhaust_draw'));
  assert.ok(result.score > 59);
  assert.equal(result.status, 'stable');
});

test('无关牌稀释、同功能替换、过量输出饱和和留存缺口', () => {
  const full = expand(references.block.cards);
  const score = cards => evaluate(cards, [], 'block').score;
  assert.ok(score([...full, ...deck(Array(10).fill('STRIKE_IRONCLAD'))]) < score(full));
  assert.ok(score([...full, ...deck(Array(3).fill('BODY_SLAM'))]) <= score(full));
  const substitute = [...full.filter(c => c.id !== 'BLOOD_WALL'), ...deck(['IMPERVIOUS', 'FLAME_BARRIER'])];
  assert.ok(score(substitute) >= 90);
  const withoutRetention = [...full.filter(c => c.id !== 'BARRICADE'), { id: 'UNMOVABLE' }];
  assert.ok(evaluate(withoutRetention, [], 'block').gaps.some(gap => gap.role === 'retention'));
});

test('契约终结不产生虚假抽牌，劫掠不是打击弹药，条件资源需触发', () => {
  const { cardGrants } = require('../knowledge/archetype-affinity');
  assert.equal(cardGrants({ id: 'PACTS_END' }, 'strength', []).resource, undefined);
  assert.equal(cardGrants({ id: 'PILLAGE' }, 'auto_strike', []).strikes, undefined);
  assert.equal(cardGrants({ id: 'DRUM_OF_BATTLE' }, 'strength', []).resource, 1);
  assert.equal(cardGrants({ id: 'DRUM_OF_BATTLE' }, 'strength', [{ id: 'TRUE_GRIT' }]).resource, 1.5);
  assert.ok(!cardGrants({ id: 'RUPTURE' }, 'strength', []).source);
  assert.ok(cardGrants({ id: 'RUPTURE' }, 'strength', [{ id: 'BLOODLETTING' }]).source > 0);
});

test('同牌在缺功能、配套齐全和过量时解释不同，并显示零或负增量', () => {
  const full = expand(references.block.cards);
  const missing = full.filter(c => c.id !== 'BARRICADE');
  const first = explainImpact(missing, [], { id: 'BARRICADE' }, 'block');
  const duplicate = explainImpact(full, [], { id: 'BARRICADE' }, 'block');
  assert.ok(first.deltaPoints > duplicate.deltaPoints);
  assert.equal(first.learningTag, 'synergy');
  assert.equal(duplicate.learningTag, 'redundant');
  assert.ok(duplicate.deltaPoints <= 0);
  const html = ui.renderCardImpacts([{ ...duplicate, id: 'block', name: '格挡壁垒', beforeScore: 100, afterScore: 100 + duplicate.deltaPoints }], []);
  assert.match(html, /同类功能已较充分/);
});

test('整分增量始终等于两次独立评分之差，输入与推荐排序不被改写', () => {
  const owned = expand(references.block.cards).filter(c => c.id !== 'BARRICADE');
  const snapshot = structuredClone(owned);
  for (const id of ['BARRICADE', 'UNMOVABLE', 'MANGLE', 'OFFERING', 'UNKNOWN_MOD_CARD', 'SCRAWL']) {
    const candidate = { id };
    const impacts = impactIroncladArchetypes(owned, [], candidate);
    const before = scoreIroncladArchetypes(owned), after = scoreIroncladArchetypes([...owned, candidate]);
    impacts.forEach((impact, index) => {
      assert.equal(impact.deltaPoints, after[index].score - before[index].score);
      assert.equal(impact.affinity, impact.afterScore);
      assert.ok(Number.isFinite(impact.deltaExact));
      assert.ok(impact.reason.length > 0);
    });
  }
  assert.deepEqual(owned, snapshot);
  const offers = [{ id: 'MANGLE', score: 90 }, { id: 'BARRICADE', score: 10 }];
  assert.deepEqual(decorateIroncladArchetypes('ironclad', owned, [], offers).map(c => [c.id, c.score]), offers.map(c => [c.id, c.score]));
});

test('起手不归类，缺启动有方向，分数优先于运转阶段；桌面与算法一致', () => {
  const initial = deck([...Array(5).fill('STRIKE_IRONCLAD'), ...Array(4).fill('DEFEND_IRONCLAD'), 'BASH']);
  assert.equal(describeDirection(evaluateAll(initial)).primary, null);
  const scores = [
    { id: 'auto_strike', name: '自动打击', score: 64, raw: 64, identity: true, status: 'missing_starter' },
    { id: 'strength', name: '力量', score: 35, raw: 35, identity: true, status: 'stable' }
  ];
  assert.equal(describeDirection(scores).primary, 'auto_strike');
  assert.deepEqual(ui.buildStatus(scores).archetypeIds, ['auto_strike', 'strength']);
  assert.match(ui.buildStatus(scores).label, /副方向/);
});

test('无 AI 也可复算，未知与动态效果标明不确定，版本不作为评分参数', () => {
  const full = expand(references.block.cards);
  const reversed = evaluate([...full].reverse(), [], 'block');
  assert.equal(reversed.score, evaluate(full, [], 'block').score);
  assert.equal(evaluate(full, [], 'block', 'old-version').score, evaluate(full, [], 'block', 'new-version').score);
  const unknown = evaluate([...full, { id: 'UNKNOWN_MOD_CARD' }], [], 'block');
  assert.equal(unknown.confidence, 'partial');
  assert.ok(unknown.unknownCards.includes('UNKNOWN_MOD_CARD'));
  assert.ok(unknown.dynamicUnknown.includes('MAD_SCIENCE'));
  assert.equal(normalizeDeck([{ id: 'POMMEL_STRIKE+' }])[0].upgraded, true);
  assert.deepEqual(evaluate(full, ['ANCHOR', 'ANCHOR'], 'block'), evaluate(full, ['ANCHOR'], 'block'));
});


test('输出供给超过一半、通用资源最多5%，核心打击不再被一张抽牌压过', () => {
  assert.ok(references.auto_strike.roles.output[0] + references.auto_strike.roles.strikes[0] > 50);
  for (const plans of Object.values(variants)) for (const p of plans) {
    assert.equal(Object.values(p.roles).reduce((sum, role) => sum + role[0], 0), 100);
    assert.ok(p.roles.resource[0] <= 5);
  }
  const initial = deck([...Array(5).fill('STRIKE_IRONCLAD'), ...Array(4).fill('DEFEND_IRONCLAD'), 'BASH']);
  for (const extra of [[], deck(['HELLRAISER', 'POMMEL_STRIKE'])]) {
    const owned = [...initial, ...extra];
    const perfect = explainImpact(owned, [], { id: 'PERFECTED_STRIKE' }, 'auto_strike');
    const ash = explainImpact(owned, [], { id: 'ASHEN_STRIKE' }, 'auto_strike');
    const shrug = explainImpact(owned, [], { id: 'SHRUG_IT_OFF' }, 'auto_strike');
    assert.ok(perfect.deltaPoints > ash.deltaPoints && ash.deltaPoints > shrug.deltaPoints);
    assert.ok(perfect.deltaPoints >= 10 && shrug.deltaPoints > 0 && shrug.deltaPoints <= 5);
    assert.match(perfect.reason, /打击牌数量/);
  }
});

test('凶恶缺易伤源不产生抽牌、存在来源也只计有限的条件支持', () => {
  const { cardGrants } = require('../knowledge/archetype-affinity');
  assert.equal(cardGrants({ id: 'VICIOUS' }, 'auto_strike', deck(['STRIKE_IRONCLAD'])).resource, undefined);
  assert.ok(cardGrants({ id: 'VICIOUS' }, 'auto_strike', deck(['BASH'])).resource < cardGrants({ id: 'SHRUG_IT_OFF' }, 'auto_strike', deck(['BASH'])).resource);
  assert.match(explainImpact(deck(['STRIKE_IRONCLAD']), [], { id: 'VICIOUS' }, 'auto_strike').reason, /没有可确认的易伤来源/);
});
