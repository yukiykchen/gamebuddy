const {
  lookupCard, lookupMonster, lookupRelic, monsterMoves, stripMarkup
} = require('../codex-db');
const { createDecision, unavailable, numberOr } = require('../contracts');

const INTENT_DAMAGE = /attack|攻击|伤害/i;
const INTENT_DEFENSE = /defend|格挡|防御/i;
const INTENT_BUFF = /buff|增益/i;
const INTENT_DEBUFF = /debuff|减益/i;

function decide(state) {
  const player = state.player || {};
  const combat = state.combat;
  if (!combat) return ['combat', null];
  const hand = Array.isArray(combat.hand) ? combat.hand : [];
  const enemies = (Array.isArray(combat.enemies) ? combat.enemies : []).filter(enemy => enemy.alive !== false);
  if (!enemies.length) return ['combat', null];
  const energy = numberOr(player.energy, 0);
  const incomingDamage = enemies.reduce((sum, enemy) => sum + numberOr(enemy.damage, 0), 0);
  const threats = enemies.map(enemy => ({
    name: enemy.name,
    hp: enemy.hp,
    intent: enemy.intent,
    damage: numberOr(enemy.damage, 0),
    codex: lookupMonster(enemy.id || enemy.name)
  }));
  const handModels = hand.map((card, index) => {
    const meta = lookupCard(card.id || card.name) || {};
    return {
      index,
      id: card.id,
      name: card.name,
      cost: Number.isFinite(card.cost) ? card.cost : meta.cost ?? null,
      type: card.type || meta.type_key || meta.type,
      meta,
      damage: numberOr(card.damage ?? meta.damage, 0),
      hitCount: numberOr(card.hit_count ?? meta.hit_count, 1),
      block: numberOr(card.block ?? meta.block, 0)
    };
  });
  const affordable = handModels.filter(card => card.cost !== null && card.cost >= 0 && card.cost <= energy);
  const attacks = affordable.filter(card => card.type === 'Attack' || card.meta.type_key === 'Attack');
  const blockers = affordable.filter(card => card.type === 'Skill' || card.meta.type_key === 'Skill');
  const powers = affordable.filter(card => card.type === 'Power' || card.meta.type_key === 'Power');
  const blockSources = blockers.reduce((sum, card) => sum + card.block, 0);
  const neededBlock = Math.max(0, incomingDamage - numberOr(player.block, 0));
  const highPressure = incomingDamage >= Math.max(18, Math.ceil(player.hp * 0.32));
  const sequence = [];
  const reasons = [];
  const danger = incomingDamage > 0 && blockSources < neededBlock;
  const lethalCards = attacks.filter(card => card.damage * card.hitCount >= Math.max(...enemies.map(enemy => numberOr(enemy.hp, 0))) && card.damage > 0);
  if (lethalCards.length) {
    const lethal = lethalCards.reduce((best, card) => (card.cost < best.cost ? card : best));
    sequence.push(`${cardLabel(lethal)}`);
    reasons.push(`这一手存在直接斩杀选项。`);
  } else {
    const blocker = [...blockers].sort((a, b) => b.block - a.block)[0];
    if (incomingDamage > 0 && neededBlock > 0 && (highPressure || danger || !attacks.some(card => card.damage * card.hitCount >= enemies[0].hp / 2))) {
      if (blocker) {
        sequence.push(cardLabel(blocker));
        reasons.push(`敌方总威胁 ${incomingDamage}，当前缺口 ${neededBlock}，先补足格挡。`);
      }
    }
    const selectedEnemy = enemies.reduce((best, enemy) => (numberOr(enemy.hp, 0) < numberOr(best.hp, 0) ? enemy : best));
    const singleTarget = attacks
      .filter(card => card.damage > 0)
      .map(card => ({ card, output: card.damage * card.hitCount }))
      .sort((a, b) => b.output - a.output)[0];
    if (singleTarget && (!blocker || sequence.length < 2)) {
      sequence.push(`${cardLabel(singleTarget.card)} → ${selectedEnemy.name}`);
      reasons.push(`${singleTarget.card.name} 单卡期望伤害最高（${singleTarget.output}）。`);
    }
    const scaling = powers.filter(card => /力量|敏捷|获得\s*\d+\s*层/.test(stripMarkup(card.meta.description || '')));
    if (sequence.length < 2 && scaling.length) {
      const chosen = scaling.reduce((best, card) => (card.cost > best.cost ? card : best));
      sequence.push(cardLabel(chosen));
      reasons.push(`当前剩余能量可以投入成长，${chosen.name} 优先于只造成低额伤害。`);
    }
  }
  const deficits = [];
  if (!sequence.length) deficits.push('当前状态缺少完整手牌或敌人意图数据。');
  if (!state.fresh) deficits.push('观察数据已过期。');
  if (!affordable.length) deficits.push('当前能量打不出手牌，建议结束回合或使用药水。');
  if (!sequence.length) {
    return ['combat', unavailable('combat', state, deficits[0] || '当前状态不足以生成出牌建议。', deficits)];
  }
  const decision = createDecision('combat', state);
  decision.title = sequence.length > 1 ? `建议顺序：${sequence.join(' → ')}` : `建议先打出：${sequence[0]}`;
  decision.summary = reasons.join(' ');
  decision.confidence = 0.55 + Math.min(0.25, (hand.length ? 0.08 : 0) + (incomingDamage ? 0.08 : 0) + (lookupCoverage(handModels) ? 0.09 : 0));
  decision.payload = {
    action: 'combat-turn',
    sequence,
    incomingDamage,
    blockNeeded: neededBlock,
    blockAvailable: numberOr(player.block, 0) + blockSources,
    enemyTargets: threats
  };
  decision.evidence = [
    { kind: 'player', detail: `HP ${player.hp}/${player.maxHp}，格挡 ${player.block}，能量 ${energy}/${player.maxEnergy}` },
    { kind: 'intent', detail: threats.map(threat => `${threat.name}：${threat.intent} ${threat.damage || 0}`).join('；') },
    { kind: 'hand', detail: handModels.map(card => `${card.name}(${numberOr(card.cost, 'X')})`).join('、') },
    ...threats.flatMap(threat => threat.codex ? [{ kind: 'codex-monster', detail: `${threat.name}：${threat.codex.attack_pattern?.description || '攻击模式未收录'}` }] : [])
  ];
  return ['combat', decision];
}

function cardLabel(card) {
  return card.cost === 0 ? `${card.name}（0费）` : card.name;
}

function lookupCoverage(cards) {
  return cards.filter(card => card.meta).length / Math.max(1, cards.length) > 0.4;
}

module.exports = { decide };
