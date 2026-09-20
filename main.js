const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen } = require('electron');
const path = require('node:path');
const WebSocket = require('ws');
const { createObservationStore } = require('./harness/observation-store');
const { createOrchestrator } = require('./agent/orchestrator');
const { createOpenAiClient, readLlmConfig } = require('./agent/llm/openai');
const { ensureMapRoutes, routeChoiceCount } = require('./agent/tasks/route');
const { decide } = require('./agent/router');
const { recordDecision } = require('./agent/recorder');
const { encounterGuideSignature, buildEncounterGuide } = require('./agent/tasks/encounter-guide');
const { createSlTracker } = require('./harness/sl-stats');
const fs = require('node:fs');

const BRIDGE_URL = process.env.GAMEBUDDY_BRIDGE_URL || 'ws://127.0.0.1:27182';
const BRIDGE_MODE = process.env.GAMEBUDDY_BRIDGE_MODE === 'replay' ? 'replay' : 'game';
let mainWindow;
let petWindow;
let tray;
let bridgeSocket;
let bridgeReconnectTimer;
let isQuitting = false;
let petHiddenByUser = false;
let petTopmostTimer;
let petDragState;
let encounterGuideKey = '';
let dismissedEncounterGuideKey = '';
let activeEncounterGuide = null;
let activeCardRecommendation = null;
const activeLlmRequests = new Map();
let lastAgentThinking = { thinking: false, tasks: [], model: null };
const observationStore = createObservationStore({ staleAfterMs: 5000 });
let slTracker = createSlTracker();
let lastSlStats = slTracker.snapshot();
const llmConfig = readLlmConfig();
if (llmConfig.enabled) {
  const thinkingLabel = llmConfig.thinking === 'disabled' ? ' · thinking off' : llmConfig.thinking === 'enabled' ? ' · thinking on' : '';
  console.log(`GameBuddy LLM: ${llmConfig.model} · ${llmConfig.wireApi} · ${llmConfig.source}${llmConfig.providerName ? `/${llmConfig.providerName}` : ''}${thinkingLabel}`);
} else {
  console.log('GameBuddy LLM: rules only');
}
const orchestrator = createOrchestrator({
  llm: createOpenAiClient(llmConfig, { onThinkingChange: updateAgentThinking, onLog: publishLlmLog }),
  onRecommendation: publishRecommendation,
  onAgentStatus: status => broadcast('agent-status', status)
});

function withRoutableState(state) {
  if (!state?.map) return state;
  const map = ensureMapRoutes(state.map);
  if (map === state.map) return state;
  return { ...state, map };
}

function observationForAgent(observation) {
  if (!observation?.state) return observation;
  return { ...observation, state: withRoutableState(observation.state) };
}

function considerObservation(observation, options) {
  return orchestrator.consider(observationForAgent(observation), options);
}
let bridgeHealthTimer;
let lastBridgeStatus = { status: 'waiting', detail: '等待本地 Mod Bridge', url: BRIDGE_URL, mode: BRIDGE_MODE };
let agentRunId = null;

function currentObservation(now = Date.now()) {
  const observation = observationStore.getObservation(now);
  return { ...observation, decision: decide(observation), slStats: lastSlStats };
}

function startAgentRun() {
  const state = observationStore.getState();
  agentRunId = String(state?.run?.seed || state?.run?.id || new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14));
  fs.mkdirSync(path.join(__dirname, 'runs', agentRunId), { recursive: true });
}

function broadcast(channel, payload) {
  for (const window of [mainWindow, petWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
  }
}

function broadcastBridgeStatus(status, detail = '') {
  lastBridgeStatus = { status, detail, url: BRIDGE_URL, mode: BRIDGE_MODE };
  broadcast('bridge-status', lastBridgeStatus);
}

function publishSlStats(stats) {
  lastSlStats = stats;
  broadcast('bridge-sl-stats', stats);
}

const MAX_LLM_LOG_ENTRIES = 80;
let llmLogEntries = [];

function publishLlmLog(entry) {
  llmLogEntries = [...llmLogEntries, entry].slice(-MAX_LLM_LOG_ENTRIES);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('bridge-llm-log', { entries: llmLogEntries });
  }
}

