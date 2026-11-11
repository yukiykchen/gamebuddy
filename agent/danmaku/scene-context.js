'use strict';

const { createLanguageProfile } = require('./language-profile');

const CONTROL = /[\u0000-\u001f\u007f]/g;
const KNOWN_KINDS = new Set(['attack', 'defend', 'heal', 'buff', 'debuff', 'status', 'summon']);

function cleanText(value) {
  return String(value ?? '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeOneIntent(value) {
  const text = cleanText(value).toLowerCase();
  if (!text || text === 'none') return null;
  if (/heal/.test(text)) return 'heal';
  if (/attack|hit|strike|damage|deathblow/.test(text)) return 'attack';
  if (/carddebuff|debuff/.test(text)) return 'debuff';
  if (/status/.test(text)) return 'status';
  if (/buff|strength|ritual|enrage/.test(text)) return 'buff';
  if (/block|defend|guard/.test(text)) return 'defend';
  if (/summon/.test(text)) return 'summon';
  return null;
}

function parseIntentKinds(intent, intentKinds) {
  if (Array.isArray(intentKinds) && intentKinds.length) {
    return [...new Set(intentKinds.map(value => cleanText(value).toLowerCase()).filter(kind => KNOWN_KINDS.has(kind)))];
  }
  return [...new Set(String(intent ?? '').split('|').map(normalizeOneIntent).filter(Boolean))];
}

function primaryIntentKind(kinds = []) {
  if (kinds.includes('heal')) return 'heal';
  if (kinds.includes('attack')) return 'attack';
  const status = kinds.find(kind => kind === 'status' || kind === 'buff' || kind === 'debuff');
  if (status) return status;
  if (kinds.includes('defend')) return 'defend';
  return kinds[0] || null;
}

function normalizeIntent(intent, intentKinds) {
  return primaryIntentKind(parseIntentKinds(intent, intentKinds)) || 'none';
}

function categoryLabel(kind) {
  if (kind === 'heal') return '回血';
  if (kind === 'attack') return '攻击';
  if (kind === 'defend') return '防御';
  if (kind === 'buff') return '强化';
  if (kind === 'debuff') return '减益';
  if (kind === 'status') return '状态';
  return '';
}

function keywordLabel(kind) {
  if (kind === 'heal') return '回血';
  if (kind === 'attack') return '攻击意图';
  if (kind === 'defend') return '防御';
  if (kind === 'buff') return '强化';
  if (kind === 'debuff') return '减益';
  if (kind === 'status') return '状态';
  if (kind === 'summon') return '召唤';
  return '';
}

function healthBand(hp, maxHp) {
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) return 'unknown';
  const ratio = hp / maxHp;
  if (ratio <= 0.25) return 'low';
  if (ratio <= 0.5) return 'caution';
  return 'healthy';
}

function eventTrigger(name) {
  const value = cleanText(name).toLowerCase();
  if (value === 'card.played') return 'card_played';
  if (value === 'combat.ended') return 'general';
  if (['enemy.spawned', 'enemy.revived', 'enemy.phase_changed'].includes(value)) return 'mechanic';
  return 'general';
}

function uniqueEnemyNames(enemies = []) {
  const seen = new Set();
  return enemies.filter(enemy => enemy?.name && !seen.has(enemy.name) && seen.add(enemy.name)).map(enemy => enemy.name);
}

function extractSceneContext({ state = {}, trigger, event } = {}) {
  const combat = state.combat || null;
  const player = state.player || {};
  const enemies = (combat?.enemies || [])
    .map((enemy, slot) => {
      if (!enemy || enemy.alive === false || enemy.hp === 0) return null;
      const intentKinds = parseIntentKinds(enemy?.intent, enemy?.intentKinds);
      return {
        key: `${cleanText(enemy?.name)}#${slot}`,
        slot,
        id: cleanText(enemy?.id),
        name: cleanText(enemy?.name),
        intent: primaryIntentKind(intentKinds) || 'none',
        intentKinds,
        hp: Number.isFinite(enemy?.hp) ? enemy.hp : null,
        maxHp: Number.isFinite(enemy?.maxHp) ? enemy.maxHp : null,
        block: Number.isFinite(enemy?.block) ? enemy.block : null,
        nextMoveId: cleanText(enemy?.nextMoveId),
        nextMoveName: cleanText(enemy?.nextMoveName)
      };
    })
    .filter(enemy => enemy?.name);
  const playerHp = Number.isFinite(player.hp) ? player.hp : null;
  const playerMaxHp = Number.isFinite(player.maxHp) ? player.maxHp : null;
  const resolvedTrigger = trigger || eventTrigger(event?.name);
  const intentKinds = [...new Set(enemies.flatMap(enemy => enemy.intentKinds))];
  const keywords = [
    combat ? '战斗' : cleanText(state.run?.room) || '场景',
    ...uniqueEnemyNames(enemies),
    ...intentKinds.map(kind => keywordLabel(kind) || kind),
    cleanText(event?.cardName || event?.data?.cardName || event?.data?.card?.name)
  ].filter(Boolean);
  const baseContext = {
    scene: combat ? 'combat' : 'general',
    trigger: resolvedTrigger,
    keywords: [...new Set(keywords)],
    enemyNames: uniqueEnemyNames(enemies),
    enemies,
    attackEnemyNames: enemies.filter(enemy => enemy.intent === 'attack').map(enemy => enemy.name),
    intentKinds,
    hpBand: healthBand(playerHp, playerMaxHp),
    turn: Number.isInteger(combat?.turn) ? combat.turn : null,
    playerHp,
    playerMaxHp,
    energy: Number.isFinite(player.energy) ? player.energy : null,
    block: Number.isFinite(player.block) ? player.block : null,
    cardName: cleanText(event?.cardName || event?.data?.cardName || event?.data?.card?.name) || null,
    character: cleanText(state.run?.character).toLowerCase() || null,
    room: cleanText(state.run?.room).toLowerCase() || null,
    event
  };
  const profile = createLanguageProfile(baseContext);
  return { ...baseContext, ...profile };
}

function factLines(context, { previousHp, event } = {}) {
  const trigger = context?.trigger;
  if (trigger === 'entry') return uniqueEnemyNames(context.enemies);
  if (trigger === 'card_played' && context.cardName) return [`已使用「${context.cardName}」。`];
  if (trigger === 'mechanic') {
    const name = cleanText(event?.name);
    if (name === 'enemy.spawned') return ['出现了新的敌人。'];
    if (name === 'enemy.revived') return ['敌人已复活。'];
    if (name === 'enemy.phase_changed') return ['敌人阶段发生变化。'];
  }
  if (trigger === 'victory') return ['战斗胜利。'];
  if (trigger === 'defeat') return ['战斗结束。'];
  return [];
}

module.exports = {
  cleanText,
  normalizeIntent,
  normalizeOneIntent,
  parseIntentKinds,
  primaryIntentKind,
  categoryLabel,
  keywordLabel,
  uniqueEnemyNames,
  healthBand,
  eventTrigger,
  extractSceneContext,
  factLines
};
