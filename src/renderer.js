const state = {
  mode: 'combat',
  paused: false,
  source: 'demo',
  syncedAt: Date.now(),
  run: { act: 2, floor: 18, totalFloor: 52, room: 'combat', character: 'ironclad' },
  selectedCard: '打击',
  player: { hp: 43, maxHp: 67, block: 12, energy: 2, maxEnergy: 3, gold: 184, cards: Array(28), relics: Array(7), potions: [] },
  combat: { turn: 7, drawPile: Array(14), discardPile: Array(9), exhaustPile: [] },
  enemy: { name: '蛇花', subtitle: '意图：强力攻击', hp: 78, maxHp: 96, damage: 18 },
  hand: [
    { name: '打击', cost: 1, type: '攻击' },
    { name: '防御', cost: 1, type: '技能', skill: true },
    { name: '痛击', cost: 2, type: '攻击' },
    { name: '恶魔形态', cost: 3, type: '能力', skill: true },
    { name: '铁斩波', cost: 1, type: '攻击' }
  ]
};

const viewContainer = document.querySelector('#view-container');
const toast = document.querySelector('#toast');
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2300);
}

function hpPercent(unit) { return Math.max(0, Math.min(100, Math.round((unit.hp / unit.maxHp) * 100))); }

function combatView() {
  const enemyIntent = state.enemy.damage > 0 ? `攻击 ${state.enemy.damage}` : state.enemy.subtitle || '意图未知';
  const recommendation = state.selectedCard === '防御'
    ? { title: '先打出', card: '防御', reason: '敌方本回合将造成 18 点伤害。保留 1 点能量给防御，可以让本回合的生命风险降到最低。', sequence: [['防御', '获得 5 格挡'], ['打击', '造成 6 伤害'], ['结束回合', '保留 1 点能量']] }
    : { title: '先打出', card: '打击', reason: '先用低成本攻击压低蛇花的生命，再用剩余能量补防御。这个顺序比先防御多保留约 6 点有效伤害。', sequence: [['打击', '造成 6 伤害'], ['防御', '获得 5 格挡'], ['结束回合', '预计承受 1 点伤害']] };
  return `
    <div class="view-grid">
      <section class="panel battle-panel">
        <div class="panel-heading"><span class="panel-title">战斗状态</span><span class="panel-meta">楼层 ${state.run.floor} · 回合 ${String(state.combat.turn).padStart(2, '0')}</span></div>
        <div class="combat-top">
          <div class="unit-card">
            <div class="unit-label"><span class="mini-status"></span>我方</div><div class="unit-name">铁甲战士</div><div class="unit-subtitle">力量 3 · 易伤 1</div>
            <div class="vitals"><div class="vital ${state.player.hp < 30 ? 'danger' : ''}"><strong>${state.player.hp}</strong><span>生命 / ${state.player.maxHp}</span></div><div class="vital"><strong>${state.player.block}</strong><span>格挡</span></div></div>
            <div class="unit-meter"><span style="width:${hpPercent(state.player)}%"></span></div>
          </div>
          <div class="unit-card enemy-card">
            <div class="unit-label enemy-label"><span class="mini-status"></span>敌方</div><div class="unit-name">${state.enemy.name}</div><div class="unit-subtitle">${state.enemy.subtitle}</div>
            <div class="vitals"><div class="vital danger"><strong>${state.enemy.hp}</strong><span>生命 / ${state.enemy.maxHp}</span></div></div>
            <div class="unit-meter"><span style="width:${hpPercent(state.enemy)}%"></span></div><div class="intent"><strong>${enemyIntent}</strong>　${state.enemy.damage > 0 ? '未减伤前的预估伤害' : '敌方下一步行动'}</div>
          </div>
        </div>
        <div class="energy-row"><div class="energy">${state.player.energy}<small>/ ${state.player.maxEnergy || 3} 能量</small></div><div class="turn-status">${state.paused ? '建议已暂停 · 数据仍在同步' : '等待你的操作'}</div><div class="panel-meta">抽牌堆 ${state.combat.drawPile.length}　弃牌堆 ${state.combat.discardPile.length}</div></div>
        <div class="hand-area"><div class="hand-label"><span>当前手牌 · 5 张</span><span>点击卡牌查看推演</span></div><div class="hand">${state.hand.map(card => `<button class="card-tile ${card.skill ? 'skill' : ''} ${state.selectedCard === card.name ? 'recommended' : ''}" data-card="${card.name}"><span class="card-cost">${card.cost}</span><span class="card-name">${card.name}</span><span class="card-type">${card.type}</span></button>`).join('')}</div></div>
      </section>
      <div class="side-stack">
        <section class="panel recommendation-panel">
          <div class="panel-heading"><span class="panel-title">本回合建议</span><span class="confidence">置信度 84%</span></div>
          <div class="recommendation-body"><div class="recommendation-kicker">最小化本回合风险</div><div class="recommendation-title">${recommendation.title} <em>${recommendation.card}</em></div><p class="recommendation-reason">${recommendation.reason}</p><div class="sequence"><div class="sequence-label">建议顺序</div><div class="sequence-list">${recommendation.sequence.map((item, index) => `<div class="sequence-item"><span class="sequence-number">${index + 1}</span><strong>${item[0]}</strong><span>${item[1]}</span></div>`).join('')}</div></div><div class="decision-footer"><button class="primary-button" id="confirm-action">采纳这条建议</button><button class="outline-button" id="more-actions">看其他方案</button></div></div>
        </section>
        <section class="panel why-panel"><div class="panel-heading"><span class="panel-title">为什么这样打</span><span class="panel-meta">实时推演</span></div><div class="why-body"><div class="score-row"><div class="score-number">8.4</div><div class="score-copy"><strong>局面评分</strong><span>预计存活率较高</span></div></div><div class="score-track"><span></span></div><ul class="why-list"><li>蛇花下回合可能进入防御姿态，当前不必急于投入全部伤害。</li><li>保留 1 点能量，可应对下一张牌的费用波动。</li></ul></div></section>
      </div>
    </div>`;
}

