const { createSpireCodexClient, normalizeKey, stripMarkup } = require('../knowledge/spire-codex');
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
  return 'Normal';
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
  if (tags.has('debuffs')) {
    dangers.push('会施加虚弱、易伤或脆弱，后续攻防效率可能下降');
    tips.push('关键减益回合优先保证生存，不要依赖刚好够用的攻防数值');
  }
  if (tags.has('block')) tips.push('把主要输出安排在敌人没有建立格挡的窗口');
  if (tags.has('thorns')) {
    dangers.push('反伤会惩罚大量低伤害攻击次数');
    tips.push('优先使用高价值单次攻击或非攻击伤害，并为反伤保留生命与格挡余量');
  }
  if (tags.has('healing')) {
    dangers.push('敌人能够治疗或再生，拖延会抵消已经投入的输出');
    tips.push('围绕治疗窗口集中输出，优先压制能持续回复的目标');
  }
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
    basis: 'community',
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

function mechanicStrategy(knowledge, state, advice = dangerAndTips(knowledge?.monsters || [])) {
  const monsters = knowledge?.monsters || [];
  const tags = new Set(monsters.flatMap(monster => monster.mechanicTags || []));
  const multiTarget = (state?.combat?.enemies || []).filter(enemy => enemy?.alive !== false).length > 1 || monsters.length > 1;
  const summary = tags.has('summons')
    ? '召唤型遭遇。尽早压制召唤源并减少场上敌人数量，避免压力随回合扩大。'
    : tags.has('scaling')
      ? '成长型普通战。完成必要启动后尽快转入输出，避免把战斗拖进敌方成长阶段。'
      : tags.has('status_cards')
        ? '牌堆污染战。兼顾前置输出与牌堆整理，避免状态牌让后续回合失去行动力。'
        : multiTarget
          ? '多目标节奏战。集中火力先减少一个行动者，通常比平均压低所有敌人更稳。'
          : '常规单体战。根据行动循环安排攻防，在安全回合推进输出并避免无效拖延。';
  const deckChecks = [];
  if (multiTarget || tags.has('summons')) deckChecks.push('群体伤害，或能快速完成第一次点杀的单体爆发');
  if (tags.has('multi_hit')) deckChecks.push('稳定格挡、虚弱或降力量手段');
  if (tags.has('status_cards')) deckChecks.push('额外抽牌、弃牌、消耗或其他牌堆整理能力');
  if (tags.has('scaling')) deckChecks.push('能在前几个循环结束战斗的前置输出');
  if (tags.has('artifact')) deckChecks.push('廉价减益用于消耗人工制品，再施加关键控制');
  if (tags.has('thorns')) deckChecks.push('高价值单次攻击、非攻击伤害或足够的反伤承受能力');
  if (tags.has('healing')) deckChecks.push('能压过治疗或再生的集中输出');
  if (!deckChecks.length) deckChecks.push('稳定的基础攻防，以及坏抽牌时仍能执行的低费牌');

  const activeEnemies = state?.combat?.enemies || [];
  const activeByKey = new Map(activeEnemies.flatMap(enemy => [
    [normalizeKey(enemy.id), enemy],
    [normalizeKey(enemy.name), enemy]
  ]).filter(([key]) => key));
  const targetOrder = monsters.map(monster => {
    const monsterTags = new Set(monster.mechanicTags || []);
    const active = activeByKey.get(normalizeKey(monster.id)) || activeByKey.get(normalizeKey(monster.name));
    const attacking = /attack/i.test(String(active?.intent || ''));
    const score = (monsterTags.has('summons') ? 5 : 0)
      + (monsterTags.has('healing') ? 4 : 0)
      + (monsterTags.has('scaling') ? 4 : 0)
      + (monsterTags.has('status_cards') ? 3 : 0)
      + (monsterTags.has('multi_hit') ? 2 : 0)
      + (attacking ? 1 : 0);
    const reasons = [];
    if (monsterTags.has('summons')) reasons.push('会召唤');
    if (monsterTags.has('healing')) reasons.push('会回复');
    if (monsterTags.has('scaling')) reasons.push('会成长');
    if (monsterTags.has('status_cards')) reasons.push('会污染牌堆');
    if (monsterTags.has('multi_hit')) reasons.push('有多段攻击');
    if (attacking) reasons.push('当前显示攻击意图');
    return { name: monster.name, score, reasons };
  }).sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, 'zh-CN'));
  const priorityTargets = multiTarget
    ? [targetOrder[0]?.score > 0
      ? `优先处理「${targetOrder[0].name}」：${targetOrder[0].reasons.join('、')}，更容易扩大场面压力`
      : '优先击杀本回合能够安全收掉的目标，尽快减少敌方行动次数']
    : ['单体遭遇；围绕敌人的行动循环安排输出和防御'];

  const avoid = [];
  if (multiTarget) avoid.push('平均分散单体伤害，导致多个敌人持续行动');
  if (tags.has('scaling') || tags.has('summons')) avoid.push('只做长期准备而不削减敌方数量或推进击杀');
  if (tags.has('status_cards')) avoid.push('忽略牌堆污染，直到关键回合抽满状态牌');
  if (tags.has('artifact')) avoid.push('把关键虚弱或易伤直接浪费在人工制品上');
  if (tags.has('thorns')) avoid.push('连续使用大量低价值攻击，无谓承受多次反伤');
  if (tags.has('healing')) avoid.push('在敌人即将回复时平均分散输出，无法形成有效击杀压力');
  if (!avoid.length) avoid.push('安全回合过度防御，或危险回合为了贪输出放弃必要防守');

  return {
    basis: 'mechanics',
    summary,
    dangerWindows: advice.dangers.length ? advice.dangers : ['敌人行动模式已确认，但没有额外的高危机制标签'],
    deckChecks: deckChecks.slice(0, 4),
    priorityTargets,
    tips: (advice.tips.length ? advice.tips : ['观察当前意图，在安全回合输出、危险回合保留必要防守']).slice(0, 5),
    avoid: avoid.slice(0, 4),
    confidence: null,
    reviewStatus: 'mechanic-derived',
    capturedAt: encounterStrategies.capturedAt,
    sources: [{ id: 'spire-codex', title: 'Spire Codex encounters and monsters API', url: 'https://spire-codex.com/api' }]
  };
}

function unavailableStrategy(names) {
  return {
    basis: 'unavailable',
    summary: `${names.join(' + ') || '本场敌人'}的完整机制资料暂未匹配，本次只提供保守提示。`,
    dangerWindows: ['注意游戏当前显示的攻击、强化、减益或召唤意图'],
    deckChecks: ['保留基础攻防与药水，不依据未知机制提前消耗关键资源'],
    priorityTargets: names.length > 1 ? ['优先减少能够安全击杀的敌人数量'] : ['根据当前意图安排攻防'],
    tips: ['Spire Codex 暂时不可用或未匹配该敌人；本次不生成具体机制猜测。'],
    avoid: ['不要把未确认的行动循环当成确定事实'],
    confidence: null,
    reviewStatus: 'unavailable',
    sources: []
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
    const strategy = communityStrategy(knowledge.encounter) || mechanicStrategy(knowledge, state, advice);
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
      strategy: unavailableStrategy(names),
      dangers: ['注意游戏当前显示的攻击、强化、减益或召唤意图'],
      tips: ['Spire Codex 暂时不可用或未匹配该敌人；本次不生成具体机制猜测。']
    };
  }
}

module.exports = { encounterKind, encounterGuideSignature, buildEncounterGuide, moveText, dangerAndTips, mechanicStrategy };
