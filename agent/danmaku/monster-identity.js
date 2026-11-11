'use strict';

const ADJECTIVES = [
  '英俊的', '暴躁的', '刚睡醒的', '迷路的', '过度自信的', '鬼鬼祟祟的', '自带回声的', '看起来很忙的',
  '不太聪明的', '突然认真的', '排队很久的', '热心过头的', '没吃饱的', '精神饱满的', '疑似加班的',
  '不想下班的', '走位奇怪的', '刚学会生气的', '胸有成竹的', '略显疲惫的', '喜欢加班的', '戏很多的',
  '不服气的', '有备而来的', '自我感觉良好的', '反复横跳的', '携带谜语的', '非常讲究的', '刚刚变强的',
  '看热闹不嫌事大的', '拥有复杂心事的', '认真准备遗言的', '不愿面对现实的', '已经想好台词的', '过分礼貌的',
  '准备开会的', '带着私人恩怨的', '一脸无辜的', '显然没睡够的', '被迫营业的', '充满希望的', '不肯认输的',
  '经验丰富的', '第一次上场的', '很有原则的', '正在观察的', '突然开窍的', '情绪稳定的', '相当记仇的',
  '刚领到工资的', '似乎有后台的'
];

const RELATIONS = [
  '本人', '的弟弟', '的骑士仆从', '的婶婶', '的远房表亲', '的临时队友', '的后勤部长', '的替补',
  '的前同事', '的邻居', '的债主', '的实习生', '的经纪人', '的班主任', '的保镖', '的表叔'
];

function hashSeed(...values) {
  let hash = 2166136261;
  for (const value of values) {
    for (const char of String(value ?? '')) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

function createMonsterDisplayName({ sceneId = '', monsterId = '', name = '', index = 0 } = {}) {
  const seed = hashSeed(sceneId, monsterId || name, index);
  const adjective = ADJECTIVES[seed % ADJECTIVES.length];
  const relation = RELATIONS[Math.floor(seed / ADJECTIVES.length) % RELATIONS.length];
  return `${adjective}${name}${relation}`;
}

module.exports = { ADJECTIVES, RELATIONS, createMonsterDisplayName };
