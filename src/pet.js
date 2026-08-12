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
  const enemy = next.combat?.enemies?.[0];
  const intent = String(enemy?.intent || '').toLowerCase();
  if (intent.includes('attack') || Number(enemy?.damage) > 0) {
    say(`小心，预计 ${enemy.damage || 0} 伤害`, 'alert');
  } else if (next.combat?.hand?.length) {
    say('手牌更新了，看看怎么打', 'thinking');
  } else {
    say('我在看着这局');
  }
}

document.querySelector('#pet-button').addEventListener('click', () => window.windowControls?.openMain());
document.querySelector('#pet-menu').addEventListener('click', event => { event.stopPropagation(); window.windowControls?.togglePet(); });
window.runmateBridge?.onStatus(setStatus);
window.runmateBridge?.onState(setState);
