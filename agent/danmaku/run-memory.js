'use strict';

const { normalizeCharacter } = require('./language-profile');
const { extractSceneContext } = require('./scene-context');
const finite = Number.isFinite;
const catalog = require('../data/codex/cards.json');
const cardFacts = new Map(catalog.flatMap(card => [[card.id, card], [card.name, card]]));
const high = player => finite(player?.hp) && finite(player?.maxHp) && player.maxHp > 0 && player.hp / player.maxHp >= .8;
const low = player => finite(player?.hp) && finite(player?.maxHp) && player.maxHp > 0 && player.hp > 0 && player.hp / player.maxHp <= 0.25;
const cardKey = card => String(card?.id || card?.cardId || card?.name || '');
const enemyType = enemy => String(enemy?.id || enemy?.name || '');
const trimMap = (map, limit) => { while (map.size > limit) map.delete(map.keys().next().value); };

// 会话内本局记忆。只记已观察事实，不推测伤害归因、胜负或卡牌收益。
class RunMemory {
  constructor({ now = () => Date.now() } = {}) { this.now = now; this.reset(); }

  reset(runId = null, character = null) {
    this.runId = runId; this.character = character;
    this.history = []; this.encounters = new Map(); this.moments = [];
    this.seen = new Set(); this.events = new Set(); this.deck = null; this.newCards = new Map();
    this.sceneId = null; this.previous = null; this.playCount = 0; this.playTurn = null;
    this.buffTurns = new Map(); this.reactionTimes = new Map(); this.reactionSerial = 0; this.serial = 0; this.wasLow = false;
  }

  ensure(runId, character) {
    const key = normalizeCharacter(character);
    if (runId !== this.runId || key !== this.character) this.reset(runId, key);
  }

  disconnect() { this.previous = null; this.deck = null; this.playCount = 0; this.playTurn = null; }

  remember(kind, text, enemyTypes = []) {
    this.history.push({ kind, text, enemyTypes, sceneId: this.sceneId });
    this.history = this.history.slice(-40);
  }

  addMoment(kind, text, key, priority = 3) {
    if (this.seen.has(key)) return;
    this.seen.add(key);
    while (this.seen.size > 256) this.seen.delete(this.seen.values().next().value);
    const moment = { id: `moment-${++this.serial}`, kind, text, priority, at: this.now(), sceneId: this.sceneId, claimed: false };
    this.moments.push(moment); this.moments = this.moments.slice(-12);
    this.remember(kind, text);
  }

  react(kind, text, key, priority = 4, cooldownMs = 8_000) {
    if (this.now() - (this.reactionTimes.get(kind) ?? -Infinity) < cooldownMs) return;
    this.reactionTimes.set(kind, this.now());
    // 同类型只保留最新待消费事实，避免一批两句复述同一类出手。
    for (const item of this.moments) if (item.kind === kind && !item.claimed) item.claimed = true;
    this.addMoment(kind, text, key, priority);
  }

  observeDeck(cards) {
    if (!Array.isArray(cards)) return;
    const counts = new Map();
    for (const card of cards) { const key = cardKey(card); if (key) counts.set(key, (counts.get(key) || 0) + 1); }
    if (this.deck) {
      for (const [key, count] of counts) {
        if (count > (this.deck.get(key) || 0)) {
          const card = cards.find(item => cardKey(item) === key);
          // 没有牌实例关联时，不能把旧同名副本打出说成新副本首秀。
          if (!this.deck.has(key)) this.newCards.set(key, { name: card.name || key, played: false });
          this.remember('new_card', `本局牌组新增了「${card.name || key}」。`);
        }
      }
    }
    this.deck = counts; trimMap(this.newCards, 80);
  }