function draftView() {
  return `<div class="draft-layout"><section class="panel draft-offer"><div class="draft-kicker">REWARD / CARD REWARD</div><h2 class="draft-title">这三张牌，哪一张值得加入卡组？</h2><div class="draft-cards"><article class="draft-card top-pick"><span class="pick-tag">推荐加入</span><div class="card-cost">1</div><div class="card-name">剑柄打击</div><div class="card-type">攻击 · 罕见</div><p>当前卡组缺少低费过牌，能让力量体系更快启动。</p></article><article class="draft-card"><div class="card-cost">2</div><div class="card-name">祭品</div><div class="card-type">技能 · 罕见</div><p>爆发很高，但会消耗生命。只有在后续有恢复点时优先级才会上升。</p></article><article class="draft-card"><div class="card-cost">2</div><div class="card-name">震荡波</div><div class="card-type">技能 · 罕见</div><p>控制价值不错，但与当前卡组的防御密度重复，暂不建议稀释卡组。</p></article></div><div class="decision-footer"><button class="primary-button" id="draft-confirm">选择剑柄打击</button><button class="outline-button" id="draft-skip">跳过奖励</button></div></section><section class="panel draft-side"><div class="panel-heading"><span class="panel-title">卡组画像</span><span class="panel-meta">当前 28 张</span></div><div class="deck-stat"><span>力量体系</span><strong>成型中 · 72%</strong></div><div class="deck-stat"><span>平均费用</span><strong>1.46</strong></div><div class="deck-stat"><span>攻击 / 技能 / 能力</span><strong>13 / 12 / 3</strong></div><div class="deck-stat"><span>下一张精英前景</span><strong style="color:var(--mint)">可挑战</strong></div><div class="why-body"><ul class="why-list"><li>卡组已经有足够的单体攻击，不需要继续补高费伤害。</li><li>过牌是当前最缺的功能，优先选能减少空过回合的牌。</li></ul></div></section></div>`;
}

