'use strict';

const { DanmakuDirector, sameContext } = require('./director');
const { extractSceneContext, factLines, categoryLabel } = require('./scene-context');
const { nextActionFact } = require('./codex-facts');
const { createMonsterDisplayName } = require('./monster-identity');
const { buildSharedScene } = require('./shared-scene');
const { normalizeCharacter, personalityFor } = require('./language-profile');
const { RunMemory } = require('./run-memory');
const { evaluateCardAlerts, evaluateShopAlerts } = require('../knowledge/card-guidance-alerts');

function isLiveCombat(state) {
  // 存活敌人暂时为空不等于游戏已经结束这场战斗。
  return Boolean(state?.combat);
}

class DanmakuBridgeAdapter {
  constructor({
    now = () => Date.now(),
    schedule = setTimeout,
    idleMs = 20_000,
    sharedClient = null,
    llmAtmosphere = null,
    aiIntervalMs = 15_000,
    ...directorOptions
  } = {}) {
    this.now = now;
    this.schedule = schedule;
    this.idleMs = idleMs;
    this.sharedClient = sharedClient;
    this.llmAtmosphere = llmAtmosphere;
    this.aiIntervalMs = aiIntervalMs;
    this.aiRequests = new Set();
    this.aiBatch = 0;
    this.memory = new RunMemory({ now });
    this.director = new DanmakuDirector({ now, ...directorOptions });
    this.reset();
  }

  reset() {
    this.cancelCommentary();
    this.monsterTurns = new Set();
    this.lastMonsterSpeaker = null;
    this.memory.reset();
    this.director.invalidate();
    this.director.presentedContentKeys?.clear();
    this.director.context = null;
    this.keyOffer = null;
    this.shopVisit = null;
    this.shopVisitSerial = 0;
    this.keyState = null;
    this.director.closed = false;
    this.sequence = -1;
    this.previous = null;
    this.scope = null;
    this.runId = null;
    this.sourceRunId = null;
    this.serial = 0;
    this.sceneCount = (this.sceneCount || 0) + 1;
    this.accepting = false;
    this.lastFactAt = 0;
    this.idleEmitted = false;
    this.lastMoveKeys = new Map();
    this.fightKey = '';
    this.sharedScene = null;
  }

  invalidate() {
    this.cancelCommentary();
    this.memory.disconnect();
    this.accepting = false;
    this.director.invalidate();
  }

  markFact() {
    this.lastFactAt = this.now();
    this.idleEmitted = false;
  }

  getSharedScene() {
    return this.sharedScene ? { ...this.sharedScene, tags: [...(this.sharedScene.tags || [])] } : null;
  }

  async submitShared(text, { echoDelayMs = 3000 } = {}) {
    const scene = this.getSharedScene();
    if (!scene || !this.scope || !this.accepting) {
      return { accepted: false, reason: '当前没有可共享的战斗场景' };
    }
    if (!this.sharedClient?.enabled) {
      return { accepted: false, reason: 'shared_service_not_configured' };
    }
    const result = await this.sharedClient.submit({ ...scene, text });
    if (!result.accepted) return result;
    const expected = { sceneKey: scene.sceneKey, phase: scene.phase, sceneId: this.scope.sceneId };
    const content = String(result.item?.text || text || '').trim();
    const messageId = result.item?.id || `${this.now()}-${++this.serial}`;
    this.schedule(() => this.enqueueOwnShared(content, expected, messageId), Math.max(0, Number(echoDelayMs) || 3000));
    return result;
  }

  enqueueOwnShared(text, expected, messageId) {
    const current = this.getSharedScene();
    if (!text || !current || !this.scope || this.director.closed
      || current.sceneKey !== expected.sceneKey
      || current.phase !== expected.phase
      || this.scope.sceneId !== expected.sceneId) {
      return { accepted: false, reason: 'stale_shared_scene' };
    }
    return this.director.burst({
      ...this.scope,
      eventId: `shared-self-${messageId}`,
      trigger: 'shared_self',
      key: `${expected.sceneKey}:${expected.phase}:${messageId}`,
      priority: 3,
      factTexts: [text],
      detailByText: {
        [text]: {
          title: '你留下的弹幕',
          lines: ['已保存到当前场景'],
          source: 'shared'
        }
      },
      factSourceByText: {
        [text]: { type: 'shared_player', source: 'shared' }
      }
    });
  }

