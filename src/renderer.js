const state = {
  mode: 'combat',
  paused: false,
  source: 'waiting',
  syncedAt: 0,
  run: { act: 0, floor: 0, totalFloor: 0, room: null, character: '' },
  selectedCard: '',
  player: { hp: 0, maxHp: 0, block: 0, energy: 0, maxEnergy: 0, gold: 0, cards: [], relics: [], potions: [] },
  combat: null,
  enemy: null,
  hand: [],
  map: { visited: [] },
  recommendation: null,
  decision: null
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

function hpPercent(unit) { return unit?.maxHp > 0 ? Math.max(0, Math.min(100, Math.round((unit.hp / unit.maxHp) * 100))) : 0; }

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function characterName(character) {
  const names = { ironclad: '铁甲战士', silent: '静默猎手', defect: '故障机器人', regent: '统御者', necrobinder: '死灵法师' };
  return names[String(character || '').toLowerCase()] || character || '等待游戏';
}

function combatView() {
  const hasCombat = Boolean(state.combat);
  const enemy = state.enemy;
  const enemyIntent = enemy?.damage > 0 ? `攻击 ${enemy.damage}` : enemy?.subtitle || '意图未知';
  const liveRecommendation = hasCombat && enemy
    ? { title: '战斗出牌暂缓', card: '', reason: `已收到 ${enemy.name} 的生命、格挡和意图，手牌也会同步。出牌顺序先不做，打开地图后会给路线建议。`, sequence: [] }
    : { title: '战斗出牌暂缓', card: '', reason: '当前先做路线规划。进入战斗后这里仍会显示真实手牌和敌人，但暂时不给出牌顺序。', sequence: [] };
  const hand = hasCombat ? state.hand : [];
  return `
    <div class="view-grid">
      <section class="panel battle-panel">
        <div class="panel-heading"><span class="panel-title">战斗状态</span><span class="panel-meta">${hasCombat ? `楼层 ${state.run.floor} · 回合 ${String(state.combat.turn).padStart(2, '0')}` : '当前不在战斗中'}</span></div>
        <div class="combat-top">
          <div class="unit-card">
            <div class="unit-label"><span class="mini-status"></span>我方</div><div class="unit-name">${characterName(state.run.character)}</div><div class="unit-subtitle">${hasCombat ? '实时战斗数据' : '等待真实游戏数据'}</div>
            <div class="vitals"><div class="vital ${state.player.hp < 30 ? 'danger' : ''}"><strong>${state.player.hp}</strong><span>生命 / ${state.player.maxHp}</span></div><div class="vital"><strong>${state.player.block}</strong><span>格挡</span></div></div>
            <div class="unit-meter"><span style="width:${hpPercent(state.player)}%"></span></div>
          </div>
          <div class="unit-card enemy-card">
            <div class="unit-label enemy-label"><span class="mini-status"></span>敌方</div><div class="unit-name">${enemy?.name || '暂无敌人'}</div><div class="unit-subtitle">${enemy?.subtitle || '进入战斗后显示'}</div>
            <div class="vitals"><div class="vital danger"><strong>${enemy?.hp ?? '--'}</strong><span>${enemy ? `生命 / ${enemy.maxHp}` : '生命'}</span></div></div>
            <div class="unit-meter"><span style="width:${enemy ? hpPercent(enemy) : 0}%"></span></div><div class="intent"><strong>${enemy ? enemyIntent : '等待战斗数据'}</strong>　${enemy ? (enemy.damage > 0 ? '未减伤前的预估伤害' : '敌方下一步行动') : '本区域暂无敌人'}</div>
          </div>
        </div>
        <div class="energy-row"><div class="energy">${hasCombat ? state.player.energy : '--'}<small>/ ${hasCombat ? state.player.maxEnergy : '--'} 能量</small></div><div class="turn-status">${state.paused ? '建议已暂停 · 数据仍在同步' : hasCombat ? '等待你的操作' : '等待进入战斗'}</div><div class="panel-meta">抽牌堆 ${hasCombat ? state.combat.drawPile.length : '--'}　弃牌堆 ${hasCombat ? state.combat.discardPile.length : '--'}</div></div>
        <div class="hand-area"><div class="hand-label"><span>当前手牌 · ${hand.length} 张</span><span>${hand.length ? '点击卡牌查看推演' : '等待真实手牌数据'}</span></div><div class="hand">${hand.length ? hand.map(card => `<button class="card-tile ${card.skill ? 'skill' : ''} ${state.selectedCard === card.name ? 'recommended' : ''}" data-card="${card.name}"><span class="card-cost">${card.cost ?? 'X'}</span><span class="card-name">${card.name}</span><span class="card-type">${card.type}</span></button>`).join('') : '<div class="data-empty">进入战斗后，真实手牌会显示在这里。</div>'}</div></div>
      </section>
      <div class="side-stack">
        <section class="panel recommendation-panel">
          <div class="panel-heading"><span class="panel-title">本回合建议</span><span class="confidence">暂缓</span></div>
          <div class="recommendation-body"><div class="recommendation-kicker">出牌顺序稍后接入</div><div class="recommendation-title">${liveRecommendation.title} <em>${liveRecommendation.card}</em></div><p class="recommendation-reason">${liveRecommendation.reason}</p><div class="decision-footer"><button class="outline-button" id="open-route-view">去看路线建议</button></div></div>
        </section>
        <section class="panel why-panel"><div class="panel-heading"><span class="panel-title">为什么这样打</span><span class="panel-meta">暂缓</span></div><div class="why-body"><div class="data-empty">战斗出牌先不做。地图打开后，路线页会给出下一步该往哪走。</div></div></section>
      </div>
    </div>`;
}

function showingRest() {
  if (state.mode === 'combat' || state.mode === 'draft' || state.combat) return false;
  if (state.recommendation?.task === 'rest_site') return true;
  return atRestSite();
}

function atRestSite(run = state.run, combat = state.combat) {
  if (combat) return false;
  const room = String(run?.room || '');
  const node = String(run?.currentNode || '');
  if (/rest|camp/i.test(room)) return true;
  if (/map/i.test(room)) return false;
  return /rest/i.test(node);
}

function restView() {
  const rec = state.recommendation?.task === 'rest_site' ? state.recommendation : null;
  const primary = rec?.primary;
  const hp = state.player;
  const missing = Math.max(0, (hp.maxHp || 0) - (hp.hp || 0));
  const healPick = primary?.action === 'HEAL';
  const smithPick = primary?.action === 'SMITH';
  const healAmount = primary?.healAmount ?? (rec?.alternatives || []).find(item => item.action === 'HEAL')?.healAmount;
  const healTo = primary?.healTo ?? (hp.hp || 0) + (healAmount || 0);
  const smithAlts = (rec?.alternatives || []).filter(item => item.action === 'SMITH');
  const unupgraded = (hp.cards || []).filter(card => card && card.upgraded !== true);
  const title = primary?.label ? escapeHtml(primary.label) : '回血还是升级？';
  const reason = rec?.reason
    ? escapeHtml(rec.reason)
    : '进入休息处后，这里会根据生命、后续精英和未升级的牌，建议回血或敲哪一张。';
  const healCard = `
    <article class="draft-card ${healPick ? 'top-pick' : ''}">
      <span class="pick-tag">${healPick ? '建议' : '备选'}</span>
      <div class="card-name">回血</div>
      <p>${missing ? `当前缺口 ${missing} 点，估计可回到 ${healTo || hp.hp}/${hp.maxHp}。` : '生命已满，回血没有收益。'}</p>
    </article>`;
  const smithCard = smithPick || smithAlts[0]
    ? `<article class="draft-card ${smithPick ? 'top-pick' : ''}">
        <span class="pick-tag">${smithPick ? '建议升级' : '可升级'}</span>
        <div class="card-name">${escapeHtml(primary?.cardName || smithAlts[0]?.cardName || '')}</div>
        <p>${smithPick ? escapeHtml(rec.reason) : '生命还够时，升级这张牌通常比回一点血更能提高战斗力。'}</p>
      </article>`
    : `<article class="draft-card"><span class="pick-tag">没有可升级牌</span><div class="card-name">卡组已升满</div><p>没有未升级的牌时，只能选择回血。</p></article>`;
  const otherSmiths = smithAlts.slice(smithPick ? 0 : 1).slice(0, 3).map(item => `
    <div class="route-choice"><strong>备选升级</strong><span>${escapeHtml(item.cardName || item.label)}</span></div>`).join('');
  const sourceLabel = rec ? (rec.source === 'llm' ? '模型' : '规则') : '等待分析';
  return `<div class="draft-layout rest-layout"><section class="panel draft-offer"><div class="draft-kicker">REST / CAMPFIRE</div><h2 class="draft-title">${title}</h2><p class="recommendation-reason">${reason}</p><div class="draft-cards">${healCard}${smithCard}</div>${otherSmiths}</section><section class="panel draft-side"><div class="panel-heading"><span class="panel-title">休息处状态</span><span class="panel-meta">${sourceLabel}</span></div><div class="deck-stat"><span>生命</span><strong>${hp.hp || 0} / ${hp.maxHp || 0}</strong></div><div class="deck-stat"><span>缺口</span><strong>${missing || 0}</strong></div><div class="deck-stat"><span>未升级</span><strong>${unupgraded.length || 0}</strong></div><div class="deck-stat"><span>卡组</span><strong>${hp.cards?.length || 0}</strong></div><div class="data-empty" style="margin-top:18px">GameBuddy 只给建议，不会替你点回血或升级。</div></section></div>`;
}

function draftView() {
  return `<div class="draft-layout"><section class="panel draft-offer"><div class="draft-kicker">REWARD / CARD REWARD</div><h2 class="draft-title">等待真实卡牌奖励</h2><div class="data-empty large-empty">进入奖励界面后，Mod 会把游戏提供的卡牌传给这里，再生成选牌建议。</div></section><section class="panel draft-side"><div class="panel-heading"><span class="panel-title">当前卡组</span><span class="panel-meta">${state.player.cards.length ? `${state.player.cards.length} 张` : '等待数据'}</span></div><div class="deck-stat"><span>卡牌</span><strong>${state.player.cards.length || '--'}</strong></div><div class="deck-stat"><span>遗物</span><strong>${state.player.relics.length || '--'}</strong></div><div class="deck-stat"><span>药水</span><strong>${state.player.potions.length || '--'}</strong></div></section></div>`;
}

const MAP_TYPE_LABELS = {
  Monster: '战斗',
  Elite: '精英',
  Unknown: '问号',
  Shop: '商店',
  Treasure: '宝箱',
  RestSite: '休息处',
  Boss: 'Boss',
  Ancient: '远古',
  Unassigned: '未分配'
};

function mapTypeLabel(type) {
  return MAP_TYPE_LABELS[type] || type || '未知';
}

function sameRoute(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((id, index) => id === right[index]);
}

function mapNodeClass(type, id) {
  const classes = ['map-node'];
  const rec = state.recommendation?.task === 'map_route' ? state.recommendation : null;
  if (id && id === state.map?.current) classes.push('current');
  if (rec?.primary?.route?.includes(id) && id !== state.map?.current) classes.push('on-route');
  if (id && id === rec?.primary?.targetId) classes.push('recommended');
  if (type === 'Elite') classes.push('elite');
  if (type === 'RestSite') classes.push('rest');
  if (type === 'Boss') classes.push('boss');
  return classes.join(' ');
}

function routeView() {
  const map = state.map || { visited: [], nodes: [], routes: [] };
  const nodes = Array.isArray(map.nodes) ? map.nodes : [];
  const routes = Array.isArray(map.routes) ? map.routes : [];
  const visited = map.visited?.length || 0;
  const typeCounts = nodes.reduce((counts, node) => {
    counts[node.type] = (counts[node.type] || 0) + 1;
    return counts;
  }, {});
  const rows = [...new Set(nodes.map(node => node.row))].sort((a, b) => a - b);
  const mapGrid = rows.length
    ? rows.map(row => {
        const rowNodes = nodes.filter(node => node.row === row).sort((a, b) => a.col - b.col);
        return `<div class="map-rail" style="grid-template-columns: repeat(${Math.max(map.cols || rowNodes.length, 1)}, 1fr)">${rowNodes.map(node => `<div class="${mapNodeClass(node.type, node.id)}" data-node="${node.id}" title="${mapTypeLabel(node.type)} ${node.id}">${mapTypeLabel(node.type).slice(0, 1)}</div>`).join('')}</div>`;
      }).join('')
    : `<div class="data-empty large-empty">${visited ? `已访问 ${visited} 个节点，完整地图尚未到达。` : '打开地图后，这里会显示每个节点的类型和全部可达路线。'}</div>`;
  const rec = state.recommendation?.task === 'map_route' ? state.recommendation : null;
  const orderedRoutes = rec?.primary?.route
    ? [rec.primary.route, ...routes.filter(route => !sameRoute(route, rec.primary.route))]
    : routes;
  const routeList = orderedRoutes.slice(0, 8).map((route, index) => {
    const labels = route.map(id => {
      const node = nodes.find(item => item.id === id);
      return mapTypeLabel(node?.type);
    }).join(' → ');
    const recommended = Boolean(rec && sameRoute(route, rec.primary.route));
    return `<div class="route-choice${recommended ? ' recommended' : ''}"><strong>${recommended ? '建议路线' : `路线 ${String(index + 1).padStart(2, '0')}`}</strong><span>${escapeHtml(labels)}</span></div>`;
  }).join('');
  const title = rec?.primary?.label ? `下一步：${escapeHtml(rec.primary.label)}` : state.run.currentNode ? mapTypeLabel(state.run.currentNode) : '等待地图状态';
  const reason = rec?.reason ? escapeHtml(rec.reason) : (nodes.length
    ? `本层 ${nodes.length} 个节点，从当前位置出发有 ${routes.length} 条可达 Boss 的路线${map.routesTruncated ? '（已截断）' : ''}。`
    : '启动游戏并打开地图后，这里会显示真实位置和全部路线。');
  const sourceLabel = rec ? (rec.source === 'llm' ? '模型' : '规则') : '等待分析';
  return `<div class="route-layout"><section class="panel map-panel"><div class="panel-heading"><span class="panel-title">当前地图</span><span class="panel-meta">${map.current || state.run.currentCoord || '等待地图数据'}</span></div>${mapGrid}<div class="map-legend"><span>战斗</span><span class="legend-elite">精英</span><span>问号</span><span>商店</span><span class="legend-rest">休息处</span><span class="legend-current">当前位置</span><span class="legend-recommended">建议下一步</span></div></section><section class="panel route-advice"><div class="eyebrow">MAP / ${rec ? 'RECOMMENDATION' : 'LIVE STATE'}</div><h2>${title}</h2><p>${reason}</p>${routeList || `<div class="route-choice"><strong>已访问节点</strong><span>${visited || '--'}</span></div>`}<div class="score-row" style="margin-top:24px"><div class="score-number">${rec ? Math.round((rec.confidence || 0) * 100) : routes.length || '--'}</div><div class="score-copy"><strong>${rec ? `${sourceLabel}置信度` : '可达路线'}</strong><span>${rec ? `还有 ${rec.alternatives?.length || 0} 条备选 · 共 ${routes.length} 条可达 Boss` : Object.entries(typeCounts).map(([type, count]) => `${mapTypeLabel(type)} ${count}`).join(' · ') || '等待完整地图数据'}</span></div></div></section></div>`;
}

function evidenceList(decision) {
  return (decision?.evidence || []).map(row => `
    <li><strong>${escapeHtml(row.kind)}</strong><span>${escapeHtml(row.detail)}</span></li>`).join('');
}

function decisionPanel(decision, options = []) {
  if (!decision) return `<section class="panel recommendation-panel"><div class="panel-heading"><span class="panel-title">决策状态</span><span class="confidence">—</span></div><div class="recommendation-body"><div class="recommendation-kicker">UNAVAILABLE</div><div class="recommendation-title">尚未生成决策</div><p class="recommendation-reason">等待第一个合法游戏快照。</p></div></section>`;
  if (decision.status !== 'ready') {
    const warnings = (decision.warnings || []).map(row => `<p class="recommendation-reason">${escapeHtml(row)}</p>`).join('');
    return `<section class="panel recommendation-panel"><div class="panel-heading"><span class="panel-title">决策状态</span><span class="confidence">—</span></div><div class="recommendation-body"><div class="recommendation-kicker">UNAVAILABLE</div><div class="recommendation-title">${escapeHtml(decision.title || '暂无可靠建议')}</div><p class="recommendation-reason">${escapeHtml(decision.summary || '当前证据不足。')}</p>${warnings}</div></section>`;
  }
  const list = options.length ? `
    <div class="sequence"><div class="sequence-label">可选方案</div><div class="sequence-list">${options.map((row, index) => `
      <div class="sequence-item"><span class="sequence-number">${index + 1}</span><strong>${escapeHtml(row.title || row.name || `选项 ${index + 1}`)}</strong><span>${escapeHtml(row.reason || row.detail || row.description || '')}</span></div>`).join('')}</div></div>` : '';
  const confidence = Number.isFinite(decision.confidence) ? `${Math.round(decision.confidence * 100)}%` : '—';
  return `
    <section class="panel recommendation-panel">
      <div class="panel-heading"><span class="panel-title">${escapeHtml(decision.agent)} 决策</span><span class="confidence">置信度 ${confidence}</span></div>
      <div class="recommendation-body">
        <div class="recommendation-kicker">${escapeHtml(decision.source)}</div>
        <div class="recommendation-title">${escapeHtml(decision.title)}</div>
        <p class="recommendation-reason">${escapeHtml(decision.summary)}</p>
        ${list}
        <div class="why-body"><div class="panel-title">决策证据</div><ul class="why-list">${evidenceList(decision)}</ul></div>
        <div class="decision-footer"><button class="primary-button" id="accept-decision">采纳这条建议</button><button class="outline-button" id="dismiss-decision">暂不采纳</button></div>
      </div>
    </section>`;
}

function codexOptionsView(kind, heading) {
  const decision = state.decision;
  const rows = decision?.payload?.options || [];
  return `
    <div class="view-grid">
      <section class="panel">
        <div class="panel-heading"><span class="panel-title">${heading}</span><span class="panel-meta">${escapeHtml(decision?.agent || kind)}</span></div>
        <div class="recommendation-body">
          <div class="recommendation-kicker">${escapeHtml(decision?.status || 'UNAVAILABLE')}</div>
          <h2 class="recommendation-title">${escapeHtml(decision?.title || heading)}</h2>
          <p class="recommendation-reason">${escapeHtml(decision?.summary || '当前没有可识别的选项。')}</p>
        </div>
      </section>
      ${decisionPanel(decision, rows)}
    </div>`;
}

function render() {
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.mode === state.mode));
  const copy = {
    combat: ['COMBAT / LIVE STATE', '战斗数据在同步', '出牌顺序先不做。这里只显示真实手牌和敌人，路线建议在地图页。'],
    draft: ['REWARD / CARD REWARD', '这张牌值得拿吗？', '把卡组当前缺口、未来路线和战斗表现放在一起判断。'],
    route: showingRest()
      ? ['REST / CAMPFIRE', '回血还是升级？', '根据生命缺口、后续精英和未升级的牌，给出休息处选择。']
      : ['MAP / ACT ' + String(state.run.act || 1).padStart(2, '0'), '下一步往哪里走？', '把战斗风险、卡组成长和遗物收益，压缩成一条可执行的路线。']
  }[state.mode];
  document.querySelector('#page-eyebrow').textContent = copy[0];
  document.querySelector('#page-title').textContent = copy[1];
  document.querySelector('#page-description').textContent = copy[2];
  viewContainer.innerHTML = showingRest()
    ? restView()
    : state.mode === 'combat' ? combatView()
    : state.mode === 'draft' ? (state.decision ? codexOptionsView('reward', COPY.draft[1]) : draftView())
    : state.mode === 'event' ? codexOptionsView('event', '这个事件选什么？')
    : routeView();
  updateRunSummary();
  document.querySelector('#pause-button').classList.toggle('paused', state.paused);
  bindViewActions();
}

