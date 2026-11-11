const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cards = require('../data/codex/cards.json');
const {
  ARCHETYPES,
  IRONCLAD_ARCHETYPE_MATRIX,
  validateMatrix,
  scoreIroncladArchetypes,
  impactIroncladArchetypes,
  decorateIroncladArchetypes,
  generateMatrixMarkdown,
  isIronclad
} = require('../knowledge/ironclad-archetypes');

const defend = { id: 'DEFEND_IRONCLAD' };
const filler = count => Array.from({ length: count }, () => ({ ...defend }));
const neutral = count => Array.from({ length: count }, () => ({ id: 'MANGLE' }));
const deckOf = (...ids) => ids.map(id => ({ id }));
const focusedDecks = {
  auto_strike: deckOf(
    'HELLRAISER', 'POMMEL_STRIKE', 'PILLAGE', 'PERFECTED_STRIKE', 'TWIN_STRIKE',
    'STRIKE_IRONCLAD', 'STRIKE_IRONCLAD', 'BASH', 'SHRUG_IT_OFF', 'OFFERING'
  ),
  exhaust: deckOf(
    'FEEL_NO_PAIN', 'DARK_EMBRACE', 'BURNING_PACT', 'TRUE_GRIT', 'FIEND_FIRE',
    'PACTS_END', 'HOWL_FROM_BEYOND', 'CORRUPTION', 'OFFERING', 'IMPERVIOUS'
  ),
  strength: deckOf(
    'INFLAME', 'DEMON_FORM', 'TWIN_STRIKE', 'WHIRLWIND', 'SWORD_BOOMERANG',
    'CONFLAGRATION', 'FIGHT_ME', 'BATTLE_TRANCE', 'OFFERING', 'BLOODLETTING'
  ),
  block: deckOf(
    'BARRICADE', 'UNMOVABLE', 'BODY_SLAM', 'JUGGERNAUT', 'IMPERVIOUS',
    'BLOOD_WALL', 'FLAME_BARRIER', 'SHRUG_IT_OFF', 'TAUNT', 'OFFERING'
  )
};
const score = (deck, id, relics = []) => scoreIroncladArchetypes(deck, relics)
  .find(item => item.id === id).score;
const state = (deck, id, relics = []) => scoreIroncladArchetypes(deck, relics)
  .find(item => item.id === id);
const impact = (deck, candidate, id) => impactIroncladArchetypes(deck, [], candidate)
  .find(item => item.id === id);

test('矩阵与 Codex 的 87 张铁甲牌严格一致且每张显式覆盖四套', () => {
  const codexIds = cards.filter(card => card.color === 'ironclad').map(card => card.id).sort();
  const matrixIds = Object.keys(IRONCLAD_ARCHETYPE_MATRIX).sort();
  assert.equal(codexIds.length, 87);
  assert.deepEqual(matrixIds, codexIds);
  for (const id of matrixIds) {
    assert.deepEqual(Object.keys(IRONCLAD_ARCHETYPE_MATRIX[id]).sort(), ARCHETYPES.map(item => item.key).sort());
    for (const cell of Object.values(IRONCLAD_ARCHETYPE_MATRIX[id])) {
      assert.equal(typeof cell.role, 'string');
      assert.equal(typeof cell.group, 'string');
      assert.equal(typeof cell.weight, 'number');
      assert.equal(typeof cell.reason, 'string');
    }
  }
  assert.equal(Object.values(IRONCLAD_ARCHETYPE_MATRIX)
    .flatMap(Object.values).filter(cell => cell.role === 'hardPoison').length, 0);
});

test('矩阵校验拒绝未知角色、原因、条件和缺失流派键', () => {
  const base = structuredClone(IRONCLAD_ARCHETYPE_MATRIX);
  base.BASH.autoStrike.role = 'winner';
  assert.throws(() => validateMatrix(base), /invalid role/);
  const badReason = structuredClone(IRONCLAD_ARCHETYPE_MATRIX);
  badReason.BASH.autoStrike.reasonCode = 'made_up';
  assert.throws(() => validateMatrix(badReason), /invalid reason/);
  const badCondition = structuredClone(IRONCLAD_ARCHETYPE_MATRIX);
  badCondition.BASH.autoStrike.condition = 'arbitrary_js';
  assert.throws(() => validateMatrix(badCondition), /invalid condition/);
  const missing = structuredClone(IRONCLAD_ARCHETYPE_MATRIX);
  delete missing.BASH.block;
  assert.throws(() => validateMatrix(missing), /must explicitly define/);
});

