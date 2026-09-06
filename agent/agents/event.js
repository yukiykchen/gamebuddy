const { lookupEvent, stripMarkup } = require('../codex-db');
const { createDecision, unavailable } = require('../contracts');

function decide(state, events = []) {
  if (state.run?.room !== 'event' && !events.some(event => event.name === 'event.opened')) return ['event', null];
  const run = state.run || {};
  const event = lookupEvent(run.eventId || run.event_id || run.nodeName || run.currentNode);
  if (!event) return ['event', unavailable('event', state, '无法从快照中识别当前事件。')];
  const options = initialOptions(event);
  if (!options.length) return ['event', unavailable('event', state, 'Codex 没有解析到当前事件的初始选项。')];
  const hpRatio = (state.player.hp || 1) / Math.max(1, state.player.maxHp || 1);
  const reviewed = options.map((option, index) => {
    const text = stripMarkup(option.description || '');
    const damage = matchNumber(text, /受到|失去\s*(\d+)\s*点?(生命|伤害)/) ?? matchNumber(text, /Take\s+(\d+)/i) ?? 0;
    const heal = matchNumber(text, /回复|治疗\s*(\d+)/) ?? matchNumber(text, /Heal\s+(\d+)/i) ?? 0;
    const permanent = /最大生命|Max HP|永久/.test(text);
    const curse = /诅咒|状态|Injury|Doubt/.test(text);
    let score = heal * 1.2 - damage * 2.4 + (permanent ? 18 : 0) - (curse ? 45 : 0);
    if (damage > 0 && damage >= state.player.hp) score = -999;
    if (/离开|Leave/.test(option.title || '')) score = Math.max(score, hpRatio < 0.4 ? 20 : 8);
    return { index, id: option.id, title: option.title, description: text, score, reason: explainOption(text, damage, heal, curse, permanent) };
  });
  const best = reviewed.sort((a, b) => b.score - a.score)[0];
  const decision = createDecision('event', state);
  decision.title = `建议选择「${best.title}」`;
  decision.summary = best.reason;
  decision.confidence = 0.44 + Math.min(0.3, Math.abs(best.score) / 80);
  decision.payload = {
    action: 'event-choice',
    choiceIndex: best.index,
    eventId: event.id,
    options: reviewed,
    skipped: best.score <= 0
  };
  decision.evidence = [
    { kind: 'codex-event', detail: `${event.name}：${stripMarkup(event.description || '')}` },
    ...reviewed.map(row => ({ kind: 'codex-option', detail: `${row.title}：${row.description}` }))
  ];
  return ['event', decision];
}

function initialOptions(event) {
  const page = (event.pages || []).find(row => ['INITIAL', 'START', 'PAGE_0'].includes(String(row.id || '').toUpperCase())) || event.pages?.[0];
  return Array.isArray(page?.options) ? page.options : Array.isArray(event.options) ? event.options : [];
}

function matchNumber(text, pattern) {
  const match = String(text).match(pattern);
  return match ? Number(match[1]) : null;
}

function explainOption(text, damage, heal, curse, permanent) {
  const parts = [];
  if (damage > 0) parts.push(`会损失约 ${damage} 点生命。`);
  if (heal > 0) parts.push(`预计回复约 ${heal} 点生命。`);
  if (permanent) parts.push('包含永久收益。');
  if (curse) parts.push('会加入负面牌，风险很高。');
  if (!parts.length) parts.push('Codex 事件文本未包含明确数值，需要谨慎判断。');
  return parts.join(' ');
}

module.exports = { decide };
