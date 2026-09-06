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
  statusDot.classList.remove('live', 'alert');
  if (status.status === 'live') {
    statusDot.classList.add('live');
    statusLabel.textContent = '游戏 LIVE';
  } else if (status.status === 'invalid' || status.status === 'stale') {
    statusDot.classList.add('alert');
    statusLabel.textContent = status.status === 'stale' ? '数据停滞' : '数据异常';
    say(status.status === 'stale' ? '游戏状态停住了' : '数据格式需要检查', 'alert');
  } else {
    statusLabel.textContent = status.status === 'connected' ? '等待游戏' : '模拟数据';
    if (status.status === 'connecting') say('正在找游戏', 'thinking');
  }
}

function setState(next) {
  const decision = next.decision;
  if (decision?.status === 'ready') {
    say(decision.title, decision.agent === 'combat' ? 'alert' : 'thinking');
  } else {
    say('我在看着这局');
  }
}

let clickTimer = null;

document.querySelector('#pet-button').addEventListener('click', () => {
  // Distinguish click (open panel) from drag start.
  if (clickTimer) return;
  clickTimer = setTimeout(() => { clickTimer = null; }, 260);
});

document.querySelector('#pet-button').addEventListener('dblclick', () => {
  clearTimeout(clickTimer);
  clickTimer = null;
  window.windowControls?.openMain();
});
window.runmateBridge?.onStatus(setStatus);
window.runmateBridge?.onState(setState);
window.runmateBridge?.onObservation(observation => observation?.decision && setState({ decision: observation.decision }));
