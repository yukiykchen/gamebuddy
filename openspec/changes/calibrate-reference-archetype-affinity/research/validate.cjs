const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { expand, references, evaluate, evaluateAll, describeDirection, cardIndex, cardGrants } = require('./affinity-prototype.cjs');
const samples = require('./samples.json');
const root = path.resolve(__dirname, '../../../..');
const { scoreIroncladArchetypes } = require(path.join(root, 'agent/knowledge/ironclad-archetypes'));
const checks = [];
const check = (name, body) => { body(); checks.push({ name, passed: true }); };
const rows = [];

check('五套验证样本与真实参照分离，数量、版本、模式一致', () => {
  assert.equal(samples.validation.length, 5);
  const ids = new Set(samples.validation.map(sample => sample.id));
  assert.equal(ids.size, 5);
  assert.ok(!ids.has(samples.reference.id));
  for (const sample of [samples.reference, ...samples.validation]) {
    assert.equal(expand(sample.cards).length, sample.cardCount, sample.id);
    assert.equal(sample.version, 'v0.107.1');
    assert.equal(sample.mode, 'standard');
    for (const card of expand(sample.cards)) assert.ok(cardIndex.has(card.id), card.id);
  }
});

check('四个参照满足声明的需求，且本流派恰为 100 分', () => {
  for (const [id, ref] of Object.entries(references)) {
    const result = evaluate(expand(ref.cards), ref.relics, id);
    assert.equal(result.score, 100, id);
    assert.equal(result.coverage, 100, id);
    assert.equal(result.connections, 100, id);
  }
});

for (const sample of samples.validation) {
  const deck = expand(sample.cards);
  const results = evaluateAll(deck, sample.relics, sample.version, ['逐卡附魔未完整提取']);
  const current = scoreIroncladArchetypes(deck, sample.relics).map(result => ({ id: result.id, score: result.score }));
  check(`独立初标 ${sample.id}：${sample.expectedPrimary.join(' / ')}`, () => {
    assert.ok(sample.expectedPrimary.includes(results[0].id), JSON.stringify(results.map(r => [r.id, r.score])));
  });
  rows.push({ id: sample.id, url: sample.url, expected: sample.expectedPrimary, outcome: sample.outcome,
    count: deck.length, direction: describeDirection(results), scores: results.map(result => ({ id: result.id, score: result.score,
      coverage: result.coverage, connections: result.connections, focus: result.focus,
      confidence: result.confidence, gaps: result.gaps, unknownCards: result.unknownCards,
      unknownRelics: result.unknownRelics, dynamicUnknown: result.dynamicUnknown, unverifiedFacts: result.unverifiedFacts })), current });
}

