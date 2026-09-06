const appState = {
  mode: 'combat',
  paused: false,
  observation: null
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

function currentDecision() {
  return appState.observation?.decision || null;
}

function gameState() {
  return appState.observation?.state || null;
}

function hpPercent(unit) {
  if (!unit || !Number.isFinite(unit.hp) || !Number.isFinite(unit.maxHp) || unit.maxHp <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((unit.hp / unit.maxHp) * 100)));
}

function decisionPanel(decision, options = []) {
  if (!decision) return emptyDecision('尚未生成决策', '等待第一个合法游戏快照。');
  if (decision.status !== 'ready') return emptyDecision(decision.title || '暂无可靠建议', decision.summary || '当前证据不足。', decision.warnings || []);
  const evidence = (decision.evidence || []).map(row => `
    <li><strong>${row.kind}</strong><span>${row.detail}</span></li>
  `).join('');
  const list = options.length ? `
    <div class="sequence">
      <div class="sequence-label">可选方案</div>
      <div class="sequence-list">${options.map((row, index) => `
        <div class="sequence-item">
          <span class="sequence-number">${index + 1}</span>
          <strong>${row.title || row.name || `选项 ${index + 1}`}</strong>
          <span>${row.reason || row.detail || row.description || ''}</span>
        </div>`).join('')}</div>
    </div>` : '';
  const confidence = Number.isFinite(decision.confidence) ? `${Math.round(decision.confidence * 100)}%` : '—';
  return `
    <section class="panel recommendation-panel">
      <div class="panel-heading">
        <span class="panel-title">${decision.agent} 决策</span>
        <span class="confidence">置信度 ${confidence}</span>
      </div>
      <div class="recommendation-body">
        <div class="recommendation-kicker">${decision.source}</div>
        <div class="recommendation-title">${decision.title}</div>
        <p class="recommendation-reason">${decision.summary}</p>
        ${list}
        <div class="why-body">
          <div class="panel-title">决策证据</div>
          <ul class="why-list">${evidence}</ul>
        </div>
        <div class="decision-footer">
          <button class="primary-button" id="accept-decision">采纳这条建议</button>
          <button class="outline-button" id="dismiss-decision">暂不采纳</button>
        </div>
      </div>
    </section>`;
}

function emptyDecision(title, reason, warnings = []) {
  return `
    <section class="panel recommendation-panel">
      <div class="panel-heading"><span class="panel-title">决策状态</span><span class="confidence">—</span></div>
      <div class="recommendation-body">
        <div class="recommendation-kicker">UNAVAILABLE</div>
        <div class="recommendation-title">${title}</div>
        <p class="recommendation-reason">${reason}</p>
        ${warnings.map(row => `<p class="recommendation-reason">${row}</p>`).join('')}
      </div>
    </section>`;
}

