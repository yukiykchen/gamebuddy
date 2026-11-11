'use strict';

const { textKey } = require('./director');
const { personalityFor } = require('./language-profile');
const { TOPICS, CommentaryVariety, exampleSample, conditionTopics, expressionMotifs } = require('./variety');

const CONTROL = /[\u0000-\u001f\u007f]/g;

function cleanPhrase(value) {
  if (typeof value !== 'string' || /https?:|www\./i.test(value)) return '';
  let text = String(value || '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  text = text.replace(/^(?:攻击|防御|重击|多段攻击|强化|特殊行动)[！!:：、,，\s]+/u, '');
  text = text.replace(/^[^。！？!?：:]{1,12}[：:]\s*/u, '');
  if (text.length < 4 || text.length > 48 || /https?:|www\.|广告|加群|私信|微信|辱骂/i.test(text)) return '';
  return text;
}

// 字符二元组用于抑制近似复述；不能代替语义模型，也不声称能识别所有同义笑话。
function similarPhrase(left, right) {
  const a = textKey(left), b = textKey(right);
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 8) return false;
  const grams = text => new Set(Array.from({ length: text.length - 1 }, (_, i) => text.slice(i, i + 2)));
  const x = grams(a), y = grams(b);
  const shared = [...x].filter(value => y.has(value)).length;
  return 2 * shared / (x.size + y.size) >= .72;
}

class DanmakuLlmAtmosphere {
  constructor({ llm = null, now = () => Date.now(), ttlMs = 90_000, minIntervalMs = 3500, onLog = () => {} } = {}) {
    this.llm = llm;
    this.now = now;
    this.ttlMs = ttlMs;
    this.minIntervalMs = minIntervalMs;
    this.onLog = onLog;
    this.cache = new Map();
    this.pending = new Set();
    this.recentTexts = new Map();
    this.lastStartedAt = -Infinity;
    this.variety = new CommentaryVariety({ now });
    this.exampleSerial = 0;
  }

  key(context) {
    return [context.runId || '', context.character || 'generic', context.batchId || '', context.trigger, ...(context.facts || [])].join('|');
  }

