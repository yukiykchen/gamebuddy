const stage = document.querySelector('#pet-stage');
const speech = document.querySelector('#speech');
const statusDot = document.querySelector('.status-dot');
const statusLabel = document.querySelector('#pet-status-label');
const slLabel = document.querySelector('#pet-sl');
const guidePanel = document.querySelector('#encounter-guide');
const guideKicker = document.querySelector('#guide-kicker');
const guideTitle = document.querySelector('#guide-title');
const guideContent = document.querySelector('#guide-content');
const guideSource = document.querySelector('#guide-source');
const cardPanel = document.querySelector('#card-recommendation');
const cardKicker = document.querySelector('#card-kicker');
const cardTitle = document.querySelector('#card-title');
const cardReason = document.querySelector('#card-reason');
const cardPoints = document.querySelector('#card-points');
const cardMeta = document.querySelector('#card-meta');

const ADVICE_TASKS = new Set(['card_reward', 'rest_site', 'map_route', 'event_choice']);
const POSES = new Set(['waiting', 'watching', 'thinking', 'advising']);
const POSE_LABELS = { waiting: '等待', watching: '旁观', thinking: '思考', advising: '建议' };
const POSE_TOUR = ['waiting', 'watching', 'thinking', 'advising'];
const POSE_TOUR_LINES = {
  waiting: '姿态演示：等开局',
  watching: '姿态演示：侧身旁观',
  thinking: '姿态演示：正在分析',
  advising: '姿态演示：伸爪给建议'
};

const petState = {
  live: false,
  thinking: false,
  cardVisible: false,
  guideVisible: false,
  recommendation: null,
  cardRecommendation: null,
  thisRunSl: null
};
let connectionLabel = '等待游戏';
let tourPose = null;
let tourTimer = 0;
let tourStarted = false;
let pendingSlSpeech = null;

function canSpeakSl() {
  return !tourPose && !petState.thinking && !hasAdvice();
}

function flushPendingSlSpeech() {
  if (!pendingSlSpeech || !canSpeakSl()) return;
  say(pendingSlSpeech);
  pendingSlSpeech = null;
}

function setSlStats(stats) {
  applyThisRunSl(stats?.thisRun);
  if (!stats?.incremented || !stats.speech) return;
  if (!canSpeakSl()) {
    pendingSlSpeech = stats.speech;
    return;
  }
  say(stats.speech);
}

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

function hasAdvice() {
  if (petState.cardVisible || petState.guideVisible) return true;
  return ADVICE_TASKS.has(petState.recommendation?.task);
}

function currentPose() {
  if (tourPose) return tourPose;
  if (hasAdvice()) return 'advising';
  if (petState.thinking) return 'thinking';
  if (!petState.live) return 'waiting';
  return 'watching';
}

function advanceReplayTour() {
  tourPose = POSE_TOUR[POSE_TOUR.indexOf(tourPose) + 1] || POSE_TOUR[0];
  applyPose();
  say(POSE_TOUR_LINES[tourPose], true);
  window.clearTimeout(tourTimer);
  tourTimer = window.setTimeout(advanceReplayTour, 3200);
}

function startReplayPoseTour() {
  if (tourStarted) return;
  tourStarted = true;
  tourPose = POSE_TOUR[POSE_TOUR.length - 1];
  advanceReplayTour();
}

function cardSourceLabel(recommendation, confidence, version) {
  const source = recommendation.source === 'llm' ? 'LLM 复核' : '规则评分';
  return `${source} · 置信度 ${confidence}%${version ? ` · ${version}` : ''}`;
}

function refreshCardMeta() {
  const recommendation = petState.cardRecommendation;
  if (!recommendation || !petState.cardVisible) return;
  const confidence = Math.round((Number(recommendation.confidence) || 0) * 100);
  const version = recommendation.primary?.analysis?.stats?.knowledgeVersion
    || recommendation.strategy?.gameVersion;
  cardMeta.textContent = cardSourceLabel(recommendation, confidence, version);
}

function applyThisRunSl(count) {
  if (!Number.isInteger(count)) return;
  petState.thisRunSl = count;
  slLabel.hidden = false;
  slLabel.textContent = `SL ${count}`;
}

function applyPose() {
  const pose = currentPose();
  if (!POSES.has(pose)) return;
  stage.dataset.pose = pose;
  statusLabel.textContent = `${connectionLabel} · ${POSE_LABELS[pose]}`;
  refreshCardMeta();
}

