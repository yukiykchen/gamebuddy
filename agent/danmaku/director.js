'use strict';

// 弹幕 Director 只负责事件去重、排队和播放节奏。
// 文案必须由 Mod/Codex 事实或本地固定模板显式传入，不在这里检索语料或调用模型。
const safeText = value => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
const textKey = value => safeText(value).normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
const SOURCE_NAMES = ['ai', 'original_template', 'monster_skill', 'recommendation', 'key_component', 'shared', 'other'];
const sameScene = (left, right) => Boolean(left && right
  && left.runId === right.runId
  && left.sceneId === right.sceneId);
const sameContext = (left, right) => sameScene(left, right)
  && left.stateRevision === right.stateRevision;

class DanmakuDirector {
  constructor({ now = () => Date.now(), burstSize = 8, gapMs = 450, repeatWindowMs = 90_000, fixedIntervalMs = 15_000 } = {}) {
    this.now = now;
    this.burstSize = Math.max(6, Math.min(12, Number(burstSize) || 8));
    this.gapMs = Math.max(350, Math.min(1200, Number(gapMs) || 450));
    this.laneCount = 3;
    this.laneReadyAt = Array.from({ length: this.laneCount }, () => -Infinity);
    this.generation = 0;
    this.counter = 0;
    this.queue = [];
    this.active = [];
    this.events = new Set();
    this.triggers = new Set();
    this.recent = [];
    this.repeatWindowMs = repeatWindowMs;
    this.fixedIntervalMs = fixedIntervalMs;
    this.lastFixedEmittedAt = -Infinity;
    this.recentTexts = new Map();
    this.playedSkillTexts = new Set();
    this.presentedContentKeys = new Set();
    this.awaitingPresentation = new Map();
    this.presentedBySource = Object.fromEntries(SOURCE_NAMES.map(source => [source, 0]));
    this.context = null;
    this.closed = false;
    this.lastBurstAt = -Infinity;
    this.lastEmitAt = -Infinity;
    this.lastAiAt = -Infinity;
    this.lastQuietAt = -Infinity;
    this.laneCursor = 0;
  }

  invalidate() {
    this.generation += 1;
    this.queue = [];
    this.active = [];
    this.laneReadyAt = Array.from({ length: this.laneCount }, () => -Infinity);
    this.laneCursor = 0;
  }

  setContext(context) {
    if (!context || !context.runId || !context.sceneId || !Number.isInteger(context.stateRevision)) {
      throw new TypeError('缺少有效的 runId / sceneId / stateRevision');
    }
    if (sameScene(this.context, context)) {
      if (context.stateRevision < this.context.stateRevision) return false;
      this.context = { ...context };
      return !this.closed;
    }
    this.invalidate();
    this.events.clear();
    this.triggers.clear();
    this.closed = false;
    this.lastBurstAt = -Infinity;
    this.context = { ...context };
    return true;
  }

