const {
  lookupCard, lookupMonster, stripMarkup
} = require('../codex-db');
const { createDecision, unavailable, numberOr } = require('../contracts');

function decide(state) {
  const player = state.player || {};
  const combat = state.combat;
  if (!combat) return ['combat', null];
  const hand = Array.isArray(combat.hand) ? combat.hand : [];
  const enemies = (Array.isArray(combat.enemies) ? combat.enemies : []).filter(enemy => enemy.alive !== false);
  if (!enemies.length) return ['combat', null];
  const energy = numberOr(player.energy, 0);
  const threats = enemies.map(enemy => ({
    name: enemy.name,
    hp: enemy.hp,
    intent: enemy.intent,
    attacking: /attack/i.test(String(enemy.intent || '')),
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
      block: numberOr(card.block ?? meta.block, 0)
    };
  });
  const affordable = handModels.filter(card => card.cost !== null && card.cost >= 0 && card.cost <= energy);
  const attacks = affordable.filter(card => card.type === 'Attack' || card.meta.type_key === 'Attack');
  const blockers = affordable.filter(card => card.type === 'Skill' || card.meta.type_key === 'Skill');
  const powers = affordable.filter(card => card.type === 'Power' || card.meta.type_key === 'Power');
  const sequence = [];
  const reasons = [];
  const hasAttackIntent = threats.some(threat => threat.attacking);
  const blocker = [...blockers].sort((a, b) => b.block - a.block)[0];
  if (hasAttackIntent && blocker) {
    sequence.push(cardLabel(blocker));
    reasons.push('敌人显示攻击意图，优先考虑防御；不推算具体承伤数值。');
  }
  const scaling = powers.filter(card => /力量|敏捷|获得\s*\d+\s*层/.test(stripMarkup(card.meta.description || '')));
  if (sequence.length < 2 && scaling.length) {
    const chosen = scaling.reduce((best, card) => (card.cost > best.cost ? card : best));
    sequence.push(cardLabel(chosen));
    reasons.push(`当前能量允许投入成长，优先考虑 ${chosen.name}。`);
  }
  if (sequence.length < 2 && attacks.length) {
    const selectedEnemy = enemies.reduce((best, enemy) => (numberOr(enemy.hp, 0) < numberOr(best.hp, 0) ? enemy : best));
    const attack = attacks[0];
    sequence.push(`${cardLabel(attack)} → ${selectedEnemy.name}`);
    reasons.push('这是当前可支付的攻击牌；未进行伤害或斩杀计算。');
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
  decision.confidence = 0.5 + Math.min(0.2, (hand.length ? 0.08 : 0) + (hasAttackIntent ? 0.04 : 0) + (lookupCoverage(handModels) ? 0.08 : 0));
  decision.payload = {
    action: 'combat-turn',
    sequence,
    enemyTargets: threats
  };
  decision.evidence = [
    { kind: 'player', detail: `HP ${player.hp}/${player.maxHp}，格挡 ${player.block}，能量 ${energy}/${player.maxEnergy}` },
    { kind: 'intent', detail: threats.map(threat => `${threat.name}：${threat.intent || '未知意图'}`).join('；') },
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