function say(message, fromTour = false) {
  if (tourPose && !fromTour) return;
  speech.textContent = message;
  speech.classList.add('visible');
}

function restAdvicePoints(recommendation) {
  const primary = recommendation.primary || {};
  if (primary.action === 'HEAL') {
    const alt = (recommendation.alternatives || []).find(item => item.action === 'SMITH');
    return `${cardPointList('为什么回血', [
      `当前生命 ${primary.healTo ? `可回到 ${primary.healTo}` : '缺口较大'}`,
      primary.healAmount ? `这次大约回复 ${primary.healAmount}` : '优先保证活过接下来的高压战斗'
    ].filter(Boolean), 'positive')}${alt ? cardPointList('备选', [`也可以升级「${alt.cardName}」`], 'neutral') : ''}`;
  }
  const analysis = primary.upgradeAnalysis || {};
  const reasons = analysis.reasons?.length ? analysis.reasons.slice(0, 3) : [analysis.summary || '升级收益高于这次回血'].filter(Boolean);
  const altHeal = (recommendation.alternatives || []).find(item => item.action === 'HEAL');
  return `${cardPointList('为什么升级', reasons, 'positive')}${altHeal ? cardPointList('需要留意', [altHeal.label || '生命偏低时仍可考虑回血'], 'negative') : ''}`;
}

function setCardRecommendation(recommendation) {
  if (!recommendation) {
    cardPanel.classList.remove('visible');
    cardReason.textContent = '';
    cardPoints.innerHTML = '';
    petState.cardVisible = false;
    petState.cardRecommendation = null;
    applyPose();
    flushPendingSlSpeech();
    return;
  }
  const primary = recommendation.primary || {};
  if (recommendation.task === 'rest_site') {
    cardKicker.textContent = '休息处建议';
    cardTitle.textContent = primary.action === 'HEAL'
      ? (primary.label || '建议回血')
      : (primary.label || `升级「${primary.cardName || '这张牌'}」`);
    cardReason.textContent = recommendation.reason || '当前局面下，这是休息处更稳妥的选择。';
    cardPoints.innerHTML = restAdvicePoints(recommendation);
    const confidence = Math.round((Number(recommendation.confidence) || 0) * 100);
    const version = recommendation.strategy?.gameVersion;
    cardMeta.textContent = cardSourceLabel(recommendation, confidence, version);
    cardPanel.classList.add('visible');
    petState.cardVisible = true;
    petState.cardRecommendation = recommendation;
    applyPose();
    say(primary.action === 'HEAL' ? '建议回血' : `建议升级${primary.cardName || ''}`);
    return;
  }
  if (recommendation.task === 'event_choice') {
    const alts = (recommendation.alternatives || []).slice(0, 2).map(item => item.label).filter(Boolean);
    cardKicker.textContent = recommendation.eventKind === 'ancient' ? '开局祝福建议' : '事件建议';
    cardTitle.textContent = `建议选择「${primary.label || '这个选项'}」`;
    cardReason.textContent = recommendation.reason || '当前局面下，这是更稳妥的选项。';
    cardPoints.innerHTML = `${cardPointList('为什么选它', [
      primary.description || recommendation.reason || '结合当前牌组和生命，这项更划算'
    ].filter(Boolean), 'positive')}${alts.length ? cardPointList('其他选项', alts, 'neutral') : ''}`;
    const confidence = Math.round((Number(recommendation.confidence) || 0) * 100);
    cardMeta.textContent = cardSourceLabel(recommendation, confidence);
    cardPanel.classList.add('visible');
    petState.cardVisible = true;
    petState.cardRecommendation = recommendation;
    applyPose();
    say(`建议选择「${primary.label}」`);
    return;
  }
  cardKicker.textContent = '卡牌奖励建议';
  cardTitle.textContent = primary.action === 'SKIP'
    ? '建议跳过这次奖励'
    : `推荐「${primary.cardName || primary.label || '这张牌'}」`;
  cardReason.textContent = recommendation.reason || '当前局面下，这是规则评分最高的选择。';
  const analysis = primary.analysis;
  cardPoints.innerHTML = analysis
    ? `${cardPointList('为什么适合', analysis.pros?.slice(0, 3), 'positive')}${cardPointList('需要留意', analysis.cons?.slice(0, 2), 'negative')}`
    : cardPointList('为什么跳过', ['保持牌组精简，提高核心牌的抽取稳定性'], 'neutral');
  const confidence = Math.round((Number(recommendation.confidence) || 0) * 100);
  const version = analysis?.stats?.knowledgeVersion;
  cardMeta.textContent = cardSourceLabel(recommendation, confidence, version);
  cardPanel.classList.add('visible');
  petState.cardVisible = true;
  petState.cardRecommendation = recommendation;
  applyPose();
  say(primary.action === 'SKIP' ? '这次建议跳过' : `建议拿 ${primary.cardName || primary.label}`);
}

