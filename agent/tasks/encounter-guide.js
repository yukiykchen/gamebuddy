const { createSpireCodexClient, stripMarkup } = require('../knowledge/spire-codex');
const cardEvaluations = require('../knowledge/card-evaluations.json');
const encounterStrategies = require('../knowledge/encounter-strategies.json');

const codexClient = createSpireCodexClient();
const strategyIndex = new Map((encounterStrategies.encounters || []).map(item => [item.id, item]));

const POWER_NAMES = {
  ARTIFACT: '人工制品',
  STRENGTH: '力量',
  DEXTERITY: '敏捷',
  WEAK: '虚弱',
  VULNERABLE: '易伤',
  FRAIL: '脆弱',
  THORNS: '荆棘',
  REGEN: '再生'
};

function encounterKind(state) {
  if (!state?.combat) return null;
  const room = `${state?.run?.room || ''} ${state?.run?.currentNode || ''}`;
  if (/boss/i.test(room)) return 'Boss';
  if (/elite/i.test(room)) return 'Elite';
  return null;
}

function encounterGuideSignature(state) {
  const kind = encounterKind(state);
  if (!kind) return '';
  return `${state.run?.actId || state.run?.act || '?'}:${state.run?.totalFloor ?? state.run?.floor ?? '?'}:${state.run?.currentCoord || '?'}:${kind}`;
}

function powerName(power) {
  return power?.knowledge?.name || POWER_NAMES[power?.power_id] || power?.power_id || '未知能力';
}

function powerText(power) {
  const amount = Number.isFinite(Number(power?.amount)) ? ` ${power.amount} 层` : '';
  const target = power?.target === 'player' ? '对玩家施加' : power?.target === 'self' ? '自身获得' : '施加';
  const description = stripMarkup(power?.knowledge?.description || '');
  return `${target}${powerName(power)}${amount}${description ? `（${description}）` : ''}`;
}

function damageText(damage) {
  if (!damage || !Number.isFinite(Number(damage.normal))) return '';
  const hits = Math.max(1, Number(damage.hit_count) || 1);
  const base = hits > 1 ? `${damage.normal}×${hits}` : `${damage.normal}`;
  const ascension = Number.isFinite(Number(damage.ascension)) && Number(damage.ascension) !== Number(damage.normal)
    ? `，高阶 ${hits > 1 ? `${damage.ascension}×${hits}` : damage.ascension}`
    : '';
  return `伤害 ${base}${ascension}`;
}

function moveText(move) {
  const intentNames = {
    Attack: '攻击', Defend: '防御', Buff: '强化', Debuff: '减益', Status: '状态牌', Heal: '治疗', Unknown: '未知'
  };
  const intent = String(move.intent || '').split('+').map(item => intentNames[item.trim()] || item.trim()).filter(Boolean).join(' + ');
  const effects = [
    damageText(move.damage),
    Number(move.block) > 0 ? `格挡 ${move.block}` : '',
    Number(move.heal) > 0 ? `治疗 ${move.heal}` : '',
    ...(move.powers || []).map(powerText)
  ].filter(Boolean);
  return `${move.name || move.id || '未知行动'}${effects.length ? `：${effects.join('；')}` : intent ? `：${intent}` : ''}`;
}

function dangerAndTips(monsters) {
  const tags = new Set(monsters.flatMap(monster => monster.mechanicTags || []));
  const dangers = [];
  const tips = [];
  if (tags.has('multi_hit')) {
    dangers.push('存在多段攻击，力量成长会被多次放大');
    tips.push('虚弱和降力量对多段攻击收益很高');
  }
  if (tags.has('burst_damage')) {
    dangers.push('存在高爆发回合');
    tips.push('提前留格挡牌，必要时用药水跨过爆发回合');
  }
  if (tags.has('scaling')) {
    dangers.push('战斗拖久后敌方会成长');
    tips.push('准备稳定成长方案，或集中输出尽快结束战斗');
  }
  if (tags.has('status_cards')) {
    dangers.push('会用状态牌污染抽牌循环');
    tips.push('保留抽牌、消耗或牌堆净化手段');
  }
  if (tags.has('summons') || monsters.length > 1) {
    dangers.push('多目标会同时制造压力');
    tips.push('优先处理关键随从，群体伤害在这里更有价值');
  }
  if (tags.has('artifact')) tips.push('先消耗人工制品，再使用虚弱、易伤等关键减益');
  return {
    dangers: [...new Set(dangers)].slice(0, 4),
    tips: [...new Set(tips)].slice(0, 4)
  };
}

