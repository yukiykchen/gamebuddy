'use strict';

const { codex, lookupMonster, lookupPower, stripMarkup } = require('../codex-db');
const { mechanicTags, rankEncounterMatches } = require('../knowledge/spire-codex');
const { actionDialogue, classifyMove, CATEGORY_LABELS } = require('./action-dialogue');
const { createMonsterDisplayName } = require('./monster-identity');

const NATURAL_FACTS = {
  multi_hit: enemy => `${enemy}的攻击可能连续命中。`,
  aoe: enemy => `${enemy}可能同时压迫多个目标。`,
  summons: enemy => `${enemy}可能召来帮手。`,
  status_cards: enemy => `${enemy}可能塞入状态牌。`,
  scaling: enemy => `${enemy}会在战斗中逐渐变强。`,
  debuffs: enemy => `${enemy}可能施加减益。`,
  artifact: enemy => `${enemy}带有人工制品保护。`,
  thorns: enemy => `${enemy}会造成反伤。`,
  healing: enemy => `${enemy}可能回复生命。`,
  block: enemy => `${enemy}可能获得格挡。`
};

const MECHANIC_PRIORITY = [
  ['summons', '会召唤', 5],
  ['healing', '会回复', 4],
  ['scaling', '会成长', 4],
  ['status_cards', '会污染牌堆', 3],
  ['multi_hit', '有多段攻击', 2],
  ['thorns', '有反伤', 2],
  ['artifact', '有人工制品', 1],
  ['debuffs', '会施加减益', 1]
];

const COMBAT_POWERS = new Set(['STRENGTH', 'DEXTERITY']);

function intentKindFromMove(intent) {
  const value = String(intent || '').toLowerCase();
  if (/heal/.test(value)) return 'heal';
  if (/attack/.test(value)) return 'attack';
  if (/debuff/.test(value)) return 'debuff';
  if (/status/.test(value)) return 'status';
  if (/buff/.test(value)) return 'buff';
  if (/defend|block/.test(value)) return 'defend';
  return null;
}

function powerEffect(power) {
  const record = lookupPower(power?.power_id || power?.id);
  const name = record?.name || power?.name || power?.power_id;
  if (!name) return '';
  const amount = Number.isFinite(power?.amount) ? power.amount : null;
  const self = !power?.target || power.target === 'self';
  if (amount === null) return self ? `获得${name}` : `对你施加${name}`;
  if (self) return `${amount >= 0 ? '获得' : '失去'}${Math.abs(amount)}${name}`;
  return `${amount >= 0 ? '给你施加' : '使你失去'}${Math.abs(amount)}${name}`;
}

function statusCardsFor(monster) {
  const id = String(monster?.id || '').toUpperCase();
  if (!id) return [];
  const cards = [];
  for (const card of codex.cards) {
    const sourced = (card.sources || []).some(source => (
      String(source?.type || '').toLowerCase() === 'monster'
      && String(source.id || '').toUpperCase() === id
    ));
    if (!sourced || cards.some(existing => existing.id === card.id)) continue;
    if (card.type !== '状态' && card.type_key !== 'Status') continue;
    cards.push(card);
  }
  return cards;
}

function statusCardEffect(card) {
  const cost = Number.isFinite(Number(card?.cost)) ? `${Number(card.cost)}费` : '';
  const description = stripMarkup(card?.description || '').replace(/。$/, '');
  const keywords = (card?.keywords || []).filter(Boolean).join('、');
  return [cost, description, keywords].filter(Boolean).join('，');
}

function hoverEffect(move, monster) {
  if (!move) return '';
  const parts = [];
  for (const power of move.powers || []) {
    const record = lookupPower(power?.power_id || power?.id);
    const name = record?.name || power?.name || power?.power_id;
    if (!name) continue;
    const id = String(power?.power_id || power?.id || '').toUpperCase();
    const amount = Number.isFinite(power?.amount) ? power.amount : null;
    const scope = COMBAT_POWERS.has(id) ? '本场战斗' : '';
    if (amount === null) {
      parts.push(`${scope}${name}`);
      continue;
    }
    const signed = `${amount >= 0 ? '+' : ''}${amount}`;
    parts.push(`${scope}${name}${signed}`);
  }
  if (Number.isFinite(move.block)) parts.push(`本回合格挡+${move.block}`);
  if (Number.isFinite(move.heal)) parts.push(`回复${move.heal}点生命`);
  const damage = Number.isFinite(move?.damage?.normal) ? move.damage.normal : null;
  const hits = Number.isFinite(move?.damage?.hit_count) ? move.damage.hit_count : Number.isFinite(move?.hit_count) ? move.hit_count : null;
  if (damage !== null) parts.push(hits > 1 ? `伤害${damage}×${hits}` : `伤害${damage}`);
  if (!parts.length && /status/i.test(String(move.intent || ''))) {
    const inserted = statusCardsFor(monster).map(card => {
      const effect = statusCardEffect(card);
      return effect ? `塞入${card.name}（${effect}）` : `塞入${card.name}`;
    });
    if (inserted.length) parts.push(inserted.join('，'));
  }
  if (!parts.length && move.description) parts.push(stripMarkup(move.description));
  return parts.join('，');
}