  burst(event) {
    if (!sameScene(this.context, event) || this.closed || !event.eventId || this.events.has(event.eventId)) {
      return { accepted: false, reason: 'stale_or_duplicate' };
    }
    this.events.add(event.eventId);
    if (this.events.size > 1024) this.events.delete(this.events.values().next().value);
    const key = `${event.trigger}:${event.key || event.turn || 'scene'}`;
    if (this.triggers.has(key)) return { accepted: false, reason: 'trigger_already_used' };
    const priority = Number(event.priority) || 1;
    if (this.now() - this.lastBurstAt < 3000 && priority < 3) return { accepted: false, reason: 'cooldown' };
    this.triggers.add(key);
    if (this.triggers.size > 512) this.triggers.delete(this.triggers.values().next().value);

    this.pruneTexts();
    const seen = new Set();
    const skill = event.trigger === 'monster_skill';
    const availableTexts = (event.factTexts || [event.factText]).map(safeText).filter(text => {
      const key = this.contentKey(text, event);
      if (!text || seen.has(key) || this.recentTexts.has(key) || skill && this.playedSkillTexts.has(key)
        || this.queue.some(item => item.expiresAt > this.now() && item.contentKey === key)) return false;
      seen.add(key);
      return true;
    });
    if (!availableTexts.length) return { accepted: false, reason: 'empty_or_repeated_text' };
    let factTexts = availableTexts;
    if (skill) {
      const recent = new Set(this.recent.map(textKey));
      factTexts = [availableTexts.find(text => !recent.has(textKey(text))) || availableTexts[0]];
    }
    const detailByText = event.detailByText || {};
    const factSourceByText = event.factSourceByText || {};
    const start = this.now();
    const batchId = `wave-${++this.counter}`;
    factTexts.forEach((text, index) => {
      const detail = detailByText[text] || null;
      const wordingSource = factSourceByText[text] || { type: 'fixed_dialogue', source: 'original_template' };
      const commentary = event.commentaryByText?.[text] || null;
      const interval = wordingSource.source === 'ai' ? 6000 : this.gapMs;
      this.queue.push({
        schema: 'gamebuddy.danmaku.v1',
        id: `${batchId}-${index}`,
        batchId,
        ...this.context,
        generation: this.generation,
        trigger: event.trigger,
        text,
        contentKey: this.contentKey(text, event),
        sourceEventIds: [event.eventId],
        recommendationId: event.recommendationId || null,
        recommendation: event.recommendation || null,
        detail,
        wordingSource,
        source: wordingSource.source || 'original_template',
        priority,
        commentary,
        speaker: event.speaker || null,
        skillLabel: event.skillLabel || null,
        ...(skill ? { monsterTurn: event.monsterTurn, enemyKey: event.enemyKey, actionSignature: event.actionSignature } : {}),
        displayPriority: wordingSource.source === 'key_component' ? 7 : wordingSource.source === 'recommendation' ? 6 : wordingSource.source === 'monster_skill' ? 5 : commentary?.momentId ? 4 : 2,
        style: ['enemy_move', 'recommendation'].includes(event.trigger) ? 'tense' : 'warm',
        dueAt: start + index * interval,
        expiresAt: start + index * interval + 30_000
      });
    });
    // 不截断已经入队的弹幕；每条都必须完整走完屏幕。
    this.lastBurstAt = this.now();
    return { accepted: true, batchId, count: factTexts.length };
  }

  close(event) {
    if (!sameScene(this.context, event) || this.closed) return { accepted: false, reason: 'stale_or_closed' };
    this.closed = true;
    this.queue = [];
    return { accepted: true, count: 0, reason: 'closed' };
  }

  upsertKeyComponent(entry) {
    if (!this.context || !entry?.contentKey || !safeText(entry.text)) return { accepted: false, reason: 'invalid_key_component' };
    if (this.presentedContentKeys.has(entry.contentKey)) return { accepted: false, reason: 'already_presented' };
    const now = this.now();
    const existing = this.queue.find(item => item.source === 'key_component' && item.contentKey === entry.contentKey);
    const next = {
      schema: 'gamebuddy.danmaku.v1',
      id: existing?.id || `key-${++this.counter}`,
      batchId: existing?.batchId || `key-${this.counter}`,
      ...this.context,
      generation: this.generation,
      trigger: 'key_component',
      text: safeText(entry.text),
      contentKey: entry.contentKey,
      objectKeys: entry.objectKeys || [],
      channel: entry.channel || 'reward',
      sourceEventIds: existing?.sourceEventIds || [`key-${entry.contentKey}`],
      recommendationId: null,
      recommendation: null,
      detail: entry.detail || null,
      wordingSource: { type: 'key_component', source: 'key_component' },
      source: 'key_component',
      priority: 3,
      commentary: null,
      speaker: null,
      skillLabel: null,
      displayPriority: 7,
      style: 'tense',
      dueAt: existing?.dueAt ?? now,
      expiresAt: now + 120_000,
      reconfirm: entry.reconfirm || null
    };
    if (existing) {
      Object.assign(existing, next, { id: existing.id, batchId: existing.batchId, dueAt: existing.dueAt });
      return { accepted: true, updated: true, id: existing.id };
    }
    this.queue.push(next);
    return { accepted: true, updated: false, id: next.id };
  }

  dropKeyComponents(predicate = () => true) {
    const before = this.queue.length;
    this.queue = this.queue.filter(item => item.source !== 'key_component' || !predicate(item));
    return before - this.queue.length;
  }