function updateRunSummary() {
  const character = state.run.character || '';
  const name = characterName(character);
  document.querySelector('#character-badge').textContent = name === '等待游戏' ? '?' : name.slice(0, 1);
  document.querySelector('#run-character-name').textContent = name;
  document.querySelector('#run-location').textContent = state.run.act ? `尖塔 · 第 ${state.run.act} 层 · 房间 ${state.run.floor || 0}` : '启动《杀戮尖塔 2》后显示';
  document.querySelector('#run-progress-label').textContent = state.run.act ? `${state.run.floor || 0} / ${state.run.totalFloor || '--'}` : '-- / --';
  document.querySelector('#run-progress-bar').style.width = state.run.act ? `${Math.min(100, ((state.run.floor || 0) / Math.max(1, state.run.totalFloor || 52)) * 100)}%` : '0%';
  document.querySelector('#deck-count').textContent = state.player.cards?.length || '--';
  document.querySelector('#relic-count').textContent = state.player.relics?.length || '--';
  document.querySelector('#gold-count').textContent = state.run.act ? (state.player.gold ?? 0) : '--';
}

function bindViewActions() {
  document.querySelectorAll('[data-card]').forEach(button => button.addEventListener('click', () => { state.selectedCard = button.dataset.card; render(); showToast(`已查看「${button.dataset.card}」，出牌建议稍后接入`); }));
  document.querySelector('#open-route-view')?.addEventListener('click', () => { state.mode = 'route'; render(); });
  document.querySelector('#accept-decision')?.addEventListener('click', () => {
    const decision = state.decision;
    if (!decision) return;
    window.gamebuddyBridge?.acceptDecision?.(decision);
    showToast('已记录采纳结果');
  });
  document.querySelector('#dismiss-decision')?.addEventListener('click', () => showToast('已忽略当前建议'));
  document.querySelector('#confirm-action')?.addEventListener('click', () => showToast('建议已记录，GameBuddy 不会自动操作游戏'));
  document.querySelector('#more-actions')?.addEventListener('click', () => showToast('其他方案将在决策引擎接入后显示'));
  document.querySelectorAll('[data-node]').forEach(button => button.addEventListener('click', () => showToast(`节点 ${button.dataset.node}`)));
}