test('专注构筑稳定成型，全卡杂牌堆不能只靠堆叠成型', () => {
  const allCards = cards.filter(card => card.color === 'ironclad');
  const doubledPile = [...allCards, ...allCards];
  const mixed = [
    ...focusedDecks.strength.slice(0, 5),
    ...focusedDecks.block.slice(0, 5),
    ...neutral(10)
  ];
  for (const archetype of ARCHETYPES) {
    const focused = state(focusedDecks[archetype.id], archetype.id);
    const pile = state(allCards, archetype.id);
    assert.equal(focused.status, 'stable', `${archetype.id} focused status`);
    assert.equal(focused.stage, 'formed', `${archetype.id} focused stage`);
    assert.equal(focused.mature, true, `${archetype.id} legacy mature`);
    assert.equal(focused.score, focused.readiness);
    assert.notEqual(pile.status, 'stable', `${archetype.id} all-card pile status`);
    assert.notEqual(pile.stage, 'formed', `${archetype.id} all-card pile`);
    assert.notEqual(state(doubledPile, archetype.id).stage, 'formed', `${archetype.id} doubled pile`);
    assert.ok(pile.score < 100, `${archetype.id} pile ${pile.score}`);
  }
  assert.ok(scoreIroncladArchetypes(mixed).every(item => item.stage !== 'formed'));
});

test('起手和缺闸门组件保留潜力但不误报启动', () => {
  const starter = deckOf(
    'STRIKE_IRONCLAD', 'STRIKE_IRONCLAD', 'STRIKE_IRONCLAD', 'STRIKE_IRONCLAD',
    'STRIKE_IRONCLAD', 'DEFEND_IRONCLAD', 'DEFEND_IRONCLAD', 'DEFEND_IRONCLAD',
    'DEFEND_IRONCLAD', 'BASH'
  );
  assert.ok(state(starter, 'auto_strike').score > 0);
  for (const [id, deck] of Object.entries({
    auto_strike: deckOf('POMMEL_STRIKE', 'PILLAGE', 'TWIN_STRIKE', ...Array(7).fill('MANGLE')),
    exhaust: deckOf('BURNING_PACT', 'FIEND_FIRE', 'PACTS_END', ...Array(7).fill('MANGLE')),
    strength: deckOf('TWIN_STRIKE', 'WHIRLWIND', 'CONFLAGRATION', ...Array(7).fill('MANGLE')),
    block: deckOf('BODY_SLAM', 'IMPERVIOUS', 'BLOOD_WALL', ...Array(7).fill('MANGLE'))
  })) {
    const result = state(deck, id);
    assert.ok(result.score > 0, `${id} potential`);
    assert.equal(result.stage, 'unformed', `${id} stage`);
  }
});

test('缺启动仍按配套连续增长，不应用 59 分上限或启动保底', () => {
  const { references, expand } = require('../knowledge/archetype-affinity');
  const withoutGate = expand(references.auto_strike.cards).filter(card => !['HELLRAISER', 'DEFEND_IRONCLAD', 'ASCENDERS_BANE', 'SPITE', 'ANGER'].includes(card.id));
  const result = state(withoutGate, 'auto_strike');
  assert.ok(result.score > 59, `${result.score}`);
  assert.equal(result.status, 'missing_starter');
  assert.equal(result.started, false);
  const sparse = state(deckOf('HELLRAISER', 'POMMEL_STRIKE', ...Array(8).fill('MANGLE')), 'auto_strike');
  assert.equal(sparse.status, 'operational');
  assert.ok(sparse.score < 60);
});

test('状态解释配合而不抬分，主宰自身提供易伤与力量', () => {
  const gate = state(deckOf('HELLRAISER', ...Array(9).fill('MANGLE')), 'auto_strike');
  const linked = state(deckOf('HELLRAISER', 'POMMEL_STRIKE', ...Array(8).fill('MANGLE')), 'auto_strike');
  assert.equal(gate.status, 'incomplete_loop');
  assert.equal(linked.status, 'operational');
  assert.ok(linked.score < 60);
  const dominate = state(deckOf('DOMINATE', ...Array(9).fill('MANGLE')), 'strength');
  assert.ok(dominate.presentFunctions.some(item => item.id === 'strength_source'));
  assert.equal(dominate.status, 'incomplete_loop');
});