  async enqueueShared({ state, phase, scope }) {
    if (!this.sharedClient?.enabled || !state || !scope) return { accepted: false, reason: 'shared_service_not_configured' };
    const sharedScene = buildSharedScene(state, phase);
    this.sharedScene = sharedScene;
    const sceneId = scope.sceneId;
    const items = await this.sharedClient.list({ sceneKey: sharedScene.sceneKey, phase });
    if (!items.length || this.scope?.sceneId !== sceneId || this.director.closed) {
      return { accepted: false, reason: 'no_shared_messages' };
    }
    const texts = [...new Set(items.map(item => String(item.text || '').trim()).filter(Boolean))];
    if (!texts.length) return { accepted: false, reason: 'no_shared_messages' };
    return this.director.burst({
      ...scope,
      eventId: `shared-${phase}-${sceneId}`,
      trigger: `shared_${phase}`,
      key: `${sharedScene.sceneKey}:${phase}`,
      // 共享弹幕是异步补充，不能被本地入场弹幕的短冷却吞掉；它仍然只是表达层。
      priority: 3,
      factTexts: texts,
      detailByText: Object.fromEntries(texts.map(text => [text, {
        title: '其他玩家留下的弹幕',
        lines: [`场景：${sharedScene.character} · ${sharedScene.objectKey}`, `时机：${phase === 'death' ? '死亡' : '战斗中'}`],
        source: 'shared'
      }])),
      factSourceByText: Object.fromEntries(texts.map(text => [text, {
        type: 'shared_player',
        source: 'shared'
      }]))
    });
  }

  async enterDeath(state, { runId, revision, eventId } = {}) {
    if (this.sharedScene?.phase === 'death' && this.scope?.runId === runId) {
      return { accepted: false, reason: 'death_already_entered' };
    }
    this.cancelCommentary();
    this.keyOffer = null;
    const scope = { runId, sceneId: `${runId}:death-${++this.sceneCount}`, stateRevision: revision };
    this.scope = scope;
    this.previous = structuredClone(state || {});
    this.accepting = true;
    this.director.setContext(scope);
    this.sharedScene = buildSharedScene(state, 'death');
    void this.enqueueShared({ state, phase: 'death', scope }).catch(() => {});
    return { accepted: true, reason: 'death_started', eventId };
  }

  displayName(enemy, index = 0) {
    return createMonsterDisplayName({
      sceneId: this.scope?.sceneId || 'unknown-scene',
      monsterId: enemy?.id,
      name: enemy?.name,
      index
    });
  }

  enemyKey(enemy, index = 0) {
    return enemy?.key || `${enemy?.name || enemy?.id || 'enemy'}#${index}`;
  }

  actionSignature(enemy, fact) {
    return [enemy.id || enemy.name, fact?.moveKey || '', fact?.kind || enemy.intent || ''].join('|');
  }

  cancelCommentary() {
    for (const controller of this.aiRequests) controller.abort();
    this.aiRequests.clear();
    this.nextAiAt = Infinity;
    this.lastContextSignature = '';
    this.modEventSerial = 0;
    this.lastQuietAcceptedAt = -Infinity;
    this.recentEvents = [];
    this.eventIds = new Set();
  }

  rememberEvent(event) {
    if (event.eventId && this.eventIds.has(event.eventId)) return;
    const trigger = { 'card.played': 'card_played', 'enemy.spawned': 'mechanic',
      'enemy.revived': 'mechanic', 'enemy.phase_changed': 'mechanic' }[event.name];
    const context = extractSceneContext({ state: this.previous || {}, trigger, event });
    const lines = factLines(context, { event });
    if (event.name === 'turn.started' && Number.isInteger(event.data?.turn)) lines.push(`第 ${event.data.turn} 回合开始。`);
    if (!lines.length) return;
    if (event.eventId) this.eventIds.add(event.eventId);
    while (this.eventIds.size > 512) this.eventIds.delete(this.eventIds.values().next().value);
    this.modEventSerial += 1;
    this.recentEvents.push({ at: this.now(), name: event.name, facts: lines });
    this.recentEvents = this.recentEvents.filter(item => this.now() - item.at <= 45_000).slice(-12);
  }