document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => { state.mode = button.dataset.mode; render(); }));
document.querySelector('#minimize-button').addEventListener('click', () => window.windowControls?.minimize());
document.querySelector('#close-button').addEventListener('click', () => window.windowControls?.close());
document.querySelector('#refresh-button').addEventListener('click', async () => {
  state.syncedAt = Date.now();
  document.querySelector('#last-sync').textContent = '刚刚同步';
  try {
    const result = await window.gamebuddyBridge?.refreshRecommendation?.();
    showToast(result?.ok ? '已根据当前地图给出路线建议' : '已刷新，但还没有可走的下一步');
  } catch {
    showToast('已从游戏数据桥刷新当前局面');
  }
});
document.querySelector('#pause-button').addEventListener('click', () => { state.paused = !state.paused; document.querySelector('#pause-button').classList.toggle('paused', state.paused); document.querySelector('#pause-label').textContent = state.paused ? '已暂停' : '建议中'; render(); });

function setBridgeStatus(status) {
  const phase = typeof status === 'object' ? status.status : status ? 'connected' : 'waiting';
  const replay = phase === 'live' && typeof status === 'object' && status.mode === 'replay';
  const connected = phase === 'live' && !replay;
  const invalid = phase === 'invalid';
  const stale = phase === 'stale';
  const wasLive = state.source === 'bridge' || state.source === 'demo';
  state.source = replay || phase === 'demo' ? 'demo' : connected ? 'bridge' : 'waiting';
  if (wasLive && phase !== 'live' && phase !== 'stale') {
    state.run = { act: 0, floor: 0, totalFloor: 0, room: null, character: '' };
    state.player = { hp: 0, maxHp: 0, block: 0, energy: 0, maxEnergy: 0, gold: 0, cards: [], relics: [], potions: [] };
    state.combat = null;
    state.enemy = null;
    state.hand = [];
    state.selectedCard = '';
    state.recommendation = null;
    state.syncedAt = 0;
    render();
  }
  document.querySelector('.status-indicator').style.background = connected ? 'var(--mint)' : invalid || stale ? 'var(--red)' : 'var(--amber)';
  document.querySelector('#bridge-name').textContent = replay || phase === 'demo' ? '回放数据' : connected ? '游戏数据' : invalid ? '数据异常' : stale ? '数据停滞' : phase === 'connecting' ? '正在连接' : phase === 'connected' ? '数据桥已连接' : '等待游戏';
  document.querySelector('#bridge-state').textContent = replay || phase === 'demo' ? 'DEMO' : connected ? 'LIVE' : invalid ? 'ERROR' : stale ? 'STALE' : 'WAIT';
  document.querySelector('#bridge-state').style.color = connected ? 'var(--mint)' : invalid || stale ? 'var(--red)' : 'var(--amber)';
  document.querySelector('#bridge-detail').textContent = connected
    ? '本地 Mod Bridge · 0.4.2'
    : replay
      ? 'Replay Bridge · 127.0.0.1:27182'
    : invalid
      ? `消息未通过校验 · ${status.detail || '未知错误'}`
      : stale
        ? status.detail
      : phase === 'connecting'
        ? '正在等待 127.0.0.1:27182'
        : phase === 'connected'
          ? '等待第一份游戏状态 · 127.0.0.1:27182'
        : phase === 'demo'
          ? 'Replay Bridge · 127.0.0.1:27182'
          : '等待本地 Mod Bridge · 127.0.0.1:27182';
}