function summarizeMove(move) {
  if (!move) return '';
  const parts = [];
  const damage = Number.isFinite(move?.damage?.normal) ? move.damage.normal : null;
  const hits = Number.isFinite(move?.damage?.hit_count) ? move.damage.hit_count : Number.isFinite(move?.hit_count) ? move.hit_count : null;
  if (damage !== null) parts.push(hits > 1 ? `造成${damage}点伤害${hits}次` : `造成${damage}点伤害`);
  if (Number.isFinite(move.block)) parts.push(`获得${move.block}点格挡`);
  if (Number.isFinite(move.heal)) parts.push(`回复${move.heal}点生命`);
  for (const power of move.powers || []) {
    const text = powerEffect(power);
    if (text) parts.push(text);
  }
  if (move.description) parts.push(stripMarkup(move.description));
  return parts.join('，');
}

function moveById(monster) {
  return new Map((monster?.moves || []).map(move => [String(move.id || '').toUpperCase(), move]));
}

function moveCycleNames(monster) {
  const moves = (monster?.moves || []).filter(move => move?.name || move?.id);
  const byId = moveById(monster);
  const states = (monster?.attack_pattern?.states || []).filter(state => state?.type === 'move' && state.move_id);
  if (states.length >= 2) {
    const stateById = new Map(states.map(state => [state.id, state]));
    const names = [];
    const seen = new Set();
    let current = states[0];
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      const move = byId.get(String(current.move_id).toUpperCase());
      names.push(move?.name || current.move_id);
      current = stateById.get(current.next);
    }
    if (names.length >= 2) return names;
  }
  return moves.map(move => move.name || move.id);
}

function mechanicPoint(monster) {
  const tags = new Set(mechanicTags(monster));
  const hit = MECHANIC_PRIORITY.find(([tag]) => tags.has(tag));
  return hit ? hit[1] : '';
}

function scoreMonster(monster) {
  const tags = new Set(mechanicTags(monster));
  return MECHANIC_PRIORITY.reduce((sum, [tag, , score]) => sum + (tags.has(tag) ? score : 0), 0);
}

function findMove(monster, enemy) {
  const moves = monster?.moves || [];
  const key = String(enemy?.nextMoveId || '').toUpperCase();
  const named = moves.find(candidate => (
    (key && String(candidate.id || '').toUpperCase() === key)
    || (!key && enemy?.nextMoveName && candidate.name === enemy.nextMoveName)
  ));
  if (named) return named;
  const kind = enemy?.intent;
  if (!kind) return null;
  const matches = moves.filter(candidate => intentKindFromMove(candidate.intent) === kind);
  return matches.length === 1 ? matches[0] : null;
}

function isSimpleMove(move, enemy) {
  if (!move) return enemy?.intent === 'attack' || enemy?.intent === 'defend';
  const powers = (move.powers || []).length > 0;
  const heal = Number.isFinite(move.heal) && move.heal > 0;
  const block = Number.isFinite(move.block) && move.block > 0;
  const damage = Number.isFinite(move?.damage?.normal);
  const hits = Number(move?.damage?.hit_count) || Number(move?.hit_count) || 1;
  const intent = String(move.intent || '');
  if (powers || heal || intent.includes('+')) return false;
  if (/debuff|status|buff|heal/i.test(intent)) return false;
  if (damage && hits > 1) return false;
  if (damage && !block) return true;
  if (block && !damage) return true;
  return false;
}

function encounterKind(room) {
  const value = String(room || '');
  if (/boss/i.test(value)) return 'Boss';
  if (/elite/i.test(value)) return 'Elite';
  return 'Normal';
}

function encounterTitle(enemies = [], { act, actId, room } = {}) {
  const alive = enemies.filter(enemy => enemy?.name && enemy.alive !== false);
  const match = rankEncounterMatches(codex.encounters, alive, {
    kind: encounterKind(room),
    act,
    actId
  })[0];
  if (match?.exactComposition && match.item?.name) return match.item.name;
  return alive[0]?.name || '';
}

