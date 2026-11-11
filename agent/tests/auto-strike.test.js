const test = require('node:test');
const assert = require('node:assert/strict');
const {
  autoStrikeScore,
  autoStrikeImpact,
  decorateAutoStrikeCards,
  DRAFT_ARCHETYPE_IDS,
  draftImpactMessage,
  isIronclad
} = require('../knowledge/auto-strike');
const { decorateIroncladArchetypes } = require('../knowledge/ironclad-archetypes');

const hellraiser = { id: 'HELLRAISER', name: '地狱狂徒' };
const pommel = { id: 'POMMEL_STRIKE', name: '剑柄打击' };
const defend = { id: 'DEFEND_IRONCLAD', name: '防御' };
const shrug = { id: 'SHRUG_IT_OFF', name: '耸肩无视' };
const primal = { id: 'PRIMAL_FORCE', name: '原始力量' };
const anger = { id: 'ANGER', name: '愤怒' };
const ironWave = { id: 'IRON_WAVE', name: '铁斩波' };

test('剑柄打击与地狱狂徒配合，重复达到需求后饱和', () => {
  const base = [hellraiser, ...Array(18).fill(defend)];
  const first = autoStrikeImpact(base, [], pommel).deltaPoints;
  const second = autoStrikeImpact([...base, pommel], [], pommel).deltaPoints;
  const third = autoStrikeImpact([...base, pommel, pommel], [], pommel).deltaPoints;
  assert.ok(first > 0 && second > 0 && third > 0);
  const saturated = [...base, ...Array(12).fill(pommel)];
  assert.ok(autoStrikeImpact(saturated, [], pommel).deltaPoints <= 0);
  assert.ok(first > autoStrikeImpact([defend, ...Array(18).fill(defend)], [], pommel).deltaPoints);
  assert.equal(autoStrikeImpact(base, [], pommel).reason, '循环');
});

test('升级、遗物和牌组厚度改变同一候选的增量', () => {
  const base = [hellraiser, pommel, ...Array(18).fill(defend)];
  const normal = autoStrikeImpact(base, [], pommel).deltaPoints;
  const potentialBase = Array(10).fill({ id: 'MANGLE' });
  const potentialNormal = autoStrikeImpact(potentialBase, [], pommel).deltaExact;
  const upgraded = autoStrikeImpact(
    potentialBase,
    [],
    { ...pommel, name: '剑柄打击+', upgraded: true }
  ).deltaExact;
  const withRelic = autoStrikeImpact(base, [{ id: 'STRIKE_DUMMY' }], pommel).deltaPoints;
  const thicker = autoStrikeScore([...base, ...Array(10).fill(defend)], []);
  assert.ok(upgraded > potentialNormal);
  assert.ok(withRelic >= normal);
  assert.ok(thicker < autoStrikeScore(base, []));
});

test('非套路牌只交稀释税，未知卡不猜测', () => {
  const base = [hellraiser, pommel, ...Array(18).fill(defend)];
  const filler = autoStrikeImpact(base, [], ironWave);
  assert.ok(filler.deltaPoints <= 0);
  assert.equal(filler.deltaPoints, filler.afterScore - filler.beforeScore);
  assert.equal(filler.learningTag, 'dilution');
  assert.ok(autoStrikeImpact(base, [], defend).deltaPoints <= 0);
  assert.equal(autoStrikeImpact(base, [], { id: 'UNKNOWN_MOD_CARD' }).learningTag, 'unknown');
  assert.equal(isIronclad('ironclad'), true);
  assert.equal(isIronclad('铁甲战士'), true);
  assert.equal(isIronclad('silent'), false);
});

test('耸肩无视在有启动循环时为正分过牌辅助', () => {
  const base = [hellraiser, pommel, ...Array(12).fill(defend)];
  const impact = autoStrikeImpact(base, [], shrug);
  assert.ok(impact.deltaPoints > 0, `expected shrug > 0, got ${impact.deltaPoints}`);
  assert.equal(impact.reason, '过牌辅助');
});

test('原始力量不再因主动误用风险被固定判作硬毒', () => {
  const base = [hellraiser, pommel, pommel, { id: 'PILLAGE' }, ...Array(10).fill(defend)];
  const conditional = autoStrikeImpact(base, [], primal);
  const filler = autoStrikeImpact(base, [], ironWave);
  assert.notEqual(conditional.role, 'hardPoison');
  assert.ok(conditional.deltaPoints >= filler.deltaPoints - 2);
});

test('软反牌带支线冲突标签且为负', () => {
  const base = [hellraiser, pommel, ...Array(12).fill(defend)];
  const impact = autoStrikeImpact(base, [], anger);
  assert.ok(impact.deltaExact < 0);
  assert.ok(impact.deltaPoints <= 0);
  assert.equal(impact.reason, '支线冲突');
});

test('打击包弹药与易伤窗口在有狂徒时为正', () => {
  const base = [hellraiser, pommel, ...Array(10).fill(defend)];
  const twin = autoStrikeImpact(base, [], { id: 'TWIN_STRIKE' });
  assert.ok(twin.deltaPoints > 0, `expected twin ammo > 0, got ${twin.deltaPoints}`);
  assert.equal(twin.reason, '弹药');
  const unmovable = autoStrikeImpact(base, [], { id: 'UNMOVABLE' });
  assert.ok(unmovable.deltaPoints <= 0);
  const bash = autoStrikeImpact(base, [], { id: 'BASH' });
  assert.ok(bash.deltaPoints > 0);
});

