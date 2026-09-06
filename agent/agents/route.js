const { lookupEncounter, codex } = require('../codex-db');
const { createDecision, unavailable, numberOr } = require('../contracts');

const ACT_NAMES = ['Act 1', 'Act 2', 'Act 3'];

function decide(state) {
  const run = state.run || {};
  const actNumber = numberOr(run.act, 1);
  const act = codex.acts?.find?.(row => row.id === actNumber) || null;
  const options = (state.map?.nodes || state.map?.choices || state.map?.options || []).filter(Boolean);
  if (!Array.isArray(options) || !options.length) {
    return ['route', unavailable('route', state, '当前快照没有可选择的地图节点。')];
  }
  const hpRatio = numberOr(state.player.hp, 1) / Math.max(1, numberOr(state.player.maxHp, 1));
  const deckSize = (state.player.cards || []).length;
  const reviewed = options.map((option, index) => {
    const room = normalizeRoom(option);
    const score = routeScore(room, { hpRatio, deckSize, actNumber, option });
    return { index, room, score, reason: explainRoute(room, score, hpRatio, deckSize) };
  });
  const best = reviewed.sort((a, b) => b.score - a.score)[0];
  const decision = createDecision('route', state);
  decision.title = `建议进入「${roomName(best.room)}」`;
  decision.summary = best.reason;
  decision.confidence = 0.45 + Math.min(0.3, options.length / 12);
  decision.payload = {
    action: 'map-node',
    choiceIndex: best.index,
    options: reviewed
  };
  decision.evidence = [
    { kind: 'state', detail: `HP ${Math.round(hpRatio * 100)}%，卡组 ${deckSize} 张，Act ${actNumber}` },
    ...reviewed.map(row => ({ kind: 'codex-route', detail: `${roomName(row.room)}：${row.reason}` }))
  ];
  if (act) decision.evidence.push({ kind: 'codex-act', detail: `${act.name}：${stripMarkupSafe(act.description)}` });
  return ['route', decision];
}

function normalizeRoom(option) {
  const raw = typeof option === 'string' ? option : option.room || option.type || option.symbol || option.id || '';
  const value = String(raw).toLowerCase();
  if (/monster|combat|战|怪/.test(value)) return 'monster';
  if (/elite|精/.test(value)) return 'elite';
  if (/rest|campfire|休息|营/.test(value)) return 'rest';
  if (/shop|商/.test(value)) return 'shop';
  if (/event|unknown|问|？|\?/.test(value)) return 'unknown';
  if (/treasure|chest|宝/.test(value)) return 'chest';
  if (/boss|首领|boss/.test(value)) return 'boss';
  return 'unknown';
}

function routeScore(room, context) {
  const elitePool = codex.encounters.filter(row => row.room_type === 'Elite' && String(row.act || '').includes(`Act ${context.actNumber}`));
  const bossPool = codex.encounters.filter(row => row.room_type === 'Boss' && String(row.act || '').includes(`Act ${context.actNumber}`));
  const growth = context.deckSize < 20;
  if (room === 'monster') return growth ? 62 : 52;
  if (room === 'elite') return growth ? 42 : 68 + Math.min(10, elitePool.length * 2);
  if (room === 'rest') return context.hpRatio < 0.55 ? 76 : 42;
  if (room === 'shop') return 58;
  if (room === 'chest') return 60;
  if (room === 'unknown') return 55;
  if (room === 'boss') return 80 + Math.min(10, bossPool.length * 2);
  return 50;
}

function explainRoute(room, score, hpRatio, deckSize) {
  const parts = [];
  if (room === 'rest' && hpRatio < 0.55) parts.push('当前血量低于 55%，休息优先。');
  if (room === 'elite') parts.push(deckSize < 20 ? '卡组还薄，精英风险较高。' : '卡组规模可以尝试精英收益。');
  if (room === 'monster') parts.push(deckSize < 20 ? '普通战斗可以补足成长。' : '成长收益有限，但仍比高风险路线安全。');
  if (room === 'shop') parts.push('商店可转化金币为永久收益。');
  if (room === 'chest') parts.push('宝箱是不消耗生命的奖励节点。');
  if (room === 'unknown') parts.push('未知节点有事件或战斗不确定性。');
  if (!parts.length) parts.push('基于当前状态和 Codex 遭遇池的常规优先级。');
  return `${parts.join(' ')}（评估分 ${score}）`;
}

function roomName(room) {
  return {
    monster: '普通战斗', elite: '精英', rest: '休息处', shop: '商店',
    chest: '宝箱', unknown: '未知节点', boss: 'Boss'
  }[room] || '未知节点';
}

function stripMarkupSafe(value) {
  return String(value || '').replace(/\[[^\]]*\]/g, '').trim();
}

module.exports = { decide };