function dangerAndAdvice(monsters = []) {
  const tags = new Set(monsters.flatMap(monster => mechanicTags(monster)));
  const dangers = [];
  const advice = [];
  if (tags.has('multi_hit')) {
    dangers.push('存在多段攻击，力量成长后压力会被放大');
    advice.push('保留稳定格挡、虚弱或降力量手段');
  }
  if (tags.has('scaling')) {
    dangers.push('拖得越久，敌人的攻击或能力越危险');
    advice.push('不要只防守，尽快推进有效输出');
  }
  if (tags.has('status_cards')) {
    dangers.push('会向牌堆加入状态牌，影响后续抽牌');
    advice.push('保留抽牌、弃牌或消耗状态牌的手段');
  }
  if (tags.has('summons')) {
    dangers.push('会召唤额外敌人，场面压力会增加');
    advice.push('优先减少召唤源或敌人数量');
  }
  if (tags.has('healing')) {
    dangers.push('敌人能够回复生命，拖延会抵消输出');
    advice.push('围绕治疗窗口集中输出');
  }
  if (tags.has('thorns')) {
    dangers.push('反伤会惩罚连续的小额攻击');
    advice.push('优先使用高价值单次攻击或非攻击伤害');
  }
  if (tags.has('debuffs')) {
    dangers.push('会施加减益，后续攻防效率可能下降');
    advice.push('危险回合先保证生存，不要只看当前数值');
  }
  return {
    dangers: [...new Set(dangers)].slice(0, 4),
    advice: [...new Set(advice)].slice(0, 4)
  };
}

function monsterIntroLine(enemy, displayName = enemy?.name) {
  const monster = lookupMonster(enemy?.id || enemy?.name);
  const name = displayName || enemy?.name || monster?.name;
  if (!name) return '';
  const point = monster ? mechanicPoint(monster) : '';
  const cycle = monster ? moveCycleNames(monster) : [];
  const cycleText = cycle.length ? `循环 ${cycle.join(' → ')}` : '';
  const body = [point, cycleText].filter(Boolean).join('，');
  return body ? `${name}：${body}` : name;
}

function entryKnowledgeFacts(enemies = [], context = {}) {
  const alive = enemies.filter(enemy => enemy?.name && enemy.alive !== false);
  const title = encounterTitle(alive, context);
  if (!title) return [];
  const lines = [];
  const seen = new Set();
  const indexes = new Map();
  const detailMonsters = [];
  for (const enemy of alive) {
    const key = `${enemy.id || enemy.name}`;
    const index = indexes.get(key) || 0;
    indexes.set(key, index + 1);
    const displayName = createMonsterDisplayName({ sceneId: context.sceneId, monsterId: enemy.id, name: enemy.name, index });
    const monster = lookupMonster(enemy.id || enemy.name);
    const line = monsterIntroLine(enemy, displayName);
    const cycle = monster ? moveCycleNames(monster) : [];
    if (seen.has(enemy.name)) continue;
    seen.add(enemy.name);
    if (line) lines.push(line);
    detailMonsters.push({ enemy, monster, displayName, cycle });
  }
  const grouped = new Map();
  for (const enemy of alive) grouped.set(enemy.name, (grouped.get(enemy.name) || 0) + 1);
  const firstName = [...grouped.keys()][0] || title;
  const count = grouped.get(firstName) || alive.length;
  const countText = count === 2 ? '两只' : count === 3 ? '三只' : count === 4 ? '四只' : `${count}只`;
  const text = grouped.size === 1
    ? `${count > 1 ? countText : ''}${firstName}来袭～`
    : `${alive.length > 1 ? '一群' : ''}敌人来袭～`;
  const rawMonsters = detailMonsters.map(item => item.monster).filter(Boolean);
  const danger = dangerAndAdvice(rawMonsters);
  const detailLines = [
    ...lines,
    ...(danger.dangers.length ? [`危险点：${danger.dangers.join('；')}`] : []),
    ...(danger.advice.length ? [`建议：${danger.advice.join('；')}`] : [])
  ];
  return [{
    text,
    detail: { title: '遭遇详情', lines: detailLines, source: 'codex' },
    displayNames: detailMonsters.map(item => ({ id: item.enemy.id || item.enemy.name, name: item.displayName }))
  }];
}

function encounterPriorityFact(enemies = []) {
  const alive = enemies.filter(enemy => enemy?.name);
  if (alive.length < 2) return null;
  const ranked = alive.map(enemy => {
    const monster = lookupMonster(enemy.id || enemy.name);
    return {
      enemy,
      reason: monster ? mechanicPoint(monster) : '',
      score: monster ? scoreMonster(monster) : 0
    };
  }).sort((left, right) => right.score - left.score);
  const top = ranked.find(item => item.score > 0);
  if (!top?.enemy?.name) return null;
  const text = top.reason ? `优先处理${top.reason}的${top.enemy.name}` : `优先处理${top.enemy.name}`;
  return {
    text,
    detail: { title: top.enemy.name, lines: [text], source: 'codex' }
  };
}