  maybeGenerateCommentary() {
    if (!this.llmAtmosphere || !this.accepting || this.director.closed || !this.scope
      || this.sharedScene?.phase !== 'combat' || !isLiveCombat(this.previous)
      || this.now() < this.nextAiAt) return;
    this.nextAiAt = this.now() + this.aiIntervalMs;
    const scope = { ...this.scope };
    const generation = this.director.generation;
    const context = extractSceneContext({ state: this.previous, trigger: 'periodic' });
    const controller = new AbortController();
    this.aiRequests.add(controller);
    const batchId = `${scope.sceneId}:ai-${++this.aiBatch}`;
    const current = () => !controller.signal.aborted && this.accepting && !this.director.closed
      && this.sharedScene?.phase === 'combat' && this.director.generation === generation
      && this.scope?.sceneId === scope.sceneId && this.scope?.runId === scope.runId
      && normalizeCharacter(this.previous?.run?.character) === context.characterKey;
    this.recentEvents = this.recentEvents.filter(item => this.now() - item.at <= 45_000).slice(-12);
    const recentEvents = this.recentEvents.map(({ at, ...item }) => ({ ...item, ageMs: this.now() - at }));
    const snapshot = {
      turn: context.turn,
      player: { hp: context.playerHp, maxHp: context.playerMaxHp, block: context.block, energy: context.energy },
      enemies: context.enemies
    };
    const moments = this.memory.pending();
    const runMemories = this.memory.relevant(this.previous);
    const facts = moments.length ? moments.map(item => item.text) : [
      '本批没有新的显著事件。可以自由闲谈、联想或安静，无需复述状态数值。'
    ];
    // 怪物列表只是背景，数量/意图变化不再自动变成新一轮人格旁白。
    const signature = JSON.stringify([snapshot.player, runMemories]);
    const mode = moments.length ? 'highlight' : signature === this.lastContextSignature ? 'quiet' : 'observation';
    this.lastContextSignature = signature;
    this.memory.claim(moments);
    void Promise.resolve().then(() => {
      if (!current()) return { status: 'cancelled', phrases: [] };
      return this.llmAtmosphere.generate({
        runId: scope.runId, character: context.characterKey, trigger: 'periodic', batchId, snapshot, facts, recentEvents,
        moments: moments.map(({ id, kind, text, priority }) => ({ id, kind, text, priority })), runMemories, mode,
        optionalContext: true,
        recentTexts: [...this.director.recent, ...this.director.queue.map(item => item.text)].slice(-20)
      }, { signal: controller.signal });
    }).then(result => {
      if (!current() || result.status !== 'generated') return;
      if (mode === 'quiet' && this.now() - this.lastQuietAcceptedAt < 30_000) return;
      const commentaryByText = {};
      const phrases = (result.phrases || []).slice(0, mode === 'quiet' ? 1 : 2).filter(text => {
        const meta = result.commentaryByText?.[text] || { enemyKeys: context.enemies.map(enemy => enemy.key), momentId: moments[0]?.id || null };
        commentaryByText[text] = { ...meta, quiet: mode === 'quiet' };
        return this.isRelevant({ source: 'ai', commentary: commentaryByText[text] });
      });
      if (!phrases.length) return;
      if (mode === 'quiet') this.lastQuietAcceptedAt = this.now();
      this.director.burst({
        ...scope, eventId: batchId, trigger: 'ai_atmosphere', key: batchId,
        priority: 3, factTexts: phrases, commentaryByText, speaker: personalityFor(context.characterKey).name,
        detailByText: Object.fromEntries(phrases.map(text => [text, {
          title: `${personalityFor(context.characterKey).name}的战场感想`,
          lines: [...moments.map(item => item.text), ...facts, ...runMemories, ...recentEvents.flatMap(item => item.facts)].slice(0, 8), source: 'ai'
        }])),
        factSourceByText: Object.fromEntries(phrases.map(text => [text, { type: 'ai_generated', source: 'ai' }]))
      });
    }).catch(error => {
      if (!controller.signal.aborted) console.warn('[GameBuddy Danmaku] AI line skipped:', error.message);
    }).finally(() => this.aiRequests.delete(controller));
  }

