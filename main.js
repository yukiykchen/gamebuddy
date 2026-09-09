const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen } = require('electron');
const path = require('node:path');
const WebSocket = require('ws');
const { createObservationStore } = require('./harness/observation-store');
const { createOrchestrator } = require('./agent/orchestrator');
const { createOpenAiClient, readLlmConfig } = require('./agent/llm/openai');
const { ensureMapRoutes } = require('./agent/tasks/route');
const { encounterGuideSignature, buildEncounterGuide } = require('./agent/tasks/encounter-guide');

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
const llmConfig = readLlmConfig();
if (llmConfig.enabled) {
  console.log(`GameBuddy LLM: ${llmConfig.model} · ${llmConfig.wireApi} · ${llmConfig.source}${llmConfig.providerName ? `/${llmConfig.providerName}` : ''}`);
} else {
  console.log('GameBuddy LLM: rules only');
}
const orchestrator = createOrchestrator({
  llm: createOpenAiClient(llmConfig, { onThinkingChange: updateAgentThinking }),
  onRecommendation: publishRecommendation
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

function broadcast(channel, payload) {
  for (const window of [mainWindow, petWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
  }
}

function broadcastBridgeStatus(status, detail = '') {
  lastBridgeStatus = { status, detail, url: BRIDGE_URL, mode: BRIDGE_MODE };
  broadcast('bridge-status', lastBridgeStatus);
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

function publishRecommendation(recommendation) {
  broadcast('bridge-recommendation', recommendation);
  if (recommendation?.task === 'card_reward') {
    activeCardRecommendation = recommendation;
    syncPetWindowSize();
    keepPetVisible();
    petWindow?.webContents.send('bridge-card-recommendation', recommendation);
  } else if (activeCardRecommendation) {
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
        broadcastBridgeStatus('invalid', result.reason);
        return;
      }
      if (result.kind === 'state') {
        broadcastBridgeStatus('live');
        if (result.accepted) {
          broadcast('bridge-state', withRoutableState(result.state));
          void considerEncounterGuide(result.state);
        }
      }
      if (result.kind === 'event' && result.accepted) {
        broadcast('bridge-event', result.event);
        if (result.event?.name === 'combat.ended') clearEncounterGuide();
        if (result.event?.name === 'combat.started') clearCardRecommendation();
      }
      if (result.accepted || (result.kind === 'duplicate' && !orchestrator.getRecommendation())) {
        const observation = observationStore.getObservation();
        if (result.accepted) broadcast('bridge-observation', observation);
        void considerObservation(observation, {
          force: result.kind === 'duplicate'
            || (result.kind === 'event' && (result.event?.name === 'map.opened' || result.event?.name === 'rest.opened' || result.event?.name === 'card.reward.opened'))
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
    broadcastBridgeStatus('waiting', '等待本地 Mod Bridge');
    clearTimeout(bridgeReconnectTimer);
    bridgeReconnectTimer = setTimeout(connectBridge, 2500);
  };
  socket.on('error', disconnect);
  socket.on('close', disconnect);
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
    const state = observationStore.getState();
    if (state) mainWindow.webContents.send('bridge-state', withRoutableState(state));
    mainWindow.webContents.send('bridge-observation', observationStore.getObservation());
    const recommendation = orchestrator.getRecommendation();
    if (recommendation) mainWindow.webContents.send('bridge-recommendation', recommendation);
    else void considerObservation(observationStore.getObservation(), { force: true });
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
    const state = observationStore.getState();
    if (state) petWindow.webContents.send('bridge-state', withRoutableState(state));
    petWindow.webContents.send('bridge-observation', observationStore.getObservation());
    const recommendation = orchestrator.getRecommendation();
    if (recommendation) petWindow.webContents.send('bridge-recommendation', recommendation);
    petWindow.webContents.send('bridge-agent-thinking', lastAgentThinking);
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
ipcMain.handle('get-observation', () => observationStore.getObservation());
ipcMain.handle('refresh-recommendation', async () => {
  if (bridgeSocket?.readyState === WebSocket.OPEN) {
    bridgeSocket.send(JSON.stringify({ type: 'request_snapshot' }));
  }
  const observation = observationStore.getObservation();
  if (observation?.state) broadcast('bridge-state', withRoutableState(observation.state));
  const recommendation = await considerObservation(observation, { force: true });
  if (recommendation) broadcast('bridge-recommendation', recommendation);
  return { ok: Boolean(recommendation), recommendation };
});

app.whenReady().then(() => {
  createMainWindow();
  createPetWindow();
  createTray();
  connectBridge();
  petTopmostTimer = setInterval(keepPetVisible, 1000);
  bridgeHealthTimer = setInterval(() => {
    if (lastBridgeStatus.status === 'live' && !observationStore.getObservation().fresh) {
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