const ref = references.block;
const full = expand(ref.cards);
const base = evaluate(full, ref.relics, 'block');
const card = id => ({ id, upgraded: false });
const variants = {
  original: full,
  no_barricade: full.filter(copy => copy.id !== 'BARRICADE'),
  no_body_slam: full.filter(copy => copy.id !== 'BODY_SLAM'),
  add_three_body_slams: [...full, ...Array.from({ length: 3 }, () => card('BODY_SLAM'))],
  replace_two_blood_walls: [...full.filter(copy => copy.id !== 'BLOOD_WALL'), card('IMPERVIOUS'), card('FLAME_BARRIER')],
  add_ten_strikes: [...full, ...Array.from({ length: 10 }, () => card('STRIKE_IRONCLAD'))],
  no_resources: full.filter(copy => !['BATTLE_TRANCE', 'FINESSE', 'SHRUG_IT_OFF'].includes(copy.id)),
  replace_barricade_with_unmovable: [...full.filter(copy => copy.id !== 'BARRICADE'), card('UNMOVABLE')]
};
const counterfactual = Object.entries(variants).map(([name, deck]) => ({
  ...evaluate(deck, ref.relics, 'block'), name, count: deck.length
}));
const variant = name => counterfactual.find(result => result.name === name);
check('移除关键功能会降分并明确指出缺口', () => {
  for (const [name, role] of [['no_barricade', 'retention'], ['no_body_slam', 'conversion']]) {
    assert.ok(variant(name).raw < base.raw);
    assert.ok(variant(name).gaps.some(gap => gap.role === role && gap.coverage === 0));
  }
});
check('十张无关打击会稀释格挡路线，不再保持满分', () => {
  assert.ok(variant('add_ten_strikes').score <= 75);
});
check('已有充足兑现时，继续重复全身撞击不会刷分', () => {
  assert.ok(variant('add_three_body_slams').raw <= base.raw);
});
check('不同卡名承担相同防御功能时，替换不造成大幅降分', () => {
  assert.ok(variant('replace_two_blood_walls').score >= base.score - 5);
});
check('坚定不移只放大格挡，不能替代壁垒的跨回合留存', () => {
  assert.ok(variant('replace_barricade_with_unmovable').gaps.some(gap => gap.role === 'retention' && gap.coverage === 0));
});
check('完整牌组的血量、通关结果不进入评分输入', () => {
  for (const outcome of ['victory', 'defeat', 'abandoned']) {
    assert.equal(evaluate(full.map(copy => ({ ...copy, outcome, hp: 0 })), ref.relics, 'block').score, base.score);
  }
});
check('空牌组得零分、任意卡序不改变结果，未知牌占位置且提示不确定', () => {
  assert.equal(evaluate([], [], 'block').score, 0);
  assert.ok(Math.abs(evaluate([...full].reverse(), [...ref.relics].reverse(), 'block').raw - base.raw) < 1e-9);
  const unknown = evaluate([...full, card('UNVERIFIED_MOD_CARD')], ref.relics, 'block');
  assert.ok(unknown.raw < base.raw);
  assert.deepEqual(unknown.unknownCards, ['UNVERIFIED_MOD_CARD']);
  assert.equal(unknown.confidence, 'partial');
});
check('参考版不匹配时标记不确定，不能伪装跨版本已验证', () => {
  assert.equal(evaluate(full, ref.relics, 'block', 'v0.111.0').versionMatch, false);
});
check('缺核心后新增有效配套仍能增加连续分数，没有 59 分截断', () => {
  const beforeDeck = [card('BODY_SLAM'), card('BLOOD_WALL'), ...Array.from({ length: 8 }, () => card('STRIKE_IRONCLAD'))];
  const before = evaluate(beforeDeck, [], 'block');
  const after = evaluate([...beforeDeck, card('PROLONG')], [], 'block');
  assert.ok(after.raw > before.raw, `${before.raw} -> ${after.raw}`);
  assert.ok(after.gaps.some(gap => gap.role === 'retention'));
});
check('遗物是功能来源，重复 ID 不重复计分，不要求搜齐全部关键遗物', () => {
  const deck = [card('BODY_SLAM'), card('BARRICADE'), card('PROLONG'), card('BATTLE_TRANCE')];
  const without = evaluate(deck, [], 'block');
  const withAnchor = evaluate(deck, ['ANCHOR'], 'block');
  assert.ok(withAnchor.raw >= without.raw);
  assert.equal(evaluate(deck, ['ANCHOR', 'ANCHOR'], 'block').raw, withAnchor.raw);
  for (const [id, plan] of Object.entries(references).filter(([id]) => id !== 'block')) {
    assert.equal(evaluate(expand(plan.cards), [], id).score, 100);
  }
});
check('起始牌组不会因为基础攻击和防御被误判成明显流派', () => {
  const starter = expand(['STRIKE_IRONCLAD*4', 'DEFEND_IRONCLAD*4', 'BASH']);
  for (const result of evaluateAll(starter)) {
    assert.ok(result.score < 20);
    assert.equal(result.status, 'undirected');
  }
});
check('全部铁甲卡牌各一张不能刷出四个高契合度', () => {
  const pile = [...cardIndex.values()].filter(copy => copy.color === 'ironclad').map(copy => card(copy.id));
  assert.ok(evaluateAll(pile).every(result => result.score < 40));
});
check('劫掠提供条件抽牌但名字不含打击，不误算自动打击弹药', () => {
  const grants = cardGrants(card('PILLAGE'), 'auto_strike', [card('PILLAGE')]);
  assert.equal(grants.loop, 1);
  assert.ok(!grants.strikes);
});
check('起手方向不明确，混合样本保留力量主方向与自动打击副方向', () => {
  assert.equal(describeDirection(evaluateAll(expand(['STRIKE_IRONCLAD*4', 'DEFEND_IRONCLAD*4', 'BASH']))).kind, 'undirected');
  const mixed = samples.validation.at(-1);
  const direction = describeDirection(evaluateAll(expand(mixed.cards), mixed.relics));
  assert.equal(direction.primary, 'strength');
  assert.ok(direction.secondary.includes('auto_strike'));
});

const report = {
  kind: '研究复算，非游戏实战；五套样本已用于检查，不再称作未来盲测集',
  version: 'reference-affinity-prototype-v1',
  caveat: '初标与算法草案由同一 AI 辅助研究完成，不能解释为独立专家准确率。三套参考为设计草案，格挡参考为社区胜利牌组。',
  formula: 'score = round(100 * (0.8 * weightedFunctionalCoverage + 0.2 * connectionCoverage) * min(1, effectiveDensity / referenceDensity))',
  prototypeHash: crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'affinity-prototype.cjs'))).digest('hex'),
  samplesHash: crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'samples.json'))).digest('hex'),
  sourceHashes: Object.fromEntries(['cards', 'relics'].map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, `agent/data/codex/${name}.json`))).digest('hex')])),
  references: Object.fromEntries(Object.entries(references).map(([id, plan]) => [id, { name: plan.name, origin: plan.origin, count: expand(plan.cards).length }])),
  checks, rows,
  counterfactual: counterfactual.map(result => ({ name: result.name, count: result.count, score: result.score,
    coverage: result.coverage, connections: result.connections, focus: result.focus, gaps: result.gaps }))
};
if (process.argv.includes('--write')) fs.writeFileSync(path.join(__dirname, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ checks: checks.length, samples: rows.map(row => ({ id: row.id, scores: row.scores.map(r => `${r.id}:${r.score}`) })), counterfactual: report.counterfactual.map(row => ({ name: row.name, score: row.score })) }, null, 2));