test('无关牌不改变功能覆盖，但会降低契合度和组件密度', () => {
  const compact = deckOf('HELLRAISER', 'POMMEL_STRIKE', ...Array(8).fill('MANGLE'));
  const before = state(compact, 'auto_strike');
  const after = state([...compact, ...neutral(20)], 'auto_strike');
  assert.equal(after.blueprintScore, before.blueprintScore);
  assert.ok(after.consistency < before.consistency);
  assert.ok(after.score < before.score);
});

test('混合牌组可以独立启动多套闭环', () => {
  const mixed = deckOf(
    'FEEL_NO_PAIN', 'BURNING_PACT',
    'INFLAME', 'TWIN_STRIKE',
    ...Array(6).fill('MANGLE')
  );
  const results = scoreIroncladArchetypes(mixed);
  assert.equal(results.find(item => item.id === 'exhaust').stage, 'started');
  assert.equal(results.find(item => item.id === 'strength').stage, 'started');
});

test('升级按牌面功能生效，重复饱和后不再刷分', () => {
  const { references, expand } = require('../knowledge/archetype-affinity');
  const normal = impact(neutral(10), { id: 'POMMEL_STRIKE' }, 'auto_strike');
  const upgraded = impact(neutral(10), { id: 'POMMEL_STRIKE', upgraded: true }, 'auto_strike');
  assert.ok(upgraded.deltaExact > normal.deltaExact);
  const full = expand(references.auto_strike.cards);
  const redundant = impact(full, { id: 'POMMEL_STRIKE' }, 'auto_strike');
  assert.ok(redundant.deltaPoints <= 0);
  assert.equal(redundant.learningTag, 'redundant');
});

test('自动打击不再把主动误用风险当作无条件硬毒', () => {
  const base = [{ id: 'HELLRAISER' }, { id: 'POMMEL_STRIKE' }, ...filler(18)];
  for (const id of ['DEMON_FORM', 'FIEND_FIRE', 'CORRUPTION', 'BRAND', 'HAVOC', 'PRIMAL_FORCE']) {
    const result = impact(base, { id }, 'auto_strike');
    assert.notEqual(result.role, 'hardPoison');
    assert.ok(result.deltaPoints >= -2, `${id} should not be a large fixed penalty`);
  }
  assert.ok(impact(base, { id: 'IRON_WAVE' }, 'auto_strike').deltaPoints <= 0);
});

test('自动打击区分稳定支持、条件支持和真实软反', () => {
  const matrix = IRONCLAD_ARCHETYPE_MATRIX;
  const base = [{ id: 'HELLRAISER' }, { id: 'POMMEL_STRIKE' }, ...filler(18)];
  assert.equal(matrix.INFLAME.autoStrike.role, 'support');
  assert.ok(impact(base, { id: 'INFLAME' }, 'auto_strike').deltaPoints > 0);
  assert.equal(matrix.BATTLE_TRANCE.autoStrike.role, 'conditional');
  assert.equal(matrix.STOKE.autoStrike.role, 'conditional');
  assert.equal(matrix.PRIMAL_FORCE.autoStrike.role, 'softAnti');
  for (const id of ['ARMAMENTS', 'BASH', 'BREAK', 'TAUNT', 'THUNDERCLAP', 'TREMBLE', 'UPPERCUT', 'ONE_TWO_PUNCH']) {
    assert.notEqual(matrix[id].autoStrike.role, 'neutral', `${id} should have an explicit auto-strike role`);
  }
  assert.equal(matrix.BASH.autoStrike.reasonCode, 'auto_vulnerable');
  assert.ok(impact(base, { id: 'BASH' }, 'auto_strike').deltaPoints > 0);
});