function monsterGuide(monster) {
  const hp = monster.hp || {};
  const hpText = hp.min == null ? 'HP 未收录'
    : hp.max && hp.max !== hp.min ? `HP ${hp.min}–${hp.max}` : `HP ${hp.min}`;
  const ascensionHp = hp.ascensionMin == null ? null
    : hp.ascensionMax && hp.ascensionMax !== hp.ascensionMin
      ? `高阶 ${hp.ascensionMin}–${hp.ascensionMax}`
      : `高阶 ${hp.ascensionMin}`;
  const innate = (monster.innatePowers || []).map(power => {
    const description = stripMarkup(power.knowledge?.description || '');
    const amount = Number.isFinite(Number(power.amount)) ? ` ${power.amount} 层` : '';
    return `${powerName(power)}${amount}${description ? `：${description}` : ''}`;
  });
  const moveNames = new Map((monster.moves || []).map(move => [move.id, move.name || move.id]));
  const inferredCycle = (monster.attackPattern?.states || [])
    .filter(state => state.type === 'move' && state.move_id)
    .map(state => moveNames.get(state.move_id) || state.move_id)
    .join(' → ');
  const cycle = stripMarkup(monster.attackPattern?.description || inferredCycle)
    .replace(/\brepeat\b/gi, '循环')
    .replace(/\bStarts:\s*/gi, '起手：')
    .replace(/\bthen conditional:\s*/gi, '随后按条件：');
  return {
    id: monster.id,
    name: monster.name,
    hp: [hpText, ascensionHp].filter(Boolean).join('；'),
    innate,
    cycle: cycle || '行动会在下列招式中按游戏条件选择',
    moves: (monster.moves || []).map(moveText)
  };
}

function communityStrategy(encounter) {
  const profile = strategyIndex.get(encounter?.id);
  if (!profile) return null;
  return {
    summary: profile.summary,
    dangerWindows: profile.dangerWindows || [],
    deckChecks: profile.deckChecks || [],
    priorityTargets: profile.priorityTargets || [],
    tips: profile.tips || [],
    avoid: profile.avoid || [],
    confidence: profile.confidence,
    reviewStatus: profile.reviewStatus,
    capturedAt: encounterStrategies.capturedAt,
    sources: (profile.sources || []).map(sourceId => {
      const source = encounterStrategies.sources?.[sourceId];
      return source ? { id: sourceId, title: source.title, url: source.url } : { id: sourceId };
    })
  };
}

async function buildEncounterGuide(state, { codex = codexClient, now = Date.now() } = {}) {
  const kind = encounterKind(state);
  if (!kind) return null;
  try {
    const knowledge = await codex.loadEncounterContext(state);
    const monsters = (knowledge.monsters || []).map(monsterGuide);
    if (!monsters.length) throw new Error('no matching monsters');
    const advice = dangerAndTips(knowledge.monsters || []);
    const strategy = communityStrategy(knowledge.encounter);
    return {
      schema: 'gamebuddy.encounter-guide.v1',
      timestamp: now,
      kind: kind.toLowerCase(),
      title: knowledge.encounter?.name || monsters.map(monster => monster.name).join(' + '),
      source: knowledge.source,
      gameVersion: cardEvaluations.game?.version || null,
      monsters,
      strategy,
      dangers: [...new Set([...(strategy?.dangerWindows || []), ...advice.dangers])].slice(0, 6),
      tips: [...new Set([...(strategy?.tips || []), ...advice.tips])].slice(0, 7)
    };
  } catch {
    const names = (state.combat?.enemies || []).map(enemy => enemy?.name).filter(Boolean);
    return {
      schema: 'gamebuddy.encounter-guide.v1',
      timestamp: now,
      kind: kind.toLowerCase(),
      title: names.join(' + ') || kind,
      source: 'bridge',
      gameVersion: cardEvaluations.game?.version || null,
      monsters: names.map(name => ({ name, hp: '资料暂未匹配', innate: [], cycle: '暂无可靠机制资料', moves: [] })),
      strategy: null,
      dangers: [],
      tips: ['Spire Codex 暂时不可用或未匹配该敌人；本次不生成猜测内容。']
    };
  }
}

module.exports = { encounterKind, encounterGuideSignature, buildEncounterGuide, moveText, dangerAndTips };