function clearLlmLog() {
  llmLogEntries = [];
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('bridge-llm-log', { entries: [] });
  }
}

function noteLiveRun(hasLiveRun, state) {
  publishSlStats(slTracker.observe({ hasLiveRun, state }));
}

function updateAgentThinking(thinking, detail = {}) {
  const requestId = detail.requestId || detail.task || 'llm';
  if (thinking) activeLlmRequests.set(requestId, detail);
  else activeLlmRequests.delete(requestId);
  const requests = [...activeLlmRequests.values()];
  lastAgentThinking = {
    thinking: requests.length > 0,
    tasks: [...new Set(requests.map(request => request.task).filter(Boolean))],
    model: detail.model || llmConfig.model || null
  };
  broadcast('bridge-agent-thinking', lastAgentThinking);
}

function clearAgentThinking(task) {
  for (const [requestId, request] of activeLlmRequests) {
    if (!task || request.task === task) activeLlmRequests.delete(requestId);
  }
  const requests = [...activeLlmRequests.values()];
  lastAgentThinking = {
    thinking: requests.length > 0,
    tasks: [...new Set(requests.map(request => request.task).filter(Boolean))],
    model: requests[0]?.model || null
  };
  broadcast('bridge-agent-thinking', lastAgentThinking);
}

function publishRecommendation(recommendation) {
  broadcast('bridge-recommendation', recommendation);
  if (recommendation?.task === 'card_reward' || recommendation?.task === 'rest_site' || recommendation?.task === 'event_choice' || recommendation?.task === 'map_route') {
    activeCardRecommendation = recommendation;
    syncPetWindowSize();
    keepPetVisible();
    petWindow?.webContents.send('bridge-card-recommendation', recommendation);
    return;
  }
  if (activeCardRecommendation && (!recommendation || recommendation.task !== activeCardRecommendation.task)) {
    clearCardRecommendation();
  }
}

function keepPetVisible() {
  if (petHiddenByUser || !petWindow || petWindow.isDestroyed()) return;
  petWindow.setAlwaysOnTop(true, 'screen-saver');
  petWindow.showInactive();
}

function resizePetWindow(mode = 'compact') {
  if (!petWindow || petWindow.isDestroyed()) return;
  const target = mode === 'guide'
    ? { width: 570, height: 520 }
    : mode === 'card'
      ? { width: 570, height: 340 }
      : { width: 214, height: 242 };
  const bounds = petWindow.getBounds();
  const display = screen.getDisplayMatching(bounds).workArea;
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  const x = Math.max(display.x, Math.min(right - target.width, display.x + display.width - target.width));
  const y = Math.max(display.y, Math.min(bottom - target.height, display.y + display.height - target.height));
  petWindow.setBounds({ x, y, ...target }, false);
}

function syncPetWindowSize() {
  resizePetWindow(activeEncounterGuide ? 'guide' : activeCardRecommendation ? 'card' : 'compact');
}

function dismissCardRecommendation() {
  clearCardRecommendation();
}

function clearCardRecommendation() {
  if (!activeCardRecommendation) return;
  activeCardRecommendation = null;
  petWindow?.webContents.send('bridge-card-recommendation', null);
  syncPetWindowSize();
}

function handleAcceptedEvent(event) {
  if (!event) return;
  broadcast('bridge-event', event);
  if (event.name === 'combat.ended') clearEncounterGuide();
  if (['card.reward.closed', 'map.opened', 'combat.started', 'rest.closed', 'event.closed'].includes(event.name)) {
    clearCardRecommendation();
    clearAgentThinking('card_reward');
    if (event.name === 'rest.closed') clearAgentThinking('rest_site');
    if (event.name === 'event.closed') clearAgentThinking('event_choice');
  }
  if (event.name === 'rest.opened' && activeCardRecommendation?.task === 'card_reward') {
    clearCardRecommendation();
    clearAgentThinking('card_reward');
  }
  if (event.name === 'event.opened' && (activeCardRecommendation?.task === 'card_reward' || activeCardRecommendation?.task === 'rest_site')) {
    clearCardRecommendation();
    clearAgentThinking('card_reward');
    clearAgentThinking('rest_site');
  }
  if (event.name === 'event.opened') {
    clearAgentThinking('map_route');
  }
  if (event.name === 'card.reward.closed' || event.name === 'map.opened' || event.name === 'rest.closed' || event.name === 'event.closed') {
    orchestrator.clearRecommendation();
  }
}

