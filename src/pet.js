const stage = document.querySelector('#pet-stage');
const speech = document.querySelector('#speech');
const statusDot = document.querySelector('.status-dot');
const statusLabel = document.querySelector('#pet-status-label');

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
  if (Array.isArray(next.event?.options) && next.event.options.length) {
    say('事件出现了，我来想想怎么选', 'thinking');
    return;
  }
  if (Array.isArray(next.cardReward?.options) && next.cardReward.options.length) {
    say('我在分析这几张牌', 'thinking');
    return;
  }
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
  if (recommendation?.task === 'event_choice' && recommendation.primary?.label) {
    say(`事件建议选${recommendation.primary.label}`, 'thinking');
    return;
  }
  if (recommendation?.task === 'rest_site' && recommendation.primary?.label) {
    say(`休息处建议${recommendation.primary.label}`, 'thinking');
    return;
  }
  if (recommendation?.task === 'card_reward' && recommendation.primary?.cardName) {
    say(`建议选第${Number(recommendation.primary.cardIndex) + 1}张${recommendation.primary.cardName}`, 'thinking');
    return;
  }
  if (recommendation?.task !== 'map_route' || !recommendation.primary?.label) return;
  const target = recommendation.primary.targetPosition
    || (recommendation.primary.targetId ? `节点 ${recommendation.primary.targetId}` : '该节点');
  say(`下一步点${target}${recommendation.primary.label}`, 'thinking');
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
window.gamebuddyBridge?.onStatus(setStatus);
window.gamebuddyBridge?.onState(setState);
window.gamebuddyBridge?.onRecommendation(setRecommendation);
window.gamebuddyBridge?.onAgentStatus(status => {
  if (status?.status === 'thinking' && status.task === 'event_choice') say('我在分析事件选项', 'thinking');
  if (status?.status === 'thinking' && status.task === 'card_reward') say('我在分析这几张牌', 'thinking');
});