  isRelevant(message) {
    if (message.trigger === 'monster_skill' && Number.isInteger(message.monsterTurn)) {
      return this.isMonsterActionCurrent(message);
    }
    if (message.source !== 'ai' || !message.commentary) return true;
    if (message.commentary.momentId) return this.memory.validMoment(message.commentary.momentId);
    const alive = new Set(extractSceneContext({ state: this.previous || {} }).enemies.map(enemy => enemy.key));
    return (message.commentary.enemyKeys || []).every(key => alive.has(key));
  }

  tick() {
    this.maybeGenerateCommentary();
    return this.director.tick(item => this.isRelevant(item));
  }

  isMonsterActionCurrent({ sceneId, monsterTurn, enemyKey, actionSignature }) {
    return this.accepting && this.scope?.sceneId === sceneId && this.previous?.combat?.turn === monsterTurn
      && this.lastMoveKeys.get(enemyKey) === actionSignature;
  }

  emitMonsterTurn(actions, turn) {
    if (!Number.isInteger(turn) || this.monsterTurns.has(turn) || !actions.length) return;
    const action = actions.find(item => item.changed && item.enemyKey !== this.lastMonsterSpeaker)
      || actions.find(item => item.changed) || actions.find(item => item.enemyKey !== this.lastMonsterSpeaker) || actions[0];
    this.monsterTurns.add(turn);
    this.lastMonsterSpeaker = action.enemyKey;
    const { enemy, index, fact, enemyKey, signature } = action;
    const sameName = actions.filter(item => item.enemy.name === enemy.name).length > 1;
    const moveName = fact.detail.lines.find(line => line.startsWith('行动：'))?.slice(3) || '当前行动';
    return this.director.burst({
      ...this.scope, eventId: `skill-${++this.serial}`, trigger: 'monster_skill',
      key: `turn-${turn}`, priority: 3, monsterTurn: turn, enemyKey, actionSignature: signature,
      skillLabel: `${enemy.name}${sameName ? `（${(enemy.slot ?? index) + 1}）` : ''} · ${moveName}`,
      factTexts: fact.variants,
      detailByText: Object.fromEntries(fact.variants.map(text => [text, fact.detail])),
      factSourceByText: Object.fromEntries(fact.variants.map(text => [text, { type: 'skill_dialogue', source: 'monster_skill' }]))
    });
  }

  async emit(trigger, extras = {}) {
    return this.director.burst({ ...this.scope, eventId: extras.eventId || `derived-${++this.serial}`, trigger, ...extras });
  }