function dismissEncounterGuide() {
  dismissedEncounterGuideKey = encounterGuideKey;
  activeEncounterGuide = null;
  petWindow?.webContents.send('bridge-encounter-guide', null);
  syncPetWindowSize();
}

function clearEncounterGuide() {
  encounterGuideKey = '';
  dismissedEncounterGuideKey = '';
  if (!activeEncounterGuide) return;
  activeEncounterGuide = null;
  petWindow?.webContents.send('bridge-encounter-guide', null);
  syncPetWindowSize();
}

async function considerEncounterGuide(state) {
  const key = encounterGuideSignature(state);
  if (!key) {
    clearEncounterGuide();
    return;
  }
  if (key === encounterGuideKey || key === dismissedEncounterGuideKey) return;
  encounterGuideKey = key;
  const guide = await buildEncounterGuide(state);
  if (encounterGuideKey !== key || dismissedEncounterGuideKey === key || !guide) return;
  activeEncounterGuide = guide;
  syncPetWindowSize();
  keepPetVisible();
  petWindow?.webContents.send('bridge-encounter-guide', guide);
}

function hidePet() {
  petHiddenByUser = true;
  petWindow?.hide();
}

function showPetContextMenu(point) {
  if (!petWindow || petWindow.isDestroyed()) return;
  const menu = Menu.buildFromTemplate([
    { label: '打开 GameBuddy', click: () => { mainWindow?.show(); keepPetVisible(); } },
    { type: 'separator' },
    { label: '关闭桌面宠物', click: hidePet }
  ]);
  menu.popup({
    window: petWindow,
    x: Math.max(0, Math.round(Number(point?.x) || 0)),
    y: Math.max(0, Math.round(Number(point?.y) || 0))
  });
}

function connectBridge() {
  if (bridgeSocket) return;
  broadcastBridgeStatus('connecting');
  const socket = new WebSocket(BRIDGE_URL);
  bridgeSocket = socket;
  let disconnected = false;

  socket.on('open', () => {
    broadcastBridgeStatus('connected');
    socket.send(JSON.stringify({ type: 'request_snapshot' }));
  });

  socket.on('message', raw => {
    try {
      const message = JSON.parse(raw.toString());
      const result = observationStore.ingest(message);
      if (result.kind === 'invalid') {
        console.error('[Runmate DEBUG] invalid state reason:', result.reason);
        console.error('[Runmate DEBUG] raw message:', JSON.stringify(message, null, 2).slice(0, 4000));
        broadcastBridgeStatus('invalid', result.reason);
        noteLiveRun(false);
        return;
      }
      if (result.kind === 'state' || result.kind === 'duplicate') {
        const liveState = withRoutableState(result.state || observationStore.getState());
        if (liveState) {
          broadcastBridgeStatus('live');
          noteLiveRun(true, liveState);
        }
      }
      if (result.kind === 'state') {
        if (result.accepted) {
          if (!agentRunId) startAgentRun();
          const observation = currentObservation();
          const routableState = withRoutableState(observation.state);
          if (!routableState.combat && routeChoiceCount(routableState) <= 1) clearAgentThinking('map_route');
          recordDecision({ runId: agentRunId, observation: { ...observation, state: routableState }, decision: observation.decision });
          broadcast('bridge-state', routableState);
          sendHighlightRoute(observation.decision, routableState);
          void considerEncounterGuide(routableState);
          for (const event of result.derivedEvents || []) handleAcceptedEvent(event);
        }
      }
      if (result.kind === 'event' && result.accepted) {
        handleAcceptedEvent(result.event);
      }
      if (result.accepted || (result.kind === 'duplicate' && !orchestrator.getRecommendation())) {
        const observation = observationStore.getObservation();
        if (result.accepted) broadcast('bridge-observation', observation);
        const agentObservation = observationForAgent(observation);
        const reuseCardReward = result.event?.name === 'card.reward.opened'
          && orchestrator.hasPublishedFor(agentObservation);
        if (reuseCardReward) broadcast('bridge-recommendation', orchestrator.getRecommendation());
        const forceEvents = new Set(['map.opened', 'rest.opened', 'rest.closed', 'event.opened', 'event.closed', 'card.reward.opened']);
        const derivedRestClosed = (result.derivedEvents || []).some(event => event.name === 'rest.closed');
        void considerObservation(observation, {
          force: ((result.kind === 'event' && forceEvents.has(result.event?.name)) || derivedRestClosed)
            && !reuseCardReward
        });
      }
    } catch (error) {
      broadcastBridgeStatus('invalid', error.message);
    }
  });

  const disconnect = () => {
    if (disconnected) return;
    disconnected = true;
    if (bridgeSocket === socket) bridgeSocket = null;
    clearEncounterGuide();
    clearCardRecommendation();
    noteLiveRun(false);
    broadcastBridgeStatus('waiting', '等待本地 Mod Bridge');
    clearTimeout(bridgeReconnectTimer);
    bridgeReconnectTimer = setTimeout(connectBridge, 2500);
  };
  socket.on('error', disconnect);
  socket.on('close', disconnect);
}