test('原始奖励事件可在推荐完成前显示三张牌的增量', () => {
  const deck = [hellraiser, ...Array(19).fill(defend)];
  const offered = [pommel, { id: 'PILLAGE', name: '劫掠' }, anger];
  const decorated = decorateAutoStrikeCards('ironclad', deck, [], offered);
  assert.equal(decorated.length, 3);
  assert.ok(decorated.every(card => card.archetypeImpact?.id === 'auto_strike'));
  assert.ok(decorated[0].archetypeImpact.afterScore >= decorated[1].archetypeImpact.afterScore);
  assert.equal(decorated[0].archetypeImpact.afterStage, 'started');
  assert.equal(decorated[1].archetypeImpact.afterStage, 'unformed', '劫掠不能作为自动打击弹药');
  assert.equal(offered[0].archetypeImpact, undefined);
  assert.equal(decorateAutoStrikeCards('silent', deck, [], offered), offered);
  const event = { name: 'card.reward.opened', data: { signature: 'POMMEL_STRIKE:False|PILLAGE:False|ANGER:False' } };
  const fourArchetypeCards = decorateIroncladArchetypes('ironclad', deck, [], offered);
  assert.ok(fourArchetypeCards.every(card => card.archetypeScores.length === 4 && card.archetypeImpacts.length === 4));
  const message = draftImpactMessage(event, 'ironclad', fourArchetypeCards);
  assert.equal(message.type, 'draft_impact');
  assert.equal(message.signature, event.data.signature);
  assert.deepEqual(message.impacts.map(impact => impact.cardId), offered.map(card => card.id));
  assert.equal(message.impacts[0].reason, '循环');
  assert.ok(message.impacts.every(impact => typeof impact.reason === 'string'));
  assert.ok(message.impacts.every(impact => (
    Object.keys(impact).sort().join(',') === 'archetypes,cardId,deltaPoints,reason'
  )));
  assert.ok(message.impacts.every(impact => impact.deltaPoints === impact.archetypes[0].deltaPoints));
  assert.ok(message.impacts.every(impact => (
    impact.archetypes.length === 4
      && impact.archetypes.every(item => Number.isInteger(item.deltaPoints)
        && item.deltaPoints >= -100 && item.deltaPoints <= 100
        && Number.isInteger(item.beforeScore)
        && item.beforeScore >= 0 && item.beforeScore <= 100
        && Number.isInteger(item.afterScore)
        && ['unformed', 'started', 'formed'].includes(item.beforeStage)
        && ['unformed', 'started', 'formed'].includes(item.afterStage)
        && Array.isArray(item.completedAxes))
  )));
  assert.deepEqual(message.impacts[0].archetypes.map(impact => impact.id), DRAFT_ARCHETYPE_IDS);
  assert.ok(message.impacts.every(impact => impact.archetypes.every(item => (
    item.deltaPoints === item.afterScore - item.beforeScore
    && item.readiness === item.afterScore
    && ['missing_starter', 'incomplete_loop', 'operational', 'stable'].includes(item.status)
    && item.beforeStatus && item.afterStatus
    && Array.isArray(item.presentFunctions)
    && Array.isArray(item.missingFunctions)
    && Array.isArray(item.completedFunctions)
  ))));
  assert.equal(draftImpactMessage(event, 'silent', decorated), null);
  assert.equal(draftImpactMessage({ name: 'card.reward.opened', data: {} }, 'ironclad', decorated), null);
});

test('四流派消息原子拒绝缺项、重复和越界候选且保持奖励签名', () => {
  const event = { name: 'card.reward.opened', data: { signature: 'A:False|B:False|C:False' } };
  const validImpacts = DRAFT_ARCHETYPE_IDS.map((id, index) => ({
    id,
    deltaPoints: index === 0 ? -100 : index === 3 ? 100 : index,
    reason: `reason-${id}`,
    beforeScore: index === 0 ? 100 : 0,
    afterScore: index === 0 ? 0 : index === 3 ? 100 : index,
    beforeStage: 'unformed',
    afterStage: index === 0 ? 'started' : 'unformed',
    completedAxes: index === 0 ? ['auto_gate'] : []
  }));
  const cards = [
    { id: 'A', archetypeImpacts: validImpacts },
    { id: 'B', archetypeImpacts: [...validImpacts.slice(0, 3), validImpacts[0]] },
    { id: 'C', archetypeImpacts: validImpacts.map(item => (
      item.id === 'block' ? { ...item, deltaPoints: 101 } : item
    )) }
  ];
  assert.equal(draftImpactMessage(event, 'ironclad', cards), null);
  const message = draftImpactMessage(event, 'ironclad', [cards[0]]);
  assert.equal(message.signature, event.data.signature);
  assert.deepEqual(message.impacts.map(impact => impact.cardId), ['A']);
  assert.deepEqual(message.impacts[0].archetypes.map(impact => impact.id), DRAFT_ARCHETYPE_IDS);
  assert.equal(message.impacts[0].deltaPoints, -100);
  assert.equal(draftImpactMessage(event, 'silent', cards), null);
});
