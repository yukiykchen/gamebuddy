'use strict';
const { textKey } = require('./director');

// 这是可选写作角度和去重标签，不是每场必说的任务或轮播顺序。
const TOPICS = Object.freeze({
  reaction: '有趣的出手或进展，发生了也可以不提',
  enemy: '针对有据可见的怪物作轻微调侃，避免逐只报动作',
  card: '已提供的卡名/兵器意象，不编造卡牌效果',
  self_mockery: '角色自己的小脾气、自嘲或言行反差',
  observation: '一个细小观察、冷幽默或出人意料的联想',
  atmosphere: '塔中的气氛与比喻，不虚构具体环境事件',
  journey: '旅途感慨、期待与厌倦，不编造走过的楼层和往事',
  memory: '可选的真实本局回忆，不反复提旧险境',
  banter: '随口一句、克制的得意或好奇，不必总结战况',
  health: '生命、疼痛或残血；仅可选，避免持续提醒',
  defense: '格挡/防御状况；仅可选，避免持续提醒',
  other: '其他符合人格且不捏造事实的角度'
});
// 保守识别常见状态表达，防止把生存/体力提醒改标“自嘲”绕过；不是完整语义分类。
const HEALTH = /血|生命|伤口|伤疤|受伤|伤势|伤当|疼|痛得|好痛|很痛|呼吸|喘|气力|气息|站直|挺住|撑着|体力.{0,4}(不足|不多|没剩)|力气.{0,4}(不足|不多|没剩)|快.{0,2}(死|倒下)|撑不住/;
const DEFENSE = /格挡|防御|护甲|挡不住|没.{0,3}盾|盾.{0,3}没/;
function conditionTopics(text) {
  return [HEALTH.test(text) ? 'health' : null, DEFENSE.test(text) ? 'defense' : null].filter(Boolean);
}
function expressionMotifs(text) {
  const motifs = [];
  if (/还.{0,2}(站|活|没倒|没死)|没.{0,3}(倒下|躺下|死)|呼吸还在|没到告别/.test(text)) motifs.push('still-standing');
  if (/伤疤|又添一道|记下.{0,3}伤/.test(text)) motifs.push('another-scar');
  if (/王冠|仪态|礼数|失礼|排场/.test(text)) motifs.push('royal-etiquette');
  if (/牙|咬人/.test(text)) motifs.push('enemy-teeth');
  if (/骨头/.test(text)) motifs.push('bones');
  if (/两[只个].{0,8}(怪|敌)|一个.{0,12}另一个/.test(text)) motifs.push('monster-count');
  if (/攒(气势|力气)|还在(准备|蓄力)|准备.{0,3}(半天|很久)/.test(text)) motifs.push('monster-preparing');
  return motifs;
}

function exampleSample(profile, serial = 0, { avoidTopics = [], allowMemory = false } = {}) {
  const entries = Object.entries(profile.scenarioExamples || {}).filter(([key]) =>
    (key !== 'memory' || allowMemory) && !(avoidTopics.includes('enemy') && key === 'enemy') && !(avoidTopics.includes('health') && ['player_hurt', 'high_hp', 'low_hp'].includes(key)));
  const available = Object.fromEntries(entries);
  const general = entries.filter(([key]) => !['player_hurt', 'high_hp', 'low_hp'].includes(key));
  const selected = [];
  // 轮换的是少量提示例子，不是输出主题；每批不要求使用其中任何一个。
  for (let i = 0; i < Math.min(5, general.length); i++) selected.push(general[(serial + i * 2) % general.length]);
  const optional = ['attack_played', 'damage_observed', 'player_hurt', 'high_hp', 'low_hp'][serial % 5];
  if (available[optional]) selected.push([optional, available[optional]]);
  return Object.fromEntries(selected);
}

class CommentaryVariety {
  constructor({ now = () => Date.now() } = {}) { this.now = now; this.scopes = new Map(); }
  scope(context) {
    const key = JSON.stringify([context.runId || 'legacy', context.character || 'generic']);
    if (!this.scopes.has(key)) this.scopes.set(key, []);
    while (this.scopes.size > 8) this.scopes.delete(this.scopes.keys().next().value);
    const history = this.scopes.get(key).filter(item => this.now() - item.at < 300_000);
    this.scopes.set(key, history);
    return history;
  }
  constraints(context) {
    const history = this.scope(context);
    return {
      recentTopics: history.slice(-12).map(({ at, ...item }) => ({ ...item, ageMs: this.now() - at })),
      avoidTopics: ['health', 'defense', 'enemy'].filter(topic => history.some(item => item.conditions.includes(topic) && this.now() - item.at < (topic === 'enemy' ? 45_000 : 120_000))),
      avoidMotifs: [...new Set(history.filter(item => this.now() - item.at < 90_000).flatMap(item => item.expressions))]
    };
  }
  accept(context, item) {
    const history = this.scope(context);
    const inferred = conditionTopics(item.text);
    if (expressionMotifs(item.text).includes('still-standing') || /力气.{0,4}(不多|不足|没剩)|没.{0,4}(肉|力气)|体力.{0,4}(不多|不足)|疲惫中的/.test(item.text)) inferred.push('health');
    if (item.targetsEnemy || expressionMotifs(item.text).includes('enemy-teeth') || context.snapshot?.enemies?.some(enemy => item.text.includes(enemy.name))) inferred.push('enemy');
    const conditions = [...new Set([...inferred, ...(['health', 'defense', 'enemy'].includes(item.topic) ? [item.topic] : [])])];
    const motif = textKey(item.motif || '').slice(0, 32);
    const expressions = expressionMotifs(item.text);
    if (history.some(previous => conditions.some(topic => previous.conditions.includes(topic) && this.now() - previous.at < (topic === 'enemy' ? 45_000 : 120_000)))) return false;
    if (history.some(previous => this.now() - previous.at < 90_000 && ((motif && motif === previous.motif)
      || expressions.some(value => previous.expressions.includes(value))))) return false;
    history.push({ text: item.text, topic: item.topic || conditions[0] || 'other', motif, conditions, expressions, at: this.now() });
    if (history.length > 48) history.splice(0, history.length - 48);
    return true;
  }
}
module.exports = { TOPICS, CommentaryVariety, exampleSample, conditionTopics, expressionMotifs };