function sendHighlightRoute(decision, routableState) {
  if (!bridgeSocket || bridgeSocket.readyState !== WebSocket.OPEN) return;
  if (routeChoiceCount(routableState) <= 1) return;
  let coords = [];
  if (decision?.agent === 'route' && decision?.status === 'ready') {
    coords = Array.isArray(decision.payload?.routeCoords) ? decision.payload.routeCoords : [];
  }
  if (!coords.length && routableState?.map?.routes?.length) {
    coords = routableState.map.routes[0];
  }
  if (!Array.isArray(coords) || !coords.length) return;
  bridgeSocket.send(JSON.stringify({ type: 'highlight_map_nodes', coords }));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 930,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#111315',
    title: 'GameBuddy · 杀戮尖塔 2 AI 搭子',
    frame: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('bridge-status', lastBridgeStatus);
    const observation = currentObservation();
    const state = observation.state;
    if (state) mainWindow.webContents.send('bridge-state', withRoutableState(state));
    mainWindow.webContents.send('bridge-observation', observation);
    const recommendation = orchestrator.getRecommendation();
    if (recommendation) mainWindow.webContents.send('bridge-recommendation', recommendation);
    else void considerObservation(observation, { force: true });
    mainWindow.webContents.send('bridge-sl-stats', lastSlStats);
    mainWindow.webContents.send('bridge-llm-log', { entries: llmLogEntries });
  });
  mainWindow.on('close', event => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createPetWindow() {
  petWindow = new BrowserWindow({
    width: 214,
    height: 242,
    minWidth: 214,
    minHeight: 242,
    maxWidth: 570,
    maxHeight: 520,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#00000000',
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const { workArea } = screen.getPrimaryDisplay();
  petWindow.setPosition(workArea.x + workArea.width - 238, workArea.y + workArea.height - 270);
  petWindow.setMaximumSize(570, 520);
  petWindow.setAlwaysOnTop(true, 'screen-saver');
  petWindow.loadFile(path.join(__dirname, 'src', 'pet.html'));
  petWindow.webContents.on('did-finish-load', () => {
    petWindow.webContents.send('bridge-status', lastBridgeStatus);
    const observation = currentObservation();
    const state = observation.state;
    if (state) petWindow.webContents.send('bridge-state', withRoutableState(state));
    petWindow.webContents.send('bridge-observation', observation);
    const recommendation = orchestrator.getRecommendation();
    if (recommendation) petWindow.webContents.send('bridge-recommendation', recommendation);
    petWindow.webContents.send('bridge-agent-thinking', lastAgentThinking);
    petWindow.webContents.send('bridge-sl-stats', lastSlStats);
    if (activeCardRecommendation) petWindow.webContents.send('bridge-card-recommendation', activeCardRecommendation);
    if (activeEncounterGuide) {
      syncPetWindowSize();
      petWindow.webContents.send('bridge-encounter-guide', activeEncounterGuide);
    }
  });
  petWindow.once('ready-to-show', () => petWindow.showInactive());
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('GameBuddy · 杀戮尖塔 2 AI 搭子');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 GameBuddy', click: () => mainWindow?.show() },
    { label: '显示 / 隐藏桌面宠物', click: () => {
      petHiddenByUser = petWindow?.isVisible() === true;
      if (petHiddenByUser) hidePet();
      else { petHiddenByUser = false; keepPetVisible(); }
    } },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } }
  ]));
  tray.on('click', () => mainWindow?.isVisible() ? mainWindow.hide() : mainWindow?.show());
}