function setAgentThinking(state) {
  petState.thinking = Boolean(state?.thinking);
  applyPose();
  if (!petState.thinking) flushPendingSlSpeech();
  if (!petState.thinking || hasAdvice()) return;
  const task = state.tasks?.[0];
  const labels = {
    card_reward: '正在比较三张奖励牌',
    map_route: '正在推演后续路线',
    rest_site: '正在权衡回血和升级',
    event_choice: '正在分析事件选项'
  };
  say(labels[task] || '正在结合这局思考');
}

function setEncounterGuide(guide) {
  if (!guide) {
    guidePanel.classList.remove('visible');
    guideContent.innerHTML = '';
    petState.guideVisible = false;
    applyPose();
    flushPendingSlSpeech();
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
  petState.guideVisible = true;
  applyPose();
  say(`${guide.kind === 'boss' ? 'Boss' : '精英'}攻略来了`);
}

function setStatus(status) {
  const replay = status.status === 'live' && status.mode === 'replay';
  petState.live = status.status === 'live';
  statusDot.classList.remove('live', 'alert');
  if (replay) {
    connectionLabel = '回放 DEMO';
    statusDot.classList.add('live');
    startReplayPoseTour();
  } else if (status.status === 'live') {
    statusDot.classList.add('live');
    connectionLabel = '游戏 LIVE';
  } else if (status.status === 'invalid' || status.status === 'stale') {
    statusDot.classList.add('alert');
    connectionLabel = status.status === 'stale' ? '数据停滞' : '数据异常';
    say(status.status === 'stale' ? '游戏状态停住了' : '数据格式需要检查');
  } else {
    connectionLabel = status.status === 'connected' ? '等待游戏' : status.status === 'demo' ? '回放数据' : '等待游戏';
    if (status.status === 'connecting') say('正在找游戏');
  }
  applyPose();
}

function setState(next) {
  if (petState.thinking || hasAdvice()) return;
  const enemy = next.combat?.enemies?.[0];
  const intent = String(enemy?.intent || '').toLowerCase();
  if (intent.includes('attack')) {
    say('小心，敌人显示攻击意图');
  } else if (/rest|camp/i.test(String(next.run?.room || '')) || /rest/i.test(String(next.run?.currentNode || ''))) {
    say('休息处，想想回血还是升级');
  } else if (next.run?.room === 'map') {
    say('地图已打开');
  } else {
    say('我在看着这局');
  }
}

function setRecommendation(recommendation) {
  petState.recommendation = recommendation && ADVICE_TASKS.has(recommendation.task) ? recommendation : null;
  applyPose();
  if (!recommendation) {
    if (petState.live && !petState.thinking && !hasAdvice()) say('我在看着这局');
    flushPendingSlSpeech();
    return;
  }
  if (recommendation.task === 'card_reward' && recommendation.primary?.label) {
    return;
  }
  if (recommendation.task === 'rest_site' && recommendation.primary?.label) {
    return;
  }
  if (recommendation.task === 'event_choice' && recommendation.primary?.label) {
    return;
  }
  if (recommendation.task !== 'map_route' || !recommendation.primary?.label) return;
  if (recommendation.tie?.isTie) {
    say(`${recommendation.tie.label}，任选其一`);
    return;
  }
  say(`下一步建议走${recommendation.primary.displayLabel || recommendation.primary.label}`);
}

applyPose();

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
window.gamebuddyBridge?.onObservation(observation => applyThisRunSl(observation?.slStats?.thisRun));
window.gamebuddyBridge?.onRecommendation(setRecommendation);
window.gamebuddyBridge?.onEncounterGuide(setEncounterGuide);
window.gamebuddyBridge?.onCardRecommendation(setCardRecommendation);
window.gamebuddyBridge?.onAgentThinking(setAgentThinking);
window.gamebuddyBridge?.onSlStats(setSlStats);