function codexFactCandidates(enemies = []) {
  const seen = new Set();
  const output = [];
  const add = (text, tag, monsterId, detail) => {
    if (!text || seen.has(`${monsterId}:${tag}`) || output.length >= 3) return;
    seen.add(`${monsterId}:${tag}`);
    output.push({
      text,
      source: 'codex',
      memeFamily: `codex-${tag}`,
      mechanismTag: tag,
      monsterId,
      detail
    });
  };
  for (const enemy of enemies) {
    const monster = lookupMonster(enemy?.id || enemy?.name);
    if (!monster || !enemy?.name) continue;
    const monsterId = monster.id || enemy.id || null;
    const detail = monsterDetail(enemy);
    const cycle = moveCycleNames(monster);
    if (cycle.length) add(`${enemy.name}循环：${cycle.join(' → ')}。`, 'cycle', monsterId, detail);
    for (const tag of mechanicTags(monster)) {
      if (NATURAL_FACTS[tag]) add(NATURAL_FACTS[tag](enemy.name), tag, monsterId, detail);
      if (output.length >= 3) return output;
    }
  }
  return output;
}

function monsterDetail(enemy, { priorityLine } = {}) {
  const monster = lookupMonster(enemy?.id || enemy?.name);
  if (!monster) return null;
  const name = enemy.name || monster.name || monster.id;
  const lines = [];
  const cycle = moveCycleNames(monster);
  if (cycle.length) lines.push(`循环 ${cycle.join(' → ')}`);
  if (priorityLine) lines.push(priorityLine);
  const point = mechanicPoint(monster);
  if (point && !lines.some(line => line.includes(point))) lines.push(point);
  return { title: name, lines: lines.slice(0, 3), monsterId: monster.id || null, source: 'codex' };
}

function currentMoveDetail(enemy) {
  const monster = lookupMonster(enemy?.id || enemy?.name);
  if (!monster) return null;
  const move = findMove(monster, enemy);
  if (!move) return null;
  const effect = hoverEffect(move, monster);
  return {
    title: move.name || enemy.nextMoveName || move.id,
    effect,
    lines: effect ? [effect] : [],
    moveId: move.id || null,
    monsterId: monster.id || enemy.id || null,
    source: 'codex'
  };
}

function nextActionFact(enemy, { categoryLabel, sceneId = '', occurrence = 0, displayName } = {}) {
  const monster = lookupMonster(enemy?.id || enemy?.name);
  const move = monster ? findMove(monster, enemy) : null;
  const detail = currentMoveDetail(enemy);
  const actionName = detail?.title || enemy?.nextMoveName || (typeof categoryLabel === 'function' ? categoryLabel(enemy.intent) : '') || CATEGORY_LABELS[enemy.intent] || '特殊行动';
  const dialogue = actionDialogue({
    moveName: actionName,
    move: move || { intent: enemy?.intent },
    enemy,
    sceneId,
    occurrence
  });
  const source = enemy?.nextMoveId || enemy?.nextMoveName ? 'mod' : (move ? 'codex' : 'unknown');
  const detailLines = [
    `行动：${actionName}`,
    `类型：${dialogue.categoryLabel}`,
    detail?.effect
      ? `效果：${detail.effect}`
      : dialogue.category === 'attack' || dialogue.category === 'heavy_attack' || dialogue.category === 'multi_hit'
        ? '效果：造成伤害'
        : '效果：以游戏内显示为准',
    `来源：${source === 'mod' ? 'Mod 当前行动数据' : source === 'codex' ? 'Spire Codex' : '未知'}`
  ];
  if (enemy?.name) {
    return {
      text: dialogue.text,
      variants: dialogue.variants,
      detail: {
        title: `${displayName || enemy.name}刚才大概是这么说的`,
        lines: detailLines,
        source
      },
      notable: true,
      moveKey: detail?.moveId || enemy?.nextMoveId || actionName,
      kind: enemy.intent,
      category: dialogue.category
    };
  }
  return null;
}

module.exports = {
  codexFactCandidates,
  entryKnowledgeFacts,
  encounterPriorityFact,
  monsterDetail,
  currentMoveDetail,
  nextActionFact,
  dangerAndAdvice,
  classifyMove,
  CATEGORY_LABELS,
  isSimpleMove,
  summarizeMove,
  hoverEffect,
  moveCycleNames,
  NATURAL_FACTS
};
