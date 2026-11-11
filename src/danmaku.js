'use strict';

const layer = document.querySelector('#danmaku-layer');
const composer = document.querySelector('#shared-composer');
const composerPanel = document.querySelector('#shared-composer-panel');
const composerToggle = document.querySelector('#shared-composer-toggle');
const composerClose = document.querySelector('#shared-composer-close');
const composerInput = document.querySelector('#shared-composer-input');
const composerSubmit = document.querySelector('#shared-composer-submit');
const composerScene = document.querySelector('#shared-composer-scene');
const composerStatus = document.querySelector('#shared-composer-status');
const query = new URLSearchParams(location.search);
const surface = query.get('surface') || 'all';
// Windows 飞行层使用主进程光标采样作为唯一悬停来源，避免穿透切换产生的
// pointerleave 与下一次采样相互撤销，造成暂停和详情反复闪动。
const usesCursorProbe = surface === 'overlay' && query.get('cursorProbe') !== 'native';
if (surface === 'overlay') composer?.remove();
if (surface === 'composer') {
  layer?.remove();
  document.documentElement.classList.add('composer-surface');
}
const flyers = [];
const displayedMessageIds = new Set();
const SPEED = 105;
let held = false;
let ticking = false;
let pointerInteractive = false;
let composerOpen = false;
let composerSubmitting = false;

function setPointerInteractive(enabled) {
  const next = Boolean(enabled);
  if (pointerInteractive === next) return;
  pointerInteractive = next;
  window.gamebuddyBridge?.setDanmakuPointerMode?.(next);
}

function clearDanmaku() {
  flyers.splice(0, flyers.length);
  layer?.replaceChildren();
  held = false;
  setComposerOpen(false);
  setPointerInteractive(false);
}

function removeFlyer(item) {
  const index = flyers.findIndex(flyer => flyer.item === item);
  if (index >= 0) flyers.splice(index, 1);
  item.remove();
}

function pauseAll(hovered) {
  held = true;
  setPointerInteractive(true);
  for (const flyer of flyers) flyer.item.classList.toggle('hovered', flyer.item === hovered);
}

function resumeAll() {
  held = false;
  if (!composerOpen) setPointerInteractive(false);
  for (const flyer of flyers) flyer.item.classList.remove('hovered');
  startClock();
}

function setComposerStatus(text, tone = '') {
  if (!composerStatus) return;
  composerStatus.textContent = text;
  if (tone) composerStatus.dataset.tone = tone;
  else delete composerStatus.dataset.tone;
}

function sceneLabel(context) {
  if (!context?.sceneKey) return '当前没有可留言的战斗场景';
  return context.phase === 'death' ? '当前死亡场景' : '当前战斗场景';
}

async function refreshComposerContext() {
  let context = null;
  try {
    context = await window.gamebuddyBridge?.getSharedDanmakuContext?.();
  } catch {
    context = null;
  }
  const enabled = Boolean(context?.sceneKey);
  if (composerScene) composerScene.textContent = sceneLabel(context);
  if (composerInput) composerInput.disabled = !enabled || composerSubmitting;
  if (composerSubmit) composerSubmit.disabled = !enabled || composerSubmitting;
  if (!enabled) setComposerStatus('进入战斗后才能留言', 'error');
  else if (!composerSubmitting) setComposerStatus('Enter 发送 · Shift+Enter 换行');
  return context;
}

function setComposerOpen(open) {
  composerOpen = Boolean(open);
  if (composerPanel) composerPanel.hidden = !composerOpen;
  composerToggle?.setAttribute('aria-expanded', String(composerOpen));
  if (!composerOpen) {
    composerInput?.blur();
    window.gamebuddyBridge?.setDanmakuComposerFocus?.(false);
    if (!held) setPointerInteractive(false);
    return;
  }
  setPointerInteractive(true);
  window.gamebuddyBridge?.setDanmakuComposerFocus?.(true);
  void refreshComposerContext().then(context => {
    if (!composerOpen || !context?.sceneKey) return;
    // 等窗口变成可聚焦后再抢输入焦点，否则中文输入法进不来。
    requestAnimationFrame(() => composerInput?.focus());
  });
}