  async ingestObservation(observation, { runId } = {}) {
    if (!runId) throw new TypeError('主进程必须提供稳定的 runId');
    if (observation?.schema !== 'gamebuddy.observation.v1' || !Number.isInteger(observation.sequence)) {
      throw new TypeError('无效 observation');
    }
    const sourceRunId = observation.state?.run?.runId || null;
    if (this.runId !== runId || (sourceRunId && this.sourceRunId && sourceRunId !== this.sourceRunId)) {
      this.reset();
      this.runId = runId;
    }
    if (observation.fresh !== true || !observation.state) {
      this.invalidate();
      return { accepted: false, reason: 'not_fresh' };
    }
    if (observation.sequence <= this.sequence) return { accepted: false, reason: 'old_observation' };
    this.accepting = true;
    this.sourceRunId = sourceRunId || this.sourceRunId;
    this.sequence = observation.sequence;
    const state = observation.state;
    this.keyState = state;
    const previous = this.previous;
    const wasCombat = isLiveCombat(previous);
    const inCombat = isLiveCombat(state);

    if (!inCombat) {
      this.memory.observe(state, { runId });
      this.previous = structuredClone(state);
      this.fightKey = '';
      if (wasCombat && this.scope) {
        this.cancelCommentary();
        const died = Number(state?.player?.hp) <= 0;
        if (died) {
          return this.enterDeath(previous, {
            runId,
            revision: observation.sequence,
            eventId: `death-${++this.serial}`
          });
        }
        this.sharedScene = null;
        this.accepting = false;
        const result = this.director.close({ ...this.scope, eventId: `exit-${++this.serial}`, outcome: 'unknown' });
        this.syncNonCombatKeys(state, runId);
        return result;
      }
      if (!wasCombat && this.sharedScene?.phase !== 'death') this.sharedScene = null;
      this.syncNonCombatKeys(state, runId);
      return { accepted: false, reason: 'non_combat' };
    }

    const sceneContext = extractSceneContext({ state });
    const combatId = state.combat?.combatId || state.run?.combatId;
    const fightKey = combatId
      ? `combat:${combatId}`
      : JSON.stringify([state.run?.act, state.run?.totalFloor ?? state.run?.floor, state.run?.currentCoord]);
    const entering = fightKey !== this.fightKey
      || normalizeCharacter(previous?.run?.character) !== sceneContext.characterKey;
    this.fightKey = fightKey;
    this.previous = structuredClone(state);
    if (entering) {
      this.keyOffer = null;
      this.shopVisit = null;
      this.director.dropKeyComponents();
      this.cancelCommentary();
      this.monsterTurns.clear();
      this.lastMonsterSpeaker = null;
      this.sceneCount += 1;
    }
    this.scope = { runId, sceneId: `${runId}:combat-${this.sceneCount}`, stateRevision: observation.sequence };
    this.director.setContext(this.scope);
    this.memory.observe(state, { runId, sceneId: this.scope.sceneId, entering });

    const previousActions = this.lastMoveKeys;
    this.lastMoveKeys = new Map();
    const actions = [];
    for (const [index, enemy] of sceneContext.enemies.entries()) {
      const name = this.displayName(enemy, index);
      const fact = nextActionFact(enemy, {
        categoryLabel, sceneId: this.scope.sceneId, displayName: name,
        occurrence: sceneContext.turn ?? index
      });
      const enemyKey = this.enemyKey(enemy, index);
      const signature = this.actionSignature(enemy, fact);
      this.lastMoveKeys.set(enemyKey, signature);
      if (!fact) continue;
      actions.push({ enemy, index, enemyKey, fact, signature, changed: entering || signature !== previousActions.get(enemyKey) });
    }
    this.emitMonsterTurn(actions, sceneContext.turn);

    if (entering) {
      this.sceneStartedAt = this.now();
      this.sharedScene = buildSharedScene(state, 'combat');
      this.markFact();
      this.nextAiAt = this.now();
      this.maybeGenerateCommentary();
      void this.enqueueShared({ state, phase: 'combat', scope: this.scope }).catch(() => {});
      return { accepted: true, reason: 'combat_started' };
    }
    // 断线恢复同一场景时重新启动周期，但不重播入场。
    if (this.nextAiAt === Infinity && this.sharedScene?.phase === 'combat') this.nextAiAt = this.now();

    if (actions.some(item => item.changed)) {
      this.markFact();
      return { accepted: true, reason: 'skills_updated' };
    }

    if (!this.idleEmitted && this.lastFactAt && this.now() - this.lastFactAt >= this.idleMs) {
      this.idleEmitted = true;
      return { accepted: false, reason: 'idle_no_new_action' };
    }
    return { accepted: false, reason: 'no_new_trigger' };
  }

  async ingestRecommendation() {
    // 推荐保留在原面板/桌宠；机会通知只由真实可选卡牌或商店库存驱动。
    return { accepted: false, reason: 'recommendation_panel_only' };
  }

  async ingestFact(fact, { replay = false } = {}) {
    // 存储已校验后的实时事实也可作为表达输入；拒绝回放/跨局/旧战斗事实。
    if (replay || fact?.eventType !== 'card.played' || !this.accepting || this.director.closed
      || this.sharedScene?.phase !== 'combat' || !fact.runId || fact.runId !== this.previous?.run?.runId
      || !Number.isFinite(fact.occurredAt) || fact.occurredAt < this.sceneStartedAt - 2000
      || this.now() - fact.occurredAt > 45_000 || fact.occurredAt > this.now() + 1000) return;
    const data = fact.payload || {};
    const card = this.previous.player?.cards?.find(item => item.id === data.cardId);
    return this.ingestEvent({ name: 'card.played', eventId: fact.eventId,
      data: { cardId: data.cardId, cardName: card?.name || data.cardName } });
  }

