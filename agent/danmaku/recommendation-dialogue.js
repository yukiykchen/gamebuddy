'use strict';

function clean(value) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function primaryOf(recommendation) {
  return recommendation?.primary || recommendation?.payload || {};
}

function cardDescription(primary, recommendation) {
  return clean(primary.analysis?.description
    || primary.analysis?.effect
    || primary.analysis?.text
    || recommendation?.options?.find(option => option.name === primary.cardName)?.description
    || '效果描述暂未提供');
}

function buildRecommendationDialogue(recommendation) {
  const task = recommendation?.task || 'unknown';
  const primary = primaryOf(recommendation);
  let text = '建议到了，先看这一手。';
  let lines = [];
  if (task === 'card_reward') {
    if (primary.action === 'SKIP') {
      text = '这次先不拿，留住牌组空间。';
      lines = ['动作：跳过奖励', `理由：${clean(recommendation.reason)}`];
    } else {
      const name = clean(primary.cardName || primary.label || '这张牌');
      text = `选牌建议！拿下「${name}」。`;
      lines = [`选择：${name}`, `效果：${cardDescription(primary, recommendation)}`, `理由：${clean(recommendation.reason)}`];
    }
  } else if (task === 'map_route') {
    const label = clean(primary.displayLabel || primary.label || primary.targetId || '这条路线');
    text = `路线建议！这次走「${label}」。`;
    lines = [`选择：${label}`, `后续路线：${Array.isArray(primary.route) ? primary.route.join(' → ') : '暂未提供'}`, `理由：${clean(recommendation.reason)}`];
  } else if (task === 'rest_site') {
    const label = clean(primary.label || (primary.action === 'HEAL' ? '回血' : `升级「${primary.cardName || '这张牌'}」`));
    text = `休息处建议！${label}。`;
    lines = [`选择：${label}`, `理由：${clean(recommendation.reason)}`];
  } else if (task === 'event_choice') {
    const label = clean(primary.label || '这个选项');
    text = `事件建议！选择「${label}」。`;
    lines = [`选择：${label}`, `效果：${clean(primary.description || '选项效果暂未提供')}`, `理由：${clean(recommendation.reason)}`];
  } else {
    text = clean(recommendation.title || recommendation.reason || text);
    lines = [`建议：${clean(recommendation.reason || recommendation.summary || '暂未提供')}`];
  }
  lines = lines.filter(Boolean);
  return {
    text,
    detail: {
      title: '桌宠刚才大概是这么建议的',
      lines: [...lines, '来源：Agent 建议'],
      source: 'recommendation'
    }
  };
}

module.exports = { buildRecommendationDialogue };
