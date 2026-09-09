const stage = document.querySelector('#pet-stage');
const speech = document.querySelector('#speech');
const statusDot = document.querySelector('.status-dot');
const statusLabel = document.querySelector('#pet-status-label');
const guidePanel = document.querySelector('#encounter-guide');
const guideKicker = document.querySelector('#guide-kicker');
const guideTitle = document.querySelector('#guide-title');
const guideContent = document.querySelector('#guide-content');
const guideSource = document.querySelector('#guide-source');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function guideList(title, items, className = '') {
  if (!items?.length) return '';
  return `<section class="guide-section"><div class="guide-section-title">${escapeHtml(title)}</div><ul class="guide-list ${className}">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>`;
}

function setEncounterGuide(guide) {
  if (!guide) {
    guidePanel.classList.remove('visible');
    guideContent.innerHTML = '';
    return;
  }
  guideKicker.textContent = guide.kind === 'boss' ? 'BOSS 攻略' : '精英攻略';
  guideTitle.textContent = guide.title || '敌人机制';
  const monsters = (guide.monsters || []).map(monster => `
    <article class="guide-monster">
      <div class="guide-monster-head"><strong>${escapeHtml(monster.name)}</strong><span>${escapeHtml(monster.hp)}</span></div>
      ${(monster.innate || []).length ? `<div class="guide-innate">固有机制：${monster.innate.map(escapeHtml).join('；')}</div>` : ''}
      <div class="guide-cycle">行动循环：${escapeHtml(monster.cycle)}</div>
      ${guideList('招式', monster.moves || [])}
    </article>`).join('');
  const strategy = guide.strategy;
  const summary = strategy?.summary
    ? `<p class="guide-summary strategy">${escapeHtml(strategy.summary)}</p>`
    : '<p class="guide-summary">本场只有机制数据，暂无匹配的社区打法档案。</p>';
  guideContent.innerHTML = `${summary}${guideList('先检查你的牌组', strategy?.deckChecks, 'check')}${guideList('目标优先级', strategy?.priorityTargets, 'target')}${monsters}${guideList('主要危险', guide.dangers, 'danger')}${guideList('应对建议', guide.tips, 'tip')}${guideList('常见失误', strategy?.avoid, 'avoid')}`;
  const sourceCount = strategy?.sources?.length || 0;
  const confidence = strategy?.confidence === 'high' ? '高可信' : strategy?.confidence === 'medium' ? '中可信' : '';
  guideSource.textContent = guide.source === 'spire-codex'
    ? `机制：Spire Codex · 攻略：${sourceCount} 个社区来源${confidence ? ` · ${confidence}` : ''} · stable ${guide.gameVersion || '当前版本'}`
    : '数据来源：游戏 Bridge · 未匹配到完整资料';
  guidePanel.classList.add('visible');
  say(`${guide.kind === 'boss' ? 'Boss' : '精英'}攻略来了`, 'alert');
}

function say(message, mood = '') {
  speech.textContent = message;
  speech.classList.add('visible');
  stage.classList.remove('thinking', 'alert');
  if (mood) stage.classList.add(mood);
}

function setStatus(status) {
  const replay = status.status === 'live' && status.mode === 'replay';
  statusDot.classList.remove('live', 'alert');
  if (replay) {
    statusLabel.textContent = '回放 DEMO';
  } else if (status.status === 'live') {
    statusDot.classList.add('live');
    statusLabel.textContent = '游戏 LIVE';
  } else if (status.status === 'invalid' || status.status === 'stale') {
    statusDot.classList.add('alert');
    statusLabel.textContent = status.status === 'stale' ? '数据停滞' : '数据异常';
    say(status.status === 'stale' ? '游戏状态停住了' : '数据格式需要检查', 'alert');
  } else {
    statusLabel.textContent = status.status === 'connected' ? '等待游戏' : status.status === 'demo' ? '回放数据' : '等待游戏';
    if (status.status === 'connecting') say('正在找游戏', 'thinking');
  }
}

function setState(next) {
  const enemy = next.combat?.enemies?.[0];
  const intent = String(enemy?.intent || '').toLowerCase();
  if (intent.includes('attack') || Number(enemy?.damage) > 0) {
    say(`小心，预计 ${enemy.damage || 0} 伤害`, 'alert');
  } else if (/rest|camp/i.test(String(next.run?.room || '')) || /rest/i.test(String(next.run?.currentNode || ''))) {
    say('休息处，想想回血还是升级', 'thinking');
  } else if (next.run?.room === 'map') {
    say('地图开了，看看走哪条');
  } else {
    say('我在看着这局');
  }
}

function setRecommendation(recommendation) {
  if (recommendation?.task === 'rest_site' && recommendation.primary?.label) {
    say(`休息处建议${recommendation.primary.label}`, 'thinking');
    return;
  }
  if (recommendation?.task !== 'map_route' || !recommendation.primary?.label) return;
  say(`下一路点建议走${recommendation.primary.label}`, 'thinking');
}

const petButton = document.querySelector('#pet-button');
let dragState;

petButton.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  dragState = { pointerId: event.pointerId, screenX: event.screenX, screenY: event.screenY, moved: false };
  petButton.setPointerCapture(event.pointerId);
  window.windowControls?.startPetDrag({ x: event.screenX, y: event.screenY });
});

petButton.addEventListener('pointermove', event => {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const distance = Math.hypot(event.screenX - dragState.screenX, event.screenY - dragState.screenY);
  if (!dragState.moved && distance < 4) return;
  dragState.moved = true;
  window.windowControls?.movePet({ x: event.screenX, y: event.screenY });
});

function finishPetPointer(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const wasDragged = dragState.moved;
  window.windowControls?.endPetDrag();
  if (petButton.hasPointerCapture(event.pointerId)) petButton.releasePointerCapture(event.pointerId);
  dragState = undefined;
  if (!wasDragged) window.windowControls?.openMain();
}

petButton.addEventListener('pointerup', finishPetPointer);
petButton.addEventListener('pointercancel', finishPetPointer);
petButton.addEventListener('contextmenu', event => {
  event.preventDefault();
  window.windowControls?.showPetMenu({ x: event.clientX, y: event.clientY });
});
document.querySelector('#guide-close').addEventListener('click', () => {
  setEncounterGuide(null);
  window.windowControls?.dismissEncounterGuide();
});
window.gamebuddyBridge?.onStatus(setStatus);
window.gamebuddyBridge?.onState(setState);
window.gamebuddyBridge?.onRecommendation(setRecommendation);
window.gamebuddyBridge?.onEncounterGuide(setEncounterGuide);