function applyBridgeState(next) {
  if (next.run) state.run = { ...state.run, ...next.run };
  if (next.player) state.player = { ...state.player, ...next.player };
  state.map = next.map || { visited: [] };
  const incomingCombat = next.combat;
  state.combat = incomingCombat ? {
    ...incomingCombat,
    drawPile: incomingCombat.drawPile || [],
    discardPile: incomingCombat.discardPile || [],
    exhaustPile: incomingCombat.exhaustPile || []
  } : null;
  state.enemy = null;
  state.hand = [];
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
  state.selectedCard = '';
  state.syncedAt = Date.now();
  if (atRestSite(next.run, state.combat)) state.mode = 'route';
  if (state.mode === 'combat' || state.mode === 'route') render();
}

setInterval(() => {
  if (state.paused) return;
  const seconds = Math.max(0, Math.round((Date.now() - state.syncedAt) / 1000));
  document.querySelector('#last-sync').textContent = seconds < 2 ? '刚刚同步' : `${seconds} 秒前同步`;
}, 1000);

render();
setBridgeStatus({ status: 'waiting' });
window.gamebuddyBridge?.onState(applyBridgeState);
window.gamebuddyBridge?.onEvent(event => {
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
  if (event.name === 'rest.opened') {
    state.mode = 'route';
    render();
    showToast('休息处：回血还是升级');
  }
});
window.gamebuddyBridge?.onObservation(observation => {
  if (!observation || !observation.decision) return;
  state.decision = observation.decision;
  if (state.mode === 'draft' || state.mode === 'event') render();
});
window.gamebuddyBridge?.onRecommendation(recommendation => {
  if (!recommendation || (recommendation.task !== 'map_route' && recommendation.task !== 'rest_site')) return;
  state.recommendation = recommendation;
  if (recommendation.task === 'rest_site') state.mode = 'route';
  if (state.mode === 'route') render();
});
window.gamebuddyBridge?.onStatus(status => {
  setBridgeStatus(status);
  if (status.status === 'connected') showToast('已连接《杀戮尖塔 2》实时数据');
});