  async generate(context = {}, { signal } = {}) {
    if (signal?.aborted) return { status: 'cancelled', phrases: [] };
    if (!this.llm?.enabled || typeof this.llm.completeDanmaku !== 'function') return { status: 'unavailable', phrases: [] };
    for (const [key, expiresAt] of this.cache) if (expiresAt <= this.now()) this.cache.delete(key);
    for (const [key, expiresAt] of this.recentTexts) if (expiresAt <= this.now()) this.recentTexts.delete(key);
    const key = this.key(context);
    // 缓存是已消费请求的抑制窗口，不把上一次的台词再播一遍。
    if (this.cache.has(key) || this.pending.has(key)) return { status: 'duplicate', phrases: [] };
    if (this.now() - this.lastStartedAt < this.minIntervalMs) return { status: 'throttled', phrases: [] };
    this.lastStartedAt = this.now();
    this.pending.add(key);
    const promise = (async () => {
      try {
        const profile = personalityFor(context.character);
        const varietyContext = { ...context, character: profile.key };
        const constraints = this.variety.constraints(varietyContext);
        const statusKinds = ['player_hurt', 'high_hp', 'low_hp', 'low_hp_survived'];
        const availableMoments = (context.moments || []).filter(item => !constraints.avoidTopics.includes('health') || !statusKinds.includes(item.kind));
        const snapshot = context.snapshot ? { ...context.snapshot, player: {} } : null;
        // 生命/格挡不是默认写作任务。仅新的状态素材可带生命数值；旧状态不反复灌入模型。
        if (snapshot && availableMoments.some(item => statusKinds.includes(item.kind))) {
          snapshot.player = { hp: context.snapshot.player?.hp, maxHp: context.snapshot.player?.maxHp };
        }
        const facts = (context.facts || []).filter(text => !constraints.avoidTopics.includes('health') || !conditionTopics(text).includes('health'));
        const result = await this.llm.completeDanmaku({
          character: profile.key,
          characterName: profile.name,
          trigger: context.trigger || 'periodic',
          tone: profile.tone,
          style: profile.style,
          voice: profile.voice,
          attention: profile.attention,
          reactions: profile.reactions,
          memoryVoice: profile.memoryVoice,
          moments: availableMoments,
          runMemories: (context.runMemories || []).filter(text => !constraints.avoidTopics.includes('health') || !conditionTopics(text).includes('health')),
          mode: context.mode || 'observation',
          examples: profile.examples.filter(text => !conditionTopics(text).some(topic => constraints.avoidTopics.includes(topic))
            && !expressionMotifs(text).some(motif => constraints.avoidMotifs.includes(motif))),
          scenarioExamples: exampleSample(profile, this.exampleSerial++, { ...constraints, allowMemory: Boolean(context.runMemories?.length) }),
          creativeAngles: TOPICS,
          topicPolicy: '事件和状态都是可选素材，不是每场/每批必说清单；自由选择角度，不报血量/防御仪表盘；两句可以各说不同的事。',
          ...constraints,
          count: 2,
          facts: facts.slice(0, 24),
          snapshot,
          recentEvents: (context.recentEvents || []).slice(-12),
          recentTexts: [...(context.recentTexts || []), ...constraints.recentTopics.map(item => item.text)].slice(-20)
        }, { signal });
        if (signal?.aborted) return { status: 'cancelled', phrases: [] };
        if (!Array.isArray(result?.phrases)) {
          this.onLog({ event: 'failed', trigger: context.trigger, reason: 'invalid_response', count: 0 });
          return { status: 'failed', reason: 'invalid_response', phrases: [] };
        }
        const phrases = Array.isArray(result?.phrases) ? result.phrases : [];
        const enemies = context.snapshot?.enemies || [];
        const allowedKeys = new Set(enemies.map(enemy => enemy.key));
        const moments = new Set(availableMoments.map(item => item.id));
        const valid = phrases.map(value => {
          const structured = value && typeof value === 'object';
          const text = cleanPhrase(structured ? value.text : value);
          if (!text) return null;
          const rawMomentId = structured ? value.momentId || null : null;
          if (rawMomentId && !moments.has(rawMomentId)) return null;
          const momentId = rawMomentId;
          const named = enemies.filter(enemy => text.includes(enemy.name)).map(enemy => enemy.key);
          const providedKeys = structured && Array.isArray(value.enemyKeys) ? value.enemyKeys : named;
          const enemyKeys = providedKeys.map(key => {
            if (allowedKeys.has(key)) return key;
            const matches = enemies.filter(enemy => enemy.id === key || enemy.name === key);
            return matches.length === 1 ? matches[0].key : null;
          });
          if (enemyKeys.some(key => !key)) return null;
          const topic = structured && Object.hasOwn(TOPICS, value.topic) ? value.topic : null;
          const motif = structured && typeof value.motif === 'string' ? value.motif.slice(0, 32) : '';
          const targetsEnemy = named.length > 0 || structured && Array.isArray(value.enemyKeys) && value.enemyKeys.length > 0;
          return { text, momentId, enemyKeys: [...new Set([...enemyKeys, ...named])], topic, motif, targetsEnemy };
        }).filter(Boolean);
        const excluded = [...(context.recentTexts || []), ...this.recentTexts.keys()];
        const selected = [];
        for (const item of valid) {
          const key = textKey(item.text);
          if (excluded.some(previous => similarPhrase(previous, key))) continue;
          // 在返回时检查最新历史，不能只用发起请求时的快照；慢批次会并发返回。
          if (!this.variety.accept(varietyContext, item)) continue;
          excluded.push(key); selected.push(item);
          if (selected.length === 2) break;
        }
        const items = selected.map(item => item.text);
        this.cache.set(key, this.now() + this.ttlMs);
        for (const text of items) this.recentTexts.set(textKey(text), this.now() + this.ttlMs);
        while (this.cache.size > 512) this.cache.delete(this.cache.keys().next().value);
        while (this.recentTexts.size > 512) this.recentTexts.delete(this.recentTexts.keys().next().value);
        const status = items.length ? 'generated' : valid.length || !phrases.length ? 'duplicate' : 'failed';
        this.onLog({ event: items.length ? 'success' : status === 'failed' ? 'failed' : 'filtered', trigger: context.trigger,
          reason: items.length ? undefined : valid.length ? 'recent_duplicate_or_cooldown' : phrases.length ? 'invalid_phrases' : 'model_silent',
          count: items.length, received: phrases.length, valid: valid.length });
        return { status, phrases: items, commentaryByText: Object.fromEntries(selected.map(({ text, targetsEnemy, ...meta }) => [text, meta])) };
      } catch (error) {
        if (signal?.aborted) return { status: 'cancelled', phrases: [] };
        this.onLog({ event: 'fallback', trigger: context.trigger, reason: error.message });
        return { status: 'failed', phrases: [] };
      } finally {
        this.pending.delete(key);
      }
    })();
    return promise;
  }
}

module.exports = { DanmakuLlmAtmosphere, cleanPhrase, similarPhrase };