async function submitSharedDanmaku() {
  if (composerSubmitting) return;
  const text = String(composerInput?.value || '').trim();
  if (!text) {
    setComposerStatus('先写一句弹幕', 'error');
    return;
  }
  composerSubmitting = true;
  if (composerInput) composerInput.disabled = true;
  if (composerSubmit) composerSubmit.disabled = true;
  setComposerStatus('正在发送…');
  try {
    const result = await window.gamebuddyBridge?.submitSharedDanmaku?.(text);
    if (!result?.accepted) {
      const messages = {
        shared_service_not_configured: '共享服务尚未配置',
        daily_limit_reached: '今天的发送次数已用完',
        duplicate_message: '这句话已经留在当前场景'
      };
      setComposerStatus(messages[result?.reason] || result?.reason || '发送失败，请稍后重试', 'error');
      return;
    }
    if (composerInput) composerInput.value = '';
    setComposerStatus('已发送，约 3 秒后显示', 'success');
    setTimeout(() => setComposerOpen(false), 900);
  } catch {
    setComposerStatus('网络不可用，本地弹幕不受影响', 'error');
  } finally {
    composerSubmitting = false;
    if (composerOpen) {
      if (composerInput) composerInput.disabled = false;
      if (composerSubmit) composerSubmit.disabled = false;
    }
  }
}

function offscreen(item) {
  const rect = item.getBoundingClientRect();
  return rect.width > 0 && rect.right <= 0;
}

function startClock() {
  if (ticking) return;
  ticking = true;
  let last = performance.now();
  const step = now => {
    const dt = Math.min(0.05, Math.max(0, now - last) / 1000);
    last = now;
    if (!held) {
      for (const flyer of flyers) flyer.distance += dt * SPEED;
    }
    for (const flyer of [...flyers]) {
      flyer.item.style.transform = `translate3d(${-flyer.distance}px, 0, 0)`;
    }
    for (const flyer of [...flyers]) {
      if (offscreen(flyer.item)) removeFlyer(flyer.item);
    }
    if (flyers.length) requestAnimationFrame(step);
    else ticking = false;
  };
  requestAnimationFrame(step);
}

function createDanmakuItem(message) {
  if (message.source === 'monster_skill') {
    const item = document.createElement('article');
    item.className = 'gb-danmaku gb-danmaku--no-avatar danmaku-skill';
    const label = document.createElement('span');
    label.className = 'danmaku-speaker';
    label.textContent = `技能 · ${message.skillLabel || '怪物当前行动'}`;
    const text = document.createElement('p');
    text.className = 'gb-danmaku__text';
    text.textContent = String(message.text);
    item.append(label, text);
    return item;
  }
  const presentation = window.GameBuddyDanmakuTheme?.presentationFor(message);
  if (presentation?.theme && window.GameBuddyDanmaku?.create) {
    return window.GameBuddyDanmaku.create({
      theme: presentation.theme,
      text: message.text,
      avatar: presentation.avatar,
      animate: false,
      basePath: './assets/danmaku-handoff/assets'
    });
  }
  const item = document.createElement('article');
  item.className = 'gb-danmaku gb-danmaku--no-avatar gb-danmaku--unknown';
  const text = document.createElement('p');
  text.className = 'gb-danmaku__text';
  text.textContent = String(message.text);
  item.append(text);
  return item;
}

