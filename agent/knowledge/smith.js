function cardText(card) {
  return `${card?.id || ''} ${card?.name || ''}`;
}

function isStrike(card) {
  return /strike|打击/i.test(cardText(card));
}

function isDefend(card) {
  return /defend|防御/i.test(cardText(card));
}

const SMITH_BONUSES = [
  { pattern: /bash|痛击/i, score: 16, why: '痛击升级后易伤更强，是铁甲核心输出' },
  { pattern: /neutralize|毒刺|使无力/i, score: 15, why: '升级后控制更稳' },
  { pattern: /survivor|生存者|生存/i, score: 12, why: '升级后弃牌换格挡更值' },
  { pattern: /zap|电击/i, score: 14, why: '升级多一充能球，是故障核心' },
  { pattern: /dualcast|双放|双发/i, score: 13, why: '升级后激发更强' },
  { pattern: /eruption|爆发|觉醒/i, score: 14, why: '姿态转换牌升级收益高' },
  { pattern: /corruption|腐化/i, score: 16, why: '腐化升级后费用更低，改变整局节奏' },
  { pattern: /demon form|恶魔形态/i, score: 15, why: '力量成长牌，升级后启动更快' },
  { pattern: /inflame|燃烧|点燃/i, score: 13, why: '力量牌升级通常很值' },
  { pattern: /footwork|步法/i, score: 13, why: '敏捷牌升级能抬高整局格挡' },
  { pattern: /adrenaline|肾上腺素/i, score: 14, why: '升级后多抽牌，节奏牌优先升' },
  { pattern: /offering|祭品/i, score: 14, why: '升级后抽牌更多' },
  { pattern: /whirlwind|旋风斩|旋风/i, score: 12, why: '多段攻击升级后伤害提升明显' },
  { pattern: /bludgeon|重锤/i, score: 12, why: '高费攻击升级收益大' },
  { pattern: /immolate|献祭/i, score: 13, why: '清场牌升级后更好用' },
  { pattern: /reaper|收割/i, score: 12, why: '吸血输出升级能多撑精英' },
  { pattern: /perfected strike|完美打击/i, score: 11, why: '和打击族协同，升级后伤害更高' },
  { pattern: /heavy blade|重刃/i, score: 12, why: '力量倍率牌，升级后更配力量流' },
  { pattern: /uppercut|上勾拳/i, score: 11, why: '带易伤/无力的攻击，升级后控制更好' },
  { pattern: /fiend fire|恶魔之火/i, score: 12, why: '爆发牌升级后更能斩杀' },
  { pattern: /backstab|背刺/i, score: 12, why: '0 费升级后伤害更可观' },
  { pattern: /dagger throw|飞刀/i, score: 11, why: '循环牌升级后更能过牌' },
  { pattern: /accuracy|精度/i, score: 13, why: '刀流核心，升级提高所有飞刀伤害' },
  { pattern: /catalyst|催化剂/i, score: 14, why: '毒层翻倍，升级后是斩杀点' },
  { pattern: /burst|双发技能/i, score: 13, why: '技能复制升级后更能爆发' },
  { pattern: /corpse explosion|尸爆/i, score: 12, why: '清场牌升级更稳' },
  { pattern: /ball lightning|球状闪电/i, score: 11, why: '充能球攻击，升级提高伤害' },
  { pattern: /cold snap|寒流/i, score: 11, why: '冰球牌升级后控场更好' },
  { pattern: /glacier|冰川/i, score: 12, why: '格挡加冰球，升级更能防精英' },
  { pattern: /echo form|回响形态/i, score: 16, why: '核心能力牌，升级降低费用' },
  { pattern: /sunder|裂空/i, score: 12, why: '高伤害攻击升级收益高' },
  { pattern: /hyperbeam|超能光线/i, score: 11, why: '大招升级后斩杀线更高' },
  { pattern: /buffer|缓冲/i, score: 13, why: '防斩杀，升级后多层更稳' }
];

function smithHint(card) {
  const text = cardText(card);
  return SMITH_BONUSES.find(item => item.pattern.test(text)) || null;
}

function smithScore(card) {
  if (!card || card.upgraded) return -99;
  const type = String(card.type || '');
  let score = 0;
  const bonus = smithHint(card);
  if (bonus) score += bonus.score;
  if (/power/i.test(type) || /能力/.test(type)) score += 8;
  if (/attack/i.test(type) || /攻击/.test(type)) score += isStrike(card) ? 0 : 5;
  if (/skill/i.test(type) || /技能/.test(type)) score += isDefend(card) ? 0 : 4;
  if (isStrike(card)) score -= 10;
  if (isDefend(card)) score -= 8;
  const cost = Number(card.cost);
  if (cost === 0) score += 3;
  if (cost >= 2) score += 3;
  if (!bonus && !isStrike(card) && !isDefend(card)) score += 2;
  return score;
}

function smithReason(card) {
  const bonus = smithHint(card);
  if (bonus) return bonus.why;
  const type = String(card.type || '');
  if (/power/i.test(type) || /能力/.test(type)) return '能力牌升级后通常能抬高整局上限';
  if (isStrike(card) || isDefend(card)) return '起手打击/防御升级收益偏低，除非没有更好的牌';
  if (Number(card.cost) >= 2) return '高费牌升级后单次行动收益更大';
  return '这张非起手牌升级后，比回那一点血更能提高后续战斗力';
}

module.exports = { isStrike, isDefend, smithHint, smithScore, smithReason };