ipcMain.on('window-minimize', event => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.on('window-close', event => {
  BrowserWindow.fromWebContents(event.sender)?.hide();
});

ipcMain.on('open-main-window', () => {
  mainWindow?.show();
  keepPetVisible();
});
ipcMain.on('toggle-pet', () => {
  petHiddenByUser = petWindow?.isVisible() === true;
  if (petHiddenByUser) hidePet();
  else { petHiddenByUser = false; keepPetVisible(); }
});
ipcMain.on('pet-pass-through', (_event, enabled) => petWindow?.setIgnoreMouseEvents(Boolean(enabled), { forward: true }));
ipcMain.on('pet-context-menu', (_event, point) => showPetContextMenu(point));
ipcMain.on('pet-drag-start', (_event, point) => {
  if (!petWindow || petWindow.isDestroyed() || !point) return;
  const [x, y] = petWindow.getPosition();
  petDragState = { startX: Number(point.x), startY: Number(point.y), windowX: x, windowY: y };
});
ipcMain.on('pet-drag-move', (_event, point) => {
  if (!petDragState || !petWindow || petWindow.isDestroyed() || !point) return;
  const x = petDragState.windowX + Number(point.x) - petDragState.startX;
  const y = petDragState.windowY + Number(point.y) - petDragState.startY;
  petWindow.setPosition(Math.round(x), Math.round(y), false);
});
ipcMain.on('pet-drag-end', () => { petDragState = undefined; });
ipcMain.on('dismiss-encounter-guide', dismissEncounterGuide);
ipcMain.on('dismiss-card-recommendation', dismissCardRecommendation);
ipcMain.on('accept-decision', (_event, decision) => {
  if (agentRunId && decision) recordDecision({ runId: agentRunId, observation: currentObservation(), decision, accepted: true });
});
ipcMain.on('clear-llm-log', () => clearLlmLog());
ipcMain.handle('get-observation', () => currentObservation());
ipcMain.handle('refresh-recommendation', async () => {
  if (bridgeSocket?.readyState === WebSocket.OPEN) {
    bridgeSocket.send(JSON.stringify({ type: 'request_snapshot' }));
  }
  const observation = currentObservation();
  if (observation?.state) broadcast('bridge-state', withRoutableState(observation.state));
  const recommendation = await considerObservation(observation, { force: true, reason: 'refresh' });
  if (recommendation) broadcast('bridge-recommendation', recommendation);
  return { ok: Boolean(recommendation), recommendation };
});

app.whenReady().then(() => {
  slTracker = createSlTracker({
    persistPath: BRIDGE_MODE === 'replay' ? null : path.join(app.getPath('userData'), 'sl-stats.json')
  });
  lastSlStats = slTracker.snapshot();
  createMainWindow();
  createPetWindow();
  createTray();
  connectBridge();
  petTopmostTimer = setInterval(keepPetVisible, 1000);
  bridgeHealthTimer = setInterval(() => {
    if (lastBridgeStatus.status === 'live' && !observationStore.getObservation().fresh) {
      noteLiveRun(false);
      broadcastBridgeStatus('stale', '已连接，但超过 5 秒没有新的游戏状态');
    }
  }, 1000);
  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
    mainWindow.show();
  });
});

app.on('before-quit', () => { isQuitting = true; clearTimeout(bridgeReconnectTimer); clearInterval(bridgeHealthTimer); clearInterval(petTopmostTimer); bridgeSocket?.close(); });
app.on('window-all-closed', () => {
  if (isQuitting && process.platform !== 'darwin') app.quit();
});