test('初始牌组的自动打击弹药先积累潜力，闸门再释放协同', () => {
  const starter = [
    ...Array.from({ length: 5 }, () => ({ id: 'STRIKE_IRONCLAD' })),
    ...filler(4),
    { id: 'BASH' }
  ];
  const twin = impact(starter, { id: 'TWIN_STRIKE' }, 'auto_strike').deltaPoints;
  const taunt = impact(starter, { id: 'TAUNT' }, 'auto_strike').deltaPoints;
  const blankGate = impact(neutral(10), { id: 'HELLRAISER' }, 'auto_strike').deltaPoints;
  const componentGate = impact(
    [{ id: 'TWIN_STRIKE' }, { id: 'POMMEL_STRIKE' }, ...neutral(8)],
    { id: 'HELLRAISER' },
    'auto_strike'
  ).deltaPoints;
  assert.ok(twin > 0 && twin >= taunt);
  assert.ok(componentGate > blankGate);
  assert.equal(state([...starter, { id: 'TWIN_STRIKE' }], 'auto_strike').started, false);
});

test('消耗出口、事件和兑现无闸门仍正向，双闸门逐级放大', () => {
  const noGate = neutral(10);
  const oneGate = [{ id: 'FEEL_NO_PAIN' }, ...neutral(9)];
  const twoGates = [{ id: 'FEEL_NO_PAIN' }, { id: 'DARK_EMBRACE' }, ...neutral(8)];
  for (const id of ['BURNING_PACT', 'FIEND_FIRE', 'PACTS_END']) {
    const none = impact(noGate, { id }, 'exhaust').deltaPoints;
    const one = impact(oneGate, { id }, 'exhaust').deltaPoints;
    const two = impact(twoGates, { id }, 'exhaust').deltaPoints;
    assert.ok(none > 0, `${id} should retain potential without gates`);
    assert.ok(one >= none, `${id} should not lose value with one gate`);
    assert.ok(
      impact(twoGates, { id }, 'exhaust').afterScore > impact(oneGate, { id }, 'exhaust').afterScore,
      `${id} should finish higher with both gates`
    );
  }
  assert.equal(state([
    { id: 'BURNING_PACT' }, { id: 'FIEND_FIRE' }, { id: 'PACTS_END' }, ...neutral(7)
  ], 'exhaust').started, false);
});

test('力量配合有收益，饱和输出不再无限堆分', () => {
  const noSource = impact(neutral(10), { id: 'CONFLAGRATION' }, 'strength');
  const withSource = impact(deckOf('INFLAME', ...Array(9).fill('MANGLE')), { id: 'CONFLAGRATION' }, 'strength');
  assert.ok(noSource.deltaPoints > 0);
  assert.ok(withSource.deltaPoints > noSource.deltaPoints);
  const { references, expand } = require('../knowledge/archetype-affinity');
  assert.ok(impact(expand(references.strength.cards), { id: 'CONFLAGRATION' }, 'strength').deltaPoints <= 0);
});

test('格挡来源和转伤先积累潜力，闸门与三轴组合最高', () => {
  const noGate = neutral(10);
  assert.ok(impact(noGate, { id: 'IMPERVIOUS' }, 'block').deltaPoints > 0);
  assert.ok(impact(noGate, { id: 'BODY_SLAM' }, 'block').deltaPoints > 0);
  const wallOnly = [{ id: 'BARRICADE' }, { id: 'IMPERVIOUS' }, { id: 'BLOOD_WALL' }, ...neutral(7)];
  const conversionOnly = [{ id: 'BODY_SLAM' }, { id: 'JUGGERNAUT' }, { id: 'IMPERVIOUS' }, ...neutral(7)];
  const complete = [
    { id: 'BARRICADE' }, { id: 'BODY_SLAM' }, { id: 'JUGGERNAUT' },
    { id: 'IMPERVIOUS' }, { id: 'BLOOD_WALL' }, ...neutral(5)
  ];
  assert.ok(score(complete, 'block') > score(wallOnly, 'block'));
  assert.ok(score(complete, 'block') > score(conversionOnly, 'block'));
  assert.equal(state(conversionOnly, 'block').started, false);
  assert.equal(state(conversionOnly, 'block').mature, false);
});