function showDanmaku(message) {
  if (!layer || !message?.text) return;
  if (message.id && displayedMessageIds.has(message.id)) return;
  const item = createDanmakuItem(message);
  item.dataset.source = message.source || 'other';
  if (message.source === 'ai') {
    const label = document.createElement('span');
    label.className = 'danmaku-speaker danmaku-speaker--character';
    label.textContent = message.speaker || ({ ironclad: '铁甲战士', silent: '静默猎手', defect: '故障机器人', regent: '储君', necrobinder: '亡灵契约师' }[message.character] || '观战者');
    item.append(label);
  }
  item.classList.add('danmaku-item');
  if (message.style === 'tense') item.classList.add('tense');
  const lane = Math.max(0, Math.min(2, Number(message.lane) || 0));
  item.style.setProperty('--danmaku-lane', String(lane));
  item.dataset.danmakuLane = String(lane);
  const isAi = message.source === 'ai' || message.wordingSource?.source === 'ai' || message.detail?.source === 'ai';
  const hoverDetail = isAi ? { title: message.text } : message.detail;
  if (hoverDetail?.title || hoverDetail?.lines?.length) {
    const detail = document.createElement('span');
    detail.className = 'danmaku-detail';
    const title = document.createElement('strong');
    title.textContent = String(hoverDetail.title || message.text);
    detail.append(title);
    for (const line of hoverDetail.lines || []) {
      const row = document.createElement('span');
      row.textContent = String(line);
      detail.append(row);
    }
    const source = hoverDetail.source;
    const hasSourceLine = (hoverDetail.lines || []).some(line => String(line).startsWith('来源：'));
    if (source && !hasSourceLine) {
      const row = document.createElement('span');
      row.textContent = `来源：${source === 'mod' ? 'Mod 当前行动数据' : source === 'codex' ? 'Spire Codex' : source === 'recommendation' ? 'Agent 建议' : source === 'shared' ? '其他玩家共享' : source === 'ai' ? 'AI 生成' : '内置固定模板'}`;
      detail.append(row);
    }
    item.append(detail);
  }
  layer.append(item);
  if (message.id) {
    displayedMessageIds.add(message.id);
    while (displayedMessageIds.size > 4096) displayedMessageIds.delete(displayedMessageIds.values().next().value);
    window.gamebuddyBridge?.acknowledgeDanmakuPresented?.(message.id);
  }
  const width = item.getBoundingClientRect().width || 160;
  const pad = 36;
  const limit = Math.max(0, (window.innerWidth || 1280) - width - 24);
  let distance = 0;
  for (let guard = 0; guard < flyers.length + 1; guard += 1) {
    const blocker = flyers.find(other => {
      const otherWidth = other.width || 160;
      return distance < other.distance + otherWidth + pad && distance + width + pad > other.distance;
    });
    if (!blocker) break;
    distance = blocker.distance + (blocker.width || 160) + pad;
  }
  if (distance > limit) distance = limit;
  item.style.transform = `translate3d(${-distance}px, 0, 0)`;
  flyers.push({ item, distance, width });
  if (!usesCursorProbe) {
    item.addEventListener('pointerenter', () => pauseAll(item));
    item.addEventListener('pointerleave', resumeAll);
  }
  startClock();
}

composerToggle?.addEventListener('click', () => setComposerOpen(!composerOpen));
composerClose?.addEventListener('click', () => setComposerOpen(false));
composerSubmit?.addEventListener('click', () => { void submitSharedDanmaku(); });
composerInput?.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    setComposerOpen(false);
    return;
  }
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault();
    void submitSharedDanmaku();
  }
});

// 窗口默认完全鼠标穿透。Electron 的 forward 模式仍会把移动事件交给页面，
// 因此只在弹幕、右侧按钮或编辑器附近临时接管输入。
function syncPointerTarget(element) {
  const target = element?.closest?.('.danmaku-item') || null;
  const composing = Boolean(element?.closest?.('.shared-composer'));
  if (target) pauseAll(target);
  else if (held) resumeAll();
  if (composerOpen || target || composing) setPointerInteractive(true);
  else if (!held) setPointerInteractive(false);
}

document.addEventListener('mousemove', event => {
  if (usesCursorProbe) return;
  syncPointerTarget(event.target instanceof Element ? event.target : null);
});

window.gamebuddyBridge?.onDanmakuCursorProbe?.(point => {
  const x = Number(point?.x);
  const y = Number(point?.y);
  const element = Number.isFinite(x) && Number.isFinite(y) ? document.elementFromPoint(x, y) : null;
  syncPointerTarget(element);
});

window.gamebuddyBridge?.onDanmaku(showDanmaku);
window.gamebuddyBridge?.onDanmakuClear(clearDanmaku);