  syncNonCombatKeys(state, runId) {
    if (state.shop && Array.isArray(state.shop.items)) {
      const data = { ...state.shop };
      return this.syncKeyComponents({ name: 'shop.updated', data }, state, runId);
    }
    if (this.keyOffer?.name.startsWith('shop') && Object.hasOwn(state, 'shop') && state.shop === null
      && !/merchant|shop/i.test(String(state.run?.room || ''))) {
      return this.syncKeyComponents({ name: 'shop.closed' }, state, runId);
    }
    return this.restoreKeyOffer(state, runId);
  }

  ensureShopVisit(event, state, runId) {
    const run = state.run || {};
    const location = JSON.stringify([runId, run.act, run.totalFloor ?? run.floor, run.currentCoord ?? run.coord]);
    const externalId = event.data?.visitId || null;
    if (!this.shopVisit || this.shopVisit.location !== location
      || externalId && this.shopVisit.externalId && externalId !== this.shopVisit.externalId) {
      this.shopVisit = { location, externalId, id: externalId || `snapshot-visit-${++this.shopVisitSerial}` };
    } else if (externalId) this.shopVisit.externalId = externalId;
    // 快照先到时保留内部机会ID，稍后到达的opened不再为同一商品重播。
    return this.shopVisit.id;
  }

  restoreKeyOffer(state, runId) {
    if (this.keyOffer && this.keyRunId === runId) this.syncKeyComponents(this.keyOffer, state, runId);
  }

  ensureKeyScope(runId, state) {
    const revision = Number.isInteger(state?.timestamp) ? state.timestamp : (this.director.context?.stateRevision || 1);
    if (!this.director.context || this.director.context.runId !== runId || this.director.closed) {
      const scope = { runId, sceneId: `${runId}:key-component`, stateRevision: revision };
      this.scope = scope;
      this.accepting = true;
      this.director.closed = false;
      this.director.setContext(scope);
      return;
    }
    this.director.closed = false;
    this.accepting = true;
  }

  cardOpportunityKey(event, state, runId) {
    if (event.data?.opportunityId) return String(event.data.opportunityId);
    const run = state?.run || {};
    return `reward:${runId}:${run.act ?? ''}:${run.floor ?? ''}/${run.totalFloor ?? ''}:${run.currentCoord || run.coord || ''}:${run.room || ''}:${event.data?.signature || ''}`;
  }

  buildKeyAlerts(event, state, runId) {
    const character = state?.run?.character;
    const deck = state?.player?.cards || [];
    const relics = state?.player?.relics || [];
    const name = event?.name;
    if (name === 'shop.opened' || name === 'shop.updated') {
      const data = event.data || {};
      const items = Array.isArray(data.items) ? data.items : [];
      const gold = Number.isFinite(state?.player?.gold) ? state.player.gold : data.gold;
      const visitId = this.shopVisit?.id || data.visitId || 'visit';
      const identity=(systemId,stockKey)=>`key:${runId}:shop:${visitId}:system:${systemId}:object:${stockKey}`;
      const shop = evaluateShopAlerts({ character, deck, relics, gold, items,
        isUnseen:(systemId,key)=>!this.director.presentedContentKeys.has(identity(systemId,key)) });
      if (!shop) return [];
      return shop.groups.map(group=>({
        channel: 'shop',
        text: group.text,
        objectKeys: group.objectKeys.map(key=>identity(group.systemId,key)),
        contentKey: `key:${runId}:shop:${visitId}:system:${group.systemId}:${[...group.objectKeys].sort().join('+')}`
      }));
    }
    const cards = Array.isArray(event.data?.cards) ? event.data.cards : [];
    if (!cards.length) return [];
    if (name !== 'card.reward.opened' && name !== 'event.opened') return [];
    const opportunityKey = this.cardOpportunityKey(event, state, runId);
    const identity=(systemId,key)=>`key:${runId}:${opportunityKey}:system:${systemId}:object:${key}`;
    return evaluateCardAlerts({ character, deck, relics, cards,
      isUnseen:(systemId,key)=>!this.director.presentedContentKeys.has(identity(systemId,key)) }).map(alert => ({
      channel: 'reward',
      text: alert.text,
      objectKeys: alert.objectKeys.map(key=>identity(alert.systemId,key)),
      contentKey: `key:${runId}:${opportunityKey}:system:${alert.systemId}:${[...alert.objectKeys].sort().join('+')}`
    }));
  }

