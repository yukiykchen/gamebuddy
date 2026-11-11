'use strict';

// 共享弹幕只按“职业 + 场景对象”归类，时机只有 combat / death 两种。
// 细节标签不参与主键，避免每个玩家的生命、手牌差异把场景切得过碎。
const GAME_VERSION = 'sts2-v1';

const CHARACTER_NAMES = {
  ironclad: 'ironclad',
  warrior: 'ironclad',
  战士: 'ironclad',
  铁甲战士: 'ironclad',
  silent: 'silent',
  猎手: 'silent',
  静默猎手: 'silent',
  defect: 'defect',
  机器人: 'defect',
  故障机器人: 'defect',
  regent: 'regent',
  统御者: 'regent',
  necrobinder: 'necrobinder',
  死灵法师: 'necrobinder'
};

function token(value, fallback = 'unknown') {
  const text = String(value || '').trim().toLowerCase();
  const normalized = text
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^\p{Letter}\p{Number}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function characterKey(character) {
  const raw = String(character || '').trim().toLowerCase();
  return CHARACTER_NAMES[raw] || token(raw, 'unknown-character');
}

function enemyKey(enemy) {
  return token(enemy?.id || enemy?.name, 'unknown-enemy');
}

function sceneObjectKey(state = {}) {
  const enemies = (state.combat?.enemies || [])
    .filter(enemy => enemy?.name && enemy.alive !== false)
    .map(enemyKey)
    .sort();
  return enemies.length ? enemies.join('+') : 'unknown-scene';
}

function buildSharedScene(state, phase = 'combat') {
  const normalizedPhase = phase === 'death' ? 'death' : 'combat';
  const character = characterKey(state?.run?.character);
  const objectKey = sceneObjectKey(state);
  return {
    gameVersion: GAME_VERSION,
    character,
    sceneType: 'combat',
    objectKey,
    sceneKey: `${GAME_VERSION}:${character}:combat:${objectKey}`,
    phase: normalizedPhase,
    tags: [
      state?.combat ? 'combat_active' : 'combat_closed',
      ...(state?.combat?.enemies || []).filter(enemy => enemy?.alive !== false).map(enemy => `enemy:${enemyKey(enemy)}`)
    ].slice(0, 12)
  };
}

module.exports = {
  GAME_VERSION,
  characterKey,
  sceneObjectKey,
  buildSharedScene,
  token
};
