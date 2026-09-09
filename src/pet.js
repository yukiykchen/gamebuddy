const stage = document.querySelector('#pet-stage');
const speech = document.querySelector('#speech');
const statusDot = document.querySelector('.status-dot');
const statusLabel = document.querySelector('#pet-status-label');
const guidePanel = document.querySelector('#encounter-guide');
const guideKicker = document.querySelector('#guide-kicker');
const guideTitle = document.querySelector('#guide-title');
const guideContent = document.querySelector('#guide-content');
const guideSource = document.querySelector('#guide-source');
const cardPanel = document.querySelector('#card-recommendation');
const cardTitle = document.querySelector('#card-title');
const cardReason = document.querySelector('#card-reason');
const cardPoints = document.querySelector('#card-points');
const cardMeta = document.querySelector('#card-meta');

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

function cardPointList(title, items, className) {
  if (!items?.length) return '';
  return `<section class="card-point ${className}"><strong>${escapeHtml(title)}</strong><ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>`;
}

function setCardRecommendation(recommendation) {
  if (!recommendation) {
    cardPanel.classList.remove('visible');
    cardReason.textContent = '';
    cardPoints.innerHTML = '';
    return;
  }
  const primary = recommendation.primary || {};
  const analysis = primary.analysis;
  cardTitle.textContent = primary.action === 'SKIP'
    ? '建议跳过这次奖励'
    : `推荐「${primary.cardName || primary.label || '这张牌'}」`;
  cardReason.textContent = recommendation.reason || '当前局面下，这是规则评分最高的选择。';
  cardPoints.innerHTML = analysis
    ? `${cardPointList('为什么适合', analysis.pros?.slice(0, 3), 'positive')}${cardPointList('需要留意', analysis.cons?.slice(0, 2), 'negative')}`
    : cardPointList('为什么跳过', ['保持牌组精简，提高核心牌的抽取稳定性'], 'neutral');
  const confidence = Math.round((Number(recommendation.confidence) || 0) * 100);
  const source = recommendation.source === 'llm' ? 'LLM 复核' : '规则评分';
  const version = analysis?.stats?.knowledgeVersion;
  cardMeta.textContent = `${source} · 置信度 ${confidence}%${version ? ` · ${version}` : ''}`;
  cardPanel.classList.add('visible');
  say(primary.action === 'SKIP' ? '这次建议跳过，理由在左边' : `建议拿 ${primary.cardName || primary.label}`, '');
}

function setAgentThinking(state) {
  const thinking = Boolean(state?.thinking);
  stage.classList.toggle('llm-thinking', thinking);
  if (!thinking) {
    stage.classList.remove('thinking');
    return;
  }
  const task = state.tasks?.[0];
  const labels = {
    card_reward: '正在比较三张奖励牌',
    map_route: '正在推演后续路线',
    rest_site: '正在权衡回血和升级'
  };
  say(labels[task] || '正在结合这局思考', 'thinking');
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
  if (intent.includes('attack')) {
    say('小心，敌人显示攻击意图', 'alert');
  } else if (/rest|camp/i.test(String(next.run?.room || '')) || /rest/i.test(String(next.run?.currentNode || ''))) {
    say('休息处，想想回血还是升级', 'thinking');
  } else if (next.run?.room === 'map') {
    say('地图开了，看看走哪条');
  } else {
    say('我在看着这局');
  }
}

function setRecommendation(recommendation) {
  if (!recommendation) {
    say('地图已打开，正在重新规划');
    return;
  }
  if (recommendation?.task === 'card_reward' && recommendation.primary?.label) {
    say(recommendation.primary.action === 'SKIP' ? '这次建议跳过' : `建议${recommendation.primary.label}`, '');
    return;
  }
  if (recommendation?.task === 'rest_site' && recommendation.primary?.label) {
    const shortReason = String(recommendation.reason || '').split(/[。！？]/)[0];
    say(`休息处建议${recommendation.primary.label}${shortReason ? `：${shortReason}` : ''}`);
    return;
  }
  if (recommendation?.task !== 'map_route' || !recommendation.primary?.label) return;
  if (recommendation.tie?.isTie) {
    say(`${recommendation.tie.label}，任选其一`);
    return;
  }
  say(`下一步建议走${recommendation.primary.displayLabel || recommendation.primary.label}`, 'thinking');
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
document.querySelector('#card-close').addEventListener('click', () => {
  setCardRecommendation(null);
  window.windowControls?.dismissCardRecommendation();
});
window.gamebuddyBridge?.onStatus(setStatus);
window.gamebuddyBridge?.onState(setState);
window.gamebuddyBridge?.onRecommendation(setRecommendation);
window.gamebuddyBridge?.onEncounterGuide(setEncounterGuide);
window.gamebuddyBridge?.onCardRecommendation(setCardRecommendation);
window.gamebuddyBridge?.onAgentThinking(setAgentThinking);