function combatView() {
  const state = gameState();
  const combat = state?.combat;
  const player = state?.player || {};
  const decision = currentDecision();
  const hand = combat?.hand || [];
  const enemies = combat?.enemies || [];
  return `
    <div class="view-grid">
      <section class="panel battle-panel">
        <div class="panel-heading">
          <span class="panel-title">战斗状态</span>
          <span class="panel-meta">${state ? `楼层 ${state.run.floor} · 回合 ${combat?.turn ?? '—'}` : '等待战斗数据'}</span>
        </div>
        <div class="combat-top">
          <div class="unit-card">
            <div class="unit-label"><span class="mini-status"></span>我方</div>
            <div class="unit-name">${state?.run.character || '未知角色'}</div>
            <div class="vitals">
              <div class="vital ${player.hp < player.maxHp * .3 ? 'danger' : ''}"><strong>${player.hp ?? '—'}</strong><span>生命 / ${player.maxHp ?? '—'}</span></div>
              <div class="vital"><strong>${player.block ?? '—'}</strong><span>格挡</span></div>
            </div>
            <div class="unit-meter"><span style="width:${hpPercent(player)}%"></span></div>
          </div>
          ${enemies.map(enemy => `
            <div class="unit-card enemy-card">
              <div class="unit-label enemy-label"><span class="mini-status"></span>敌方</div>
              <div class="unit-name">${enemy.name}</div>
              <div class="vitals"><div class="vital danger"><strong>${enemy.hp}</strong><span>生命 / ${enemy.maxHp}</span></div></div>
              <div class="unit-meter"><span style="width:${hpPercent(enemy)}%"></span></div>
              <div class="intent"><strong>${enemy.intent || '未知意图'}</strong>${Number.isFinite(enemy.damage) ? ` · 预估 ${enemy.damage}` : ''}</div>
            </div>`).join('')}
        </div>
        <div class="energy-row">
          <div class="energy">${player.energy ?? '—'}<small>/ ${player.maxEnergy || '—'} 能量</small></div>
          <div class="turn-status">${appState.paused ? '建议已暂停 · 数据仍在同步' : '等待你的操作'}</div>
          <div class="panel-meta">抽牌堆 ${combat?.drawPile?.length || 0}　弃牌堆 ${combat?.discardPile?.length || 0}</div>
        </div>
        <div class="hand-area">
          <div class="hand-label"><span>当前手牌 · ${hand.length} 张</span><span>由真实状态生成</span></div>
          <div class="hand">${hand.map(card => `
            <div class="card-tile">
              <span class="card-cost">${card.cost ?? '?'}</span>
              <span class="card-name">${card.name || card.id}</span>
              <span class="card-type">${card.type || ''}</span>
            </div>`).join('') || '<div class="card-type">手牌为空</div>'}</div>
        </div>
      </section>
      <div class="side-stack">${decisionPanel(decision, decision?.payload?.sequence || [])}</div>
    </div>`;
}

function optionsView(kind, heading) {
  const decision = currentDecision();
  const rows = decision?.payload?.options || [];
  return `
    <div class="view-grid">
      <section class="panel">
        <div class="panel-heading"><span class="panel-title">${heading}</span><span class="panel-meta">${decision?.agent || kind}</span></div>
        <div class="recommendation-body">
          <div class="recommendation-kicker">${decision?.status || 'UNAVAILABLE'}</div>
          <h2 class="recommendation-title">${decision?.title || heading}</h2>
          <p class="recommendation-reason">${decision?.summary || '当前没有可识别的选项。'}</p>
        </div>
      </section>
      ${decisionPanel(decision, rows)}
    </div>`;
}

const COPY = {
  combat: ['COMBAT', '当前回合怎么打？', '由战斗 agent 根据手牌、敌人和 Codex 数据推演。'],
  draft: ['REWARD', '这次奖励怎么选？', '由奖励 agent 对卡牌、遗物和药水做边际收益评估。'],
  route: ['MAP', '下一步走哪里？', '由路线 agent 结合当前血量、卡组规模和 Codex 遭遇池评分。'],
  event: ['EVENT', '这个事件选什么？', '由事件 agent 检查 Codex 选项效果和当前状态约束。']
};

function render() {
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.mode === appState.mode));
  const copy = COPY[appState.mode] || COPY.combat;
  document.querySelector('#page-eyebrow').textContent = copy[0];
  document.querySelector('#page-title').textContent = copy[1];
  document.querySelector('#page-description').textContent = copy[2];
  viewContainer.innerHTML = appState.mode === 'combat' ? combatView() : optionsView(appState.mode, COPY[appState.mode][1]);
  updateRunSummary();
  document.querySelector('#pause-button').classList.toggle('paused', appState.paused);
  bindViewActions();
}

