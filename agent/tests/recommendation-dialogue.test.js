'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRecommendationDialogue } = require('../danmaku/recommendation-dialogue');

test('card reward and shop-style card advice includes the selected card effect in hover detail', () => {
  const result = buildRecommendationDialogue({
    task: 'card_reward',
    primary: { action: 'TAKE_CARD', cardName: '测试攻击卡', analysis: { description: '造成 12 点伤害' } },
    reason: '补足当前牌组的单体输出。'
  });
  assert.equal(result.text, '选牌建议！拿下「测试攻击卡」。');
  assert.match(result.detail.lines.join('\n'), /造成 12 点伤害/);
});

test('route advice is rendered without asking the model to write a phrase', () => {
  const result = buildRecommendationDialogue({
    task: 'map_route',
    primary: { action: 'TAKE_ROUTE', displayLabel: '左侧精英', route: ['node-a', 'node-b'] },
    reason: '当前生命足够，路线能获得更高遗物收益。'
  });
  assert.equal(result.text, '路线建议！这次走「左侧精英」。');
  assert.match(result.detail.lines.join('\n'), /当前生命足够/);
});