function routeView() {
  const nodes = [['战', ''], ['？', ''], ['营', 'rest'], ['精', 'elite'], ['？', ''], ['营', 'rest'], ['BOSS', 'boss']];
  return `<div class="route-layout"><section class="panel map-panel"><div class="panel-heading"><span class="panel-title">第二层地图</span><span class="panel-meta">当前位于第 18 个房间</span></div><div class="map-rail">${nodes.map((node, index) => `<button class="map-node ${node[1]} ${index === 0 ? 'current' : ''}" data-node="${index}">${node[0]}</button>`).join('')}</div><div class="map-legend"><span class="legend-current">当前位置</span><span class="legend-elite">精英</span><span class="legend-rest">休息处</span></div></section><section class="panel route-advice"><div class="eyebrow">ROUTE SCORE / NEXT 4 ROOMS</div><h2>向右走更适合这套牌</h2><p>下一处休息点前有一次普通战斗，能把卡组推演需要的生命成本控制在安全线内。</p><div class="route-choice"><strong>推荐路线 · 生存优先</strong><span>普通战斗 → 问号 → 休息处 → 精英</span></div><div class="score-row" style="margin-top:24px"><div class="score-number">76</div><div class="score-copy"><strong>路线收益分</strong><span>包含遗物与升级价值</span></div></div><div class="score-track"><span style="width:76%;background:var(--amber)"></span></div><ul class="why-list"><li>你当前生命 64%，可以承受一次普通战斗。</li><li>休息处后挑战精英，预计战斗前生命恢复至 79%。</li><li>避开左侧连续两场战斗的高波动路线。</li></ul></section></div>`;
}

function render() {
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.mode === state.mode));
  const copy = {
    combat: ['COMBAT / TURN 07', '现在该怎么打？', '我会根据当前手牌、敌人意图和未来回合，给出可执行的最优顺序。'],
    draft: ['REWARD / CARD REWARD', '这张牌值得拿吗？', '把卡组当前缺口、未来路线和战斗表现放在一起判断。'],
    route: ['MAP / ACT 02', '下一步往哪里走？', '把战斗风险、卡组成长和遗物收益，压缩成一条可执行的路线。']
  }[state.mode];
  document.querySelector('#page-eyebrow').textContent = copy[0];
  document.querySelector('#page-title').textContent = copy[1];
  document.querySelector('#page-description').textContent = copy[2];
  viewContainer.innerHTML = state.mode === 'combat' ? combatView() : state.mode === 'draft' ? draftView() : routeView();
  updateRunSummary();
  document.querySelector('#pause-button').classList.toggle('paused', state.paused);
  bindViewActions();
}

function updateRunSummary() {
  const character = state.run.character || 'ironclad';
  const characterNames = { ironclad: '铁甲战士', silent: '静默猎手', defect: '故障机器人', regent: '统御者', necrobinder: '死灵法师' };
  const name = characterNames[character.toLowerCase()] || character;
  document.querySelector('#run-character-name').textContent = name;
  document.querySelector('#run-location').textContent = `尖塔 · 第 ${state.run.act || 1} 层 · 房间 ${state.run.floor || 0}`;
  document.querySelector('#run-progress-label').textContent = `${state.run.floor || 0} / ${state.run.totalFloor || 52}`;
  document.querySelector('#run-progress-bar').style.width = `${Math.min(100, ((state.run.floor || 0) / Math.max(1, state.run.totalFloor || 52)) * 100)}%`;
  document.querySelector('#deck-count').textContent = state.player.cards?.length || 0;
  document.querySelector('#relic-count').textContent = state.player.relics?.length || 0;
  document.querySelector('#gold-count').textContent = state.player.gold ?? 0;
}

function bindViewActions() {
  document.querySelectorAll('[data-card]').forEach(button => button.addEventListener('click', () => { state.selectedCard = button.dataset.card; render(); showToast(`已切换到「${button.dataset.card}」的行动推演`); }));
  document.querySelector('#confirm-action')?.addEventListener('click', () => { state.player.energy = Math.max(0, state.player.energy - 1); state.enemy.hp = Math.max(0, state.enemy.hp - 6); state.player.block += 5; state.syncedAt = Date.now(); render(); showToast('已记录：打出打击，后续建议已更新'); });
  document.querySelector('#more-actions')?.addEventListener('click', () => showToast('另一方案：先防御，预计少受 5 点伤害，但本回合少造成 6 点伤害'));
  document.querySelector('#draft-confirm')?.addEventListener('click', () => showToast('已加入卡组：剑柄打击 · 卡组现在 29 张'));
  document.querySelector('#draft-skip')?.addEventListener('click', () => showToast('已跳过奖励，保留卡组纯度'));
  document.querySelectorAll('[data-node]').forEach(button => button.addEventListener('click', () => showToast(`已查看第 ${Number(button.dataset.node) + 1} 个节点的路线风险`)));
}