  observe(state, { runId, sceneId = null, entering = false } = {}) {
    this.ensure(runId, state.run?.character);
    this.observeDeck(state.player?.cards);
    const context = extractSceneContext({ state });
    const newScene = entering || (sceneId && sceneId !== this.sceneId);
    if (newScene) {
      this.sceneId = sceneId; this.previous = null; this.playCount = 0; this.playTurn = null; this.buffTurns.clear(); this.reactionTimes.clear();
      const types = new Set();
      for (const enemy of context.enemies) {
        const type = enemyType(enemy); if (types.has(type)) continue; types.add(type);
        const known = this.encounters.get(type) || { name: enemy.name, visits: 0, lowScenes: 0 };
        known.visits += 1; this.encounters.set(type, known);
      }
      trimMap(this.encounters, 40);
    }
    const old = this.previous;
    if (low(state.player)) {
      this.wasLow = true;
      for (const type of new Set(context.enemies.map(enemyType))) {
        const known = this.encounters.get(type);
        if (known && known.lastLowScene !== this.sceneId) {
          known.lastLowScene = this.sceneId; known.lowScenes += 1;
          this.remember('low_encounter', `本局与${known.name}同场时曾处于低生命，伤害来源未知。`, [type]);
        }
      }
    } else if (this.wasLow && finite(state.player?.hp) && finite(state.player?.maxHp)
      && state.player.maxHp > 0 && state.player.hp / state.player.maxHp >= 0.5) {
      this.wasLow = false;
      this.remember('recovered', '本局此前曾低生命，现在生命已恢复到一半以上；恢复来源未知。');
    }
    if (!state.combat) { this.previous = null; return; }
    // 只对连续采样做差分；断线和切场不把缺失过程当成受伤/命中。
    if (old && finite(old.player?.hp) && finite(state.player?.hp) && state.player.hp > 0 && state.player.hp < old.player.hp) {
      this.react('player_hurt', `自己的生命从${old.player.hp}降到${state.player.hp}，减少${old.player.hp - state.player.hp}；来源未知。`, `${sceneId}:hurt:${++this.reactionSerial}`, 5);
    }
    if ((newScene || old && !high(old.player)) && high(state.player)) {
      this.react('high_hp', '自己的生命至少为上限的八成，目前体力充足；不能据此预言安全或胜利。', `${sceneId}:high-hp`, 3);
    }
    if ((newScene || old && !low(old.player)) && low(state.player)) {
      this.react('low_hp', '自己的生命不超过上限的四分之一，仍然存活。', `${sceneId}:low-hp`, 5);
    }
    if (old) for (const enemy of old.enemies) {
      const current = state.combat.enemies?.[enemy.slot];
      if (current?.name !== enemy.name || enemy.id && current.id !== enemy.id) continue;
      if (finite(enemy.hp) && finite(current.hp) && current.hp >= 0 && current.hp < enemy.hp) {
        this.react('damage_observed', `观察到${enemy.name}生命从${enemy.hp}降到${current.hp}；伤害来源未知，不能归于某张牌。`, `${sceneId}:damage:${++this.reactionSerial}`, 4);
      }
    }
    const turn = context.turn;
    if (turn !== this.playTurn) { this.playTurn = turn; this.playCount = 0; }
    if (old && finite(turn) && turn > old.turn && low(old.player) && state.player.hp > 0) {
      this.addMoment('low_hp_survived', '此前低生命，已活着进入下一回合。', `${sceneId}:survive:${turn}`, 5);
    }
    for (const enemy of context.enemies) {
      if (this.playCount >= 3 && finite(enemy.hp) && enemy.hp > 0 && enemy.hp <= 3) {
        this.addMoment('near_finish', `本回合已打出至少三张牌，${enemy.name}仍剩${enemy.hp}点生命；不能推断伤害都来自这些牌。`, `${sceneId}:near:${turn}:${enemy.key}`, 4);
      }
      if (enemy.intentKinds.includes('buff') && finite(turn)) {
        const turns = this.buffTurns.get(enemy.key) || new Set();
        turns.add(turn); this.buffTurns.set(enemy.key, turns);
        if (turns.size >= 2) this.addMoment('repeated_buff', `${enemy.name}在多个回合显示强化意图，具体成长效果未知。`, `${sceneId}:buff:${enemy.key}`, 2);
      }
    }
    if (old && finite(turn) && turn >= 6) {
      // 仅显式死亡/零血是倒下证据；列表缺失可能是切场或采集空档。
      for (const enemy of old.enemies) {
        const current = (state.combat.enemies || [])[enemy.slot];
        if (current && (current.name === enemy.name) && (current.alive === false || current.hp === 0)) {
          this.addMoment('long_fight_down', `战斗已进行至少六回合，${enemy.name}被观察到倒下。`, `${sceneId}:down:${enemy.key}`, 5);
        }
      }
    }
    this.previous = { player: { ...state.player }, turn, enemies: context.enemies };
  }

  event(event, state) {
    if (event.eventId && this.events.has(event.eventId)) return;
    if (event.eventId) this.events.add(event.eventId);
    while (this.events.size > 512) this.events.delete(this.events.values().next().value);
    if (event.name !== 'card.played' || !state?.combat) return;
    const turn = state.combat.turn;
    if (this.playTurn !== turn) { this.playTurn = turn; this.playCount = 0; }
    this.playCount += 1;
    const data = event.data || {};
    const key = data.cardId || data.card?.id;
    const name = event.cardName || data.cardName || data.card?.name;
    const owned = state.player?.cards?.find(card => card.id === key || card.name === name);
    const fact = cardFacts.get(String(key || owned?.id || '').replace(/\+$/, '').toUpperCase()) || cardFacts.get(name || owned?.name);
    if (fact?.type_key === 'Attack') {
      this.react('attack_played', `刚打出攻击牌「${fact.name}」；只确认出牌，尚未确认命中、伤害或击杀。`, `${this.sceneId}:attack:${event.eventId || ++this.reactionSerial}`, 4);
    }
    const match = key ? this.newCards.get(key) : [...this.newCards.values()].find(item => item.name === name);
    if (match && !match.played) {
      match.played = true;
      this.addMoment('new_card_debut', `本局新加入的「${match.name}」首次被观察到打出，实际收益尚未确认。`, `${this.sceneId}:debut:${key || name}`, 4);
    }
  }

  pending() {
    return this.moments.filter(item => item.sceneId === this.sceneId && !item.claimed && this.now() - item.at < 45_000 && this.validMoment(item.id))
      .sort((a, b) => b.priority - a.priority || b.at - a.at).slice(0, 3);
  }

  claim(moments) { for (const item of moments) item.claimed = true; }
  validMoment(id) {
    return this.moments.some(item => item.id === id && item.sceneId === this.sceneId && this.now() - item.at < 60_000
      && (item.kind !== 'high_hp' || high(this.previous?.player))
      && (item.kind !== 'low_hp' || low(this.previous?.player)));
  }

  relevant(state) {
    const result = [];
    const types = new Set(extractSceneContext({ state }).enemies.map(enemyType));
    for (const type of types) {
      const known = this.encounters.get(type);
      if (known?.visits > 1) {
        result.push(`本局已第${known.visits}次遇到${known.name}。`);
        if (known.lowScenes > (known.lastLowScene === this.sceneId ? 1 : 0)) result.push(`此前包含${known.name}的战斗中曾处于低生命；不能断言伤害由它造成。`);
      }
    }
    for (const item of this.history.slice(-8)) {
      if (item.kind === 'recovered' || item.kind === 'new_card' || item.kind === 'long_fight_down') result.push(item.text);
    }
    return [...new Set(result)].slice(0, 6);
  }
}

module.exports = { RunMemory };