  tick(isRelevant = () => true) {
    const now = this.now();
    this.active = this.active.filter(item => item.until > now);
    this.queue = this.queue.filter(item => {
      if (!item || item.expiresAt <= now || item.generation !== this.generation || !isRelevant(item)) return false;
      if (item.source === 'key_component' && typeof item.reconfirm === 'function' && item.reconfirm() === false) return false;
      return true;
    });
    if (now - this.lastEmitAt < this.gapMs) return [];
    this.queue = this.queue.filter(item => !(item.source === 'original_template' && item.dueAt <= now && now - this.lastFixedEmittedAt < this.fixedIntervalMs));
    const ready = this.queue.filter(item => item.dueAt <= now
      && (item.source !== 'ai' || now - this.lastAiAt >= 6000)
      && (!item.commentary?.quiet || now - this.lastQuietAt >= 30_000));
    ready.sort((a, b) => b.displayPriority - a.displayPriority || a.dueAt - b.dueAt);
    // 固定闲聊仍稀疏输出；技能介绍独立，不丢掉被它推迟的 AI。
    const message = ready.find(item => item.source !== 'original_template' || now - this.lastFixedEmittedAt >= this.fixedIntervalMs);
    if (!message) return [];
    const lane = this.freeLane(now);
    if (lane == null) return [];
    this.queue.splice(this.queue.indexOf(message), 1);
    if (!message || !safeText(message.text)) return [];
    if (message.source === 'ai') this.lastAiAt = now;
    if (message.commentary?.quiet) this.lastQuietAt = now;
    if (message.source === 'original_template') this.lastFixedEmittedAt = now;
    this.laneReadyAt[lane] = now + 5600;
    this.active.push({ lane, until: now + 12_000 });
    this.lastEmitAt = now;
    this.recent = [...this.recent, message.text].slice(-20);
    this.recentTexts.set(message.contentKey, now);
    if (message.trigger === 'monster_skill') this.playedSkillTexts.add(message.contentKey);
    if (message.source === 'key_component') {
      this.presentedContentKeys.add(message.contentKey);
      for (const objectKey of message.objectKeys || []) {
        if (String(objectKey).startsWith('key:')) this.presentedContentKeys.add(objectKey);
      }
    }
    this.pruneTexts();
    this.awaitingPresentation.set(message.id, message.source);
    while (this.awaitingPresentation.size > 4096) this.awaitingPresentation.delete(this.awaitingPresentation.keys().next().value);
    // reconfirm 只属于主进程队列；函数无法经 Electron IPC 结构化克隆。
    const { reconfirm, ...payload } = message;
    return [{ ...payload, lane, durationMs: 10_000 }];
  }

  contentKey(text, event) {
    const key = textKey(text) || safeText(text);
    if (event.trigger === 'monster_skill') return `skill:${key}`;
    if (event.contentKey) return event.contentKey;
    // 不同决策即使短句相同，也可能对应新的有效建议。
    return event.trigger === 'recommendation'
      ? `recommendation:${event.runId}:${event.sceneId}:${event.recommendationId || event.eventId}:${key}`
      : `commentary:${key}`;
  }

  pruneTexts() {
    for (const [key, at] of this.recentTexts) {
      if (this.now() - at >= this.repeatWindowMs) this.recentTexts.delete(key);
    }
    while (this.recentTexts.size > 4096) this.recentTexts.delete(this.recentTexts.keys().next().value);
  }

  acknowledgePresented(id) {
    if (!this.awaitingPresentation.has(id)) return false;
    const source = this.awaitingPresentation.get(id);
    this.awaitingPresentation.delete(id);
    this.presentedBySource[SOURCE_NAMES.includes(source) ? source : 'other'] += 1;
    return true;
  }

  presentationStats() {
    const bySource = { ...this.presentedBySource };
    const total = Object.values(bySource).reduce((sum, count) => sum + count, 0);
    const commentary = bySource.ai + bySource.original_template;
    return {
      scope: 'app_session', measurement: 'renderer_created', total, bySource,
      aiPercent: total ? Math.round(1000 * bySource.ai / total) / 10 : null,
      commentaryAiPercent: commentary ? Math.round(1000 * bySource.ai / commentary) / 10 : null
    };
  }

  freeLane(now) {
    for (let offset = 0; offset < this.laneCount; offset += 1) {
      const lane = (this.laneCursor + offset) % this.laneCount;
      if ((this.laneReadyAt[lane] || 0) <= now) {
        this.laneCursor = lane + 1;
        return lane;
      }
    }
    return null;
  }

  snapshot() {
    return { generation: this.generation, context: this.context, queued: this.queue.length, active: this.active.length, presentation: this.presentationStats() };
  }
}

module.exports = { DanmakuDirector, sameContext, sameScene, textKey };