document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => { state.mode = button.dataset.mode; render(); }));
document.querySelector('#minimize-button').addEventListener('click', () => window.windowControls?.minimize());
document.querySelector('#close-button').addEventListener('click', () => window.windowControls?.close());
document.querySelector('#refresh-button').addEventListener('click', () => { state.syncedAt = Date.now(); document.querySelector('#last-sync').textContent = '刚刚同步'; showToast('已从游戏数据桥刷新当前局面'); });
document.querySelector('#pause-button').addEventListener('click', () => { state.paused = !state.paused; document.querySelector('#pause-button').classList.toggle('paused', state.paused); document.querySelector('#pause-label').textContent = state.paused ? '已暂停' : '建议中'; render(); });

function setBridgeStatus(status) {
  const phase = typeof status === 'object' ? status.status : status ? 'connected' : 'demo';
  const connected = phase === 'live';
  const invalid = phase === 'invalid';
  const stale = phase === 'stale';
  state.source = connected ? 'bridge' : 'demo';
  document.querySelector('.status-indicator').style.background = connected ? 'var(--mint)' : invalid || stale ? 'var(--red)' : 'var(--amber)';
  document.querySelector('#bridge-name').textContent = connected ? '游戏数据' : invalid ? '数据异常' : stale ? '数据停滞' : phase === 'connecting' ? '正在连接' : phase === 'connected' ? '数据桥已连接' : '模拟数据';
  document.querySelector('#bridge-state').textContent = connected ? 'LIVE' : invalid ? 'ERROR' : stale ? 'STALE' : phase === 'connecting' || phase === 'connected' ? 'WAIT' : 'DEMO';
  document.querySelector('#bridge-state').style.color = connected ? 'var(--mint)' : invalid || stale ? 'var(--red)' : 'var(--amber)';
  document.querySelector('#bridge-detail').textContent = connected
    ? '本地 Mod Bridge · 0.4.2'
    : invalid
      ? `消息未通过校验 · ${status.detail || '未知错误'}`
      : stale
        ? status.detail
      : phase === 'connecting'
        ? '正在等待 127.0.0.1:27182'
        : phase === 'connected'
          ? '等待第一份游戏状态 · 127.0.0.1:27182'
        : '等待本地 Mod Bridge · 127.0.0.1:27182';
}

function applyBridgeState(next) {
  if (next.run) state.run = { ...state.run, ...next.run };
  if (next.player) state.player = { ...state.player, ...next.player };
  const incomingCombat = next.combat || { turn: 0, hand: [], drawPile: [], discardPile: [], exhaustPile: [], enemies: [] };
  state.combat = {
    ...state.combat,
    ...incomingCombat,
    drawPile: incomingCombat.drawPile || [],
    discardPile: incomingCombat.discardPile || [],
    exhaustPile: incomingCombat.exhaustPile || []
  };
  if (!next.combat) state.hand = [];
  if (next.combat?.enemies?.[0]) {
    const enemy = next.combat.enemies[0];
    state.enemy = {
      ...state.enemy,
      ...enemy,
      subtitle: enemy.intent === 'AttackIntent' ? '意图：攻击' : enemy.intent === 'DefendIntent' ? '意图：防御' : enemy.intent ? `意图：${enemy.intent}` : '意图未知',
      damage: Number.isFinite(enemy.damage) ? enemy.damage : 0
    };
  }
  if (Array.isArray(next.combat?.hand)) {
    state.hand = next.combat.hand.map(card => ({
      ...card,
      skill: card.skill ?? /技能|skill/i.test(card.type || '')
    }));
  }
  state.syncedAt = Date.now();
  if (state.mode === 'combat') render();
}

setInterval(() => {
  if (state.paused) return;
  const seconds = Math.max(0, Math.round((Date.now() - state.syncedAt) / 1000));
  document.querySelector('#last-sync').textContent = seconds < 2 ? '刚刚同步' : `${seconds} 秒前同步`;
}, 1000);

render();
setBridgeStatus(false);
window.runmateBridge?.onState(applyBridgeState);
window.runmateBridge?.onEvent(event => {
  if (event.name === 'card.reward.opened') {
    state.mode = 'draft';
    render();
    showToast('发现新的卡牌奖励');
  }
  if (event.name === 'map.opened') {
    state.mode = 'route';
    render();
    showToast('地图已打开，路线建议已准备');
  }
});
window.runmateBridge?.onStatus(status => {
  setBridgeStatus(status);
  if (status.status === 'connected') showToast('已连接《杀戮尖塔 2》实时数据');
});
