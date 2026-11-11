// 每次调规则后复算来源牌表及候选变化；校准报告不宣称盲测准确率。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../../..');
const model = require(path.join(root, 'agent/knowledge/archetype-affinity'));
const { scoreIroncladArchetypes, decorateIroncladArchetypes } = require(path.join(root, 'agent/knowledge/ironclad-archetypes'));
const { draftImpactMessage } = require(path.join(root, 'agent/knowledge/auto-strike'));
const ui = require(path.join(root, 'src/archetype-ui'));
const corpus = require('./runs-v2.json');
const sourceReferenceIds = new Set(Object.values(model.variants).flatMap(plans => plans.map(plan => plan.origin.split('/').pop())));
const candidates = ['HELLRAISER', 'POMMEL_STRIKE', 'DARK_EMBRACE', 'FEEL_NO_PAIN', 'BURNING_PACT', 'FIEND_FIRE', 'INFLAME', 'WHIRLWIND', 'BARRICADE', 'BODY_SLAM', 'UNMOVABLE', 'SHRUG_IT_OFF', 'PERFECTED_STRIKE', 'ASHEN_STRIKE', 'VICIOUS'];
const rows = corpus.runs.map(run => {
  const deck = model.expand(run.cards);
  assert.equal(deck.length, run.cardCount, run.id);
  const scores = scoreIroncladArchetypes(deck);
  const direction = model.describeDirection(scores);
  const display = ui.buildStatus(scores);
  assert.deepEqual(display.archetypeIds, direction.primary ? [direction.primary, ...direction.secondary] : []);
  const changes = candidates.map(id => {
    const [card] = decorateIroncladArchetypes('ironclad', deck, [], [{ id }]);
    return { cardId: id, cardName: model.cardIndex.get(id).name, impacts: card.archetypeImpacts.map(impact => {
      assert.equal(impact.deltaPoints, impact.afterScore - impact.beforeScore);
      return { id: impact.id, before: impact.beforeScore, after: impact.afterScore, delta: impact.deltaPoints, deltaExact: impact.deltaExact, reason: impact.reason };
    }) };
  });
  return { ...run, referenceSource: sourceReferenceIds.has(run.id), scores: scores.map(({ id, score, status, referenceName, gaps, confidence }) => ({ id, score, status, referenceName, gaps, confidence })), direction,
    labelCheck: run.scopeStatus === 'out_of_scope' ? `uncovered_${run.knownRoute}_route` : run.allowed.includes(direction.primary) ? 'consistent_with_mechanism_labels' : 'review_needed', changes };
});
const fullBlock = model.expand(model.references.block.cards);
const changes = [
  ['补壁垒', fullBlock.filter(c => c.id !== 'BARRICADE'), 'BARRICADE'],
  ['已有壁垒再拿', fullBlock, 'BARRICADE'],
  ['补转伤', fullBlock.filter(c => c.id !== 'BODY_SLAM'), 'BODY_SLAM'],
  ['已有三张全身撞击再拿', fullBlock, 'BODY_SLAM'],
  ['已有延续再拿放大', fullBlock, 'UNMOVABLE'],
  ['无关攻击牌', fullBlock, 'MANGLE']
].map(([name, deck, id]) => {
  const before = model.evaluate(deck, [], 'block'), after = model.evaluate([...deck, { id }], [], 'block');
  return { name, cardId: id, before: before.score, after: after.score, ...model.explainImpact(deck, [], { id }, 'block', before, after) };
});
const referenceChecks = Object.entries(model.variants).flatMap(([id, plans]) => plans.map(plan => ({ id, referenceId: plan.id, origin: plan.origin, score: model.evaluate(model.expand(plan.cards), [], id).score })));
referenceChecks.forEach(item => assert.equal(item.score, 100));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const report = { ruleVersion: model.RULE_VERSION, scope: corpus.scope, labels: corpus.labelMethod,
  hashes: Object.fromEntries(['agent/data/codex/cards.json', 'agent/data/codex/relics.json', 'agent/knowledge/archetype-affinity.js', 'agent/knowledge/archetype-references.js', 'openspec/changes/calibrate-reference-archetype-affinity/research/runs-v2.json'].map(file => [file, hash(file)])),
  referenceChecks, cases: rows, examples: changes,
  feedbackExamples: [[], ['HELLRAISER', 'POMMEL_STRIKE'], ['TRUE_GRIT', 'BURNING_PACT', 'FEEL_NO_PAIN']].map(extra => {
    const deck = [...Array(5).fill('STRIKE_IRONCLAD'), ...Array(4).fill('DEFEND_IRONCLAD'), 'BASH', ...extra].map(id => ({ id }));
    return { extra, before: model.evaluate(deck, [], 'auto_strike').score,
      candidates: ['PERFECTED_STRIKE', 'ASHEN_STRIKE', 'POMMEL_STRIKE', 'SHRUG_IT_OFF', 'VICIOUS'].map(id => ({ id, after: model.evaluate([...deck, { id }], [], 'auto_strike').score, ...model.explainImpact(deck, [], { id }, 'auto_strike') })) };
  }),
  limitations: ['每方向五局是校准来源组，包含参考来源，不能计作五局独立测试。', '完美打击数量路线不等同自动打击；目前四方向模型不覆盖所有套路。', '只按卡牌及已声明遗物功能比较，未模拟战斗牌序、消耗压缩、检索、附魔或动态改造。', 'AI 参与事实核对和校准，未调用独立付费模型或独立玩家评审。'] };
const fixtureDeck = fullBlock.filter(c => c.id !== 'BARRICADE');
const fixtureCards = decorateIroncladArchetypes('ironclad', fixtureDeck, [], ['BARRICADE', 'BODY_SLAM', 'MANGLE'].map(id => ({ id })));
const replay = draftImpactMessage({ name: 'card.reward.opened', data: { signature: 'affinity-v2-calibration' } }, 'ironclad', fixtureCards);
if (process.argv.includes('--write')) {
  fs.writeFileSync(path.join(__dirname, 'results-v2.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(__dirname, 'replay-v2.json'), JSON.stringify(replay, null, 2) + '\n');
}
console.log(JSON.stringify({ ruleVersion: report.ruleVersion, runs: rows.length, candidateComparisons: rows.length * candidates.length * 4, flagged: rows.filter(row => row.labelCheck !== 'consistent_with_mechanism_labels').map(row => ({ id: row.id, issue: row.labelCheck })), examples: changes }, null, 2));