test('候选增量等于前后准备度之差，重复和净负不保底', () => {
  const first = impact(neutral(60), { id: 'FIEND_FIRE' }, 'exhaust');
  assert.equal(first.deltaPoints, first.afterScore - first.beforeScore);
  assert.equal(first.readiness, first.afterScore);
  let repeatedDeck = [{ id: 'TWIN_STRIKE' }, ...neutral(10)];
  let repeated = impact(repeatedDeck, { id: 'TWIN_STRIKE' }, 'auto_strike');
  for (let count = 0; count < 20 && repeated.deltaPoints > 0; count += 1) {
    repeatedDeck = [{ id: 'TWIN_STRIKE' }, ...repeatedDeck];
    repeated = impact(repeatedDeck, { id: 'TWIN_STRIKE' }, 'auto_strike');
  }
  assert.ok(repeated.deltaPoints <= 0);
  assert.ok(impact(
    [{ id: 'HELLRAISER' }, { id: 'POMMEL_STRIKE' }, ...neutral(10)],
    { id: 'ANGER' },
    'auto_strike'
  ).deltaPoints < 0);
});

test('候选输出四条 impacts 与四条 scores，非铁甲不装饰', () => {
  const deck = [{ id: 'HELLRAISER' }, { id: 'INFLAME' }, ...filler(18)];
  const candidates = [{ id: 'TWIN_STRIKE', name: '双重打击' }];
  const decorated = decorateIroncladArchetypes('ironclad', deck, [], candidates);
  assert.equal(decorated[0].archetypeImpacts.length, 4);
  assert.equal(decorated[0].archetypeScores.length, 4);
  assert.equal(decorated[0].archetypeImpact.id, 'auto_strike');
  assert.ok(decorated[0].archetypeImpacts.every(item => Number.isInteger(item.deltaPoints)));
  assert.ok(decorated[0].archetypeImpacts.find(item => item.id === 'auto_strike').deltaPoints > 0);
  assert.ok(decorated[0].archetypeImpacts.find(item => item.id === 'strength').deltaPoints > 0);
  assert.equal(decorateIroncladArchetypes('silent', deck, [], candidates), candidates);
  assert.equal(isIronclad('铁甲战士'), true);
  assert.equal(isIronclad('silent'), false);
});

test('候选输出前后阶段并只报告新补齐的直接结构轴', () => {
  const base = [{ id: 'POMMEL_STRIKE' }, { id: 'PILLAGE' }, ...neutral(8)];
  const gate = impact(base, { id: 'HELLRAISER' }, 'auto_strike');
  assert.equal(gate.beforeStage, 'unformed');
  assert.equal(gate.afterStage, 'started');
  assert.equal(gate.beforeStatus, 'missing_starter');
  assert.equal(gate.afterStatus, 'operational');
  assert.deepEqual(gate.completedFunctions.map(item => item.id), ['auto_gate']);
  assert.equal(gate.deltaPoints, gate.afterScore - gate.beforeScore);
  assert.ok(gate.afterScore < 60, `readiness ${gate.afterScore}`);
  assert.deepEqual(gate.completedAxes, ['auto_gate']);
  assert.equal(gate.beforeScore < gate.afterScore, true);

  const support = impact(focusedDecks.strength, { id: 'BATTLE_TRANCE' }, 'strength');
  assert.equal(support.beforeStage, 'formed');
  assert.equal(support.afterStage, 'formed');
  assert.deepEqual(support.completedAxes, []);
});

test('单卡启动槽由首张完成，重复启动不得强制正增量', () => {
  const base = deckOf('POMMEL_STRIKE', 'STRIKE_IRONCLAD', ...Array(8).fill('MANGLE'));
  const first = impact(base, { id: 'HELLRAISER' }, 'auto_strike');
  const duplicate = impact([...base, { id: 'HELLRAISER' }], { id: 'HELLRAISER' }, 'auto_strike');
  assert.ok(first.deltaPoints > 0);
  assert.ok(first.completedFunctions.some(item => item.id === 'auto_gate'));
  assert.ok(duplicate.deltaPoints <= 0);
  assert.equal(duplicate.learningTag, 'redundant');
});

test('生成文档版本、数量和 ID 与矩阵一致', () => {
  const filename = path.join(__dirname, '..', '..', 'docs', 'ironclad-four-archetype-matrix.md');
  const document = fs.readFileSync(filename, 'utf8');
  assert.equal(document, generateMatrixMarkdown());
  assert.match(document, /卡牌数：87；矩阵版本：1/);
  const documentedIds = [...document.matchAll(/^\| `([^`]+)` \|/gm)].map(match => match[1]).sort();
  assert.equal(documentedIds.length, 87);
  assert.deepEqual(documentedIds, Object.keys(IRONCLAD_ARCHETYPE_MATRIX).sort());
});