  syncKeyComponents(event, state, runId) {
    if (!runId || !event?.name) return { accepted: false, reason: 'invalid_event' };
    if (state) this.keyState = state;
    this.keyRunId = runId;
    if (['card.reward.closed', 'card.reward.selected', 'shop.closed', 'event.closed', 'map.opened'].includes(event.name)) {
      this.keyOffer = null;
      this.shopVisit = null;
      this.director.dropKeyComponents(item => (
        event.name === 'map.opened'
        || event.name === 'event.closed'
        || (event.name.startsWith('shop') && item.channel === 'shop')
        || (event.name.startsWith('card') && item.channel === 'reward')
      ));
      return { accepted: true, reason: 'dropped' };
    }
    const screen = event.name === 'card.reward.opened'
      || event.name === 'shop.opened'
      || event.name === 'shop.updated'
      || (event.name === 'event.opened' && Array.isArray(event.data?.cards) && event.data.cards.length > 0);
    if (!screen) return { accepted: false, reason: 'not_key_screen' };
    const liveState = state || this.keyState;
    if (!liveState) return { accepted: false, reason: 'missing_state' };
    this.ensureKeyScope(runId, liveState);
    if (event.name.startsWith('shop')) this.ensureShopVisit(event, liveState, runId);
    this.keyOffer = { name: event.name, data: event.data };
    const alerts = this.buildKeyAlerts(event, liveState, runId);
    const keys = new Set(alerts.map(item => item.contentKey));
    const channel = event.name.startsWith('shop') ? 'shop' : 'reward';
    this.director.dropKeyComponents(item => item.channel === channel && !keys.has(item.contentKey));
    const queued = [];
    for (const alert of alerts) {
      const result = this.director.upsertKeyComponent({
        ...alert,
        reconfirm: () => {
          if (!this.keyOffer || !this.keyState) return false;
          return this.buildKeyAlerts(
            { name: this.keyOffer.name, data: this.keyOffer.data },
            this.keyState,
            this.keyRunId
          ).some(item => item.contentKey === alert.contentKey);
        }
      });
      if (result.accepted) queued.push(result);
    }
    return { accepted: queued.length > 0, count: queued.length, reason: 'key_component' };
  }

  async ingestEvent(event) {
    if (!event?.name) return { accepted: false, reason: 'invalid_event' };
    const scope = this.scope || this.director.context;
    if (!scope || !sameContext(event.scope || scope, scope)) return { accepted: false, reason: 'stale_event' };
    if (event.name === 'combat.ended') {
      this.cancelCommentary();
      if (this.sharedScene?.phase === 'death') return { accepted: false, reason: 'death_already_entered' };
      if (Number(this.previous?.player?.hp) <= 0 && this.runId) {
        return this.enterDeath(this.previous, {
          runId: this.runId,
          revision: this.sequence,
          eventId: event.eventId || `death-${++this.serial}`
        });
      }
      this.sharedScene = null;
      const result = this.director.close({ ...scope, eventId: event.eventId || `event-${++this.serial}`, outcome: event.outcome || 'unknown' });
      this.restoreKeyOffer(this.keyState, this.keyRunId);
      return result;
    }
    if (!this.accepting) return { accepted: false, reason: 'not_accepting' };
    if (this.director.closed || this.sharedScene?.phase !== 'combat') return { accepted: false, reason: 'not_in_combat' };
    this.memory.event(event, this.previous);
    this.memory.observe(this.previous, { runId: this.runId, sceneId: this.scope.sceneId });
    this.rememberEvent(event);
    return { accepted: true, reason: 'event_recorded' };
  }
}

module.exports = { DanmakuBridgeAdapter };