function updateRunSummary() {
  const state = gameState();
  const character = state?.run?.character || '';
  const names = { ironclad: '铁甲战士', silent: '静默猎手', defect: '故障机器人', regent: '统御者', necrobinder: '死灵法师' };
  document.querySelector('#run-character-name').textContent = names[character.toLowerCase()] || character || '未连接';
  document.querySelector('#run-location').textContent = state ? `尖塔 · 第 ${state.run.act || 1} 层 · 房间 ${state.run.floor || 0}` : '等待游戏状态';
  document.querySelector('#run-progress-label').textContent = `${state?.run?.floor || 0} / ${state?.run?.totalFloor || 52}`;
  document.querySelector('#run-progress-bar').style.width = `${Math.min(100, ((state?.run?.floor || 0) / Math.max(1, state?.run?.totalFloor || 52)) * 100)}%`;
  document.querySelector('#deck-count').textContent = state?.player?.cards?.length || 0;
  document.querySelector('#relic-count').textContent = state?.player?.relics?.length || 0;
  document.querySelector('#gold-count').textContent = state?.player?.gold ?? 0;
}

function bindViewActions() {
  document.querySelector('#accept-decision')?.addEventListener('click', () => {
    const decision = currentDecision();
    if (!decision) return;
    window.runmateBridge?.acceptDecision(decision);
    showToast('已记录采纳结果');
  });
  document.querySelector('#dismiss-decision')?.addEventListener('click', () => showToast('已忽略当前建议'));
}

document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => {
  appState.mode = button.dataset.mode;
  render();
}));
document.querySelector('#minimize-button').addEventListener('click', () => window.windowControls?.minimize());
document.querySelector('#close-button').addEventListener('click', () => window.windowControls?.close());
document.querySelector('#refresh-button').addEventListener('click', async () => {
  const observation = await window.runmateBridge?.getObservation();
  if (observation) applyObservation(observation);
  showToast('已重新读取观察快照');
});
document.querySelector('#pause-button').addEventListener('click', () => {
  appState.paused = !appState.paused;
  document.querySelector('#pause-label').textContent = appState.paused ? '已暂停' : '建议中';
  render();
});

function setBridgeStatus(status) {
  const phase = typeof status === 'object' ? status.status : status ? 'connected' : 'demo';
  const connected = phase === 'live';
  const invalid = phase === 'invalid';
  const stale = phase === 'stale';
  document.querySelector('.status-indicator').style.background = connected ? 'var(--mint)' : invalid || stale ? 'var(--red)' : 'var(--amber)';
  document.querySelector('#bridge-name').textContent = connected ? '游戏数据' : invalid ? '数据异常' : stale ? '数据停滞' : phase === 'connecting' ? '正在连接' : phase === 'connected' ? '数据桥已连接' : '模拟数据';
  document.querySelector('#bridge-state').textContent = connected ? 'LIVE' : invalid ? 'ERROR' : stale ? 'STALE' : phase === 'connecting' || phase === 'connected' ? 'WAIT' : 'DEMO';
  document.querySelector('#bridge-state').style.color = connected ? 'var(--mint)' : invalid || stale ? 'var(--red)' : 'var(--amber)';
  document.querySelector('#bridge-detail').textContent = status?.detail || BRIDGE_WAIT_DETAIL[phase] || '';
  document.querySelector('#last-sync').textContent = appState.observation?.receivedAt ? '已同步' : '未同步';
}

const BRIDGE_WAIT_DETAIL = {
  connecting: '正在等待 127.0.0.1:27182',
  connected: '等待第一份游戏状态 · 127.0.0.1:27182',
  demo: '等待本地 Mod Bridge · 127.0.0.1:27182'
};

function applyObservation(observation) {
  if (!observation) return;
  appState.observation = observation;
  const room = observation.state?.run?.room;
  if (room === 'map') appState.mode = 'route';
  else if (room === 'event') appState.mode = 'event';
  else if (observation.state?.rewards?.length) appState.mode = 'draft';
  else if (observation.state?.combat) appState.mode = 'combat';
  const seconds = Math.max(0, Math.round((Date.now() - (observation.receivedAt || Date.now())) / 1000));
  document.querySelector('#last-sync').textContent = seconds < 2 ? '刚刚同步' : `${seconds} 秒前同步`;
  if (!appState.paused) render();
}

render();
setBridgeStatus(false);
window.runmateBridge?.onObservation(applyObservation);
window.runmateBridge?.onStatus(status => {
  setBridgeStatus(status);
  if (status.status === 'live') showToast('已连接真实游戏数据');
});
