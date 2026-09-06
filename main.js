const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen } = require('electron');
const path = require('node:path');
const WebSocket = require('ws');
const { createObservationStore } = require('./harness/observation-store');
const { decide } = require('./agent/router');
const { recordDecision } = require('./agent/recorder');
const fs = require('node:fs');

const BRIDGE_URL = process.env.RUNMATE_BRIDGE_URL || 'ws://127.0.0.1:27182';
let mainWindow;
let petWindow;
let tray;
let bridgeSocket;
let bridgeReconnectTimer;
let isQuitting = false;
const observationStore = createObservationStore({ staleAfterMs: 5000 });
let bridgeHealthTimer;
let lastBridgeStatus = { status: 'demo', detail: '等待本地 Mod Bridge', url: BRIDGE_URL };
let agentRunId = null;

function currentObservation(now = Date.now()) {
  const observation = observationStore.getObservation(now);
  return { ...observation, decision: decide(observation) };
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
  lastBridgeStatus = { status, detail, url: BRIDGE_URL };
  broadcast('bridge-status', lastBridgeStatus);
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
        return;
      }
      if (result.kind === 'state') {
        broadcastBridgeStatus('live');
        if (result.accepted) {
          if (!agentRunId) startAgentRun();
          const observation = currentObservation();
          recordDecision({ runId: agentRunId, observation, decision: observation.decision });
          broadcast('bridge-state', result.state);
          sendHighlightRoute(observation.decision);
        }
      }
      if (result.kind === 'event' && result.accepted) broadcast('bridge-event', result.event);
      if (result.accepted) broadcast('bridge-observation', currentObservation());
    } catch (error) {
      broadcastBridgeStatus('invalid', error.message);
    }
  });

  const disconnect = () => {
    if (disconnected) return;
    disconnected = true;
    if (bridgeSocket === socket) bridgeSocket = null;
    broadcastBridgeStatus('demo', '等待本地 Mod Bridge');
    clearTimeout(bridgeReconnectTimer);
    bridgeReconnectTimer = setTimeout(connectBridge, 2500);
  };
  socket.on('error', disconnect);
  socket.on('close', disconnect);
}

function sendHighlightRoute(decision) {
  if (!bridgeSocket || bridgeSocket.readyState !== WebSocket.OPEN) return;
  if (decision?.agent !== 'route' || decision?.status !== 'ready') return;
  const coords = decision.payload?.routeCoords;
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
    title: 'Runmate · 杀戮尖塔 2 AI 搭子',
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
    if (state) mainWindow.webContents.send('bridge-state', state);
    mainWindow.webContents.send('bridge-observation', observation);
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
    maxWidth: 214,
    maxHeight: 242,
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
  petWindow.setAlwaysOnTop(true, 'floating');
  petWindow.loadFile(path.join(__dirname, 'src', 'pet.html'));
  petWindow.webContents.on('did-finish-load', () => {
    petWindow.webContents.send('bridge-status', lastBridgeStatus);
    const observation = currentObservation();
    const state = observation.state;
    if (state) petWindow.webContents.send('bridge-state', state);
    petWindow.webContents.send('bridge-observation', observation);
  });
  petWindow.once('ready-to-show', () => petWindow.showInactive());
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('Runmate · 杀戮尖塔 2 AI 搭子');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 Runmate', click: () => mainWindow?.show() },
    { label: '显示 / 隐藏桌面宠物', click: () => petWindow?.isVisible() ? petWindow.hide() : petWindow?.showInactive() },
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

ipcMain.on('open-main-window', () => mainWindow?.show());
ipcMain.on('toggle-pet', () => petWindow?.isVisible() ? petWindow.hide() : petWindow?.showInactive());
ipcMain.on('pet-pass-through', (_event, enabled) => petWindow?.setIgnoreMouseEvents(Boolean(enabled), { forward: true }));
ipcMain.on('accept-decision', (_event, decision) => {
  if (agentRunId && decision) recordDecision({ runId: agentRunId, observation: currentObservation(), decision, accepted: true });
});
ipcMain.handle('get-observation', () => currentObservation());

app.whenReady().then(() => {
  createMainWindow();
  createPetWindow();
  createTray();
  connectBridge();
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

app.on('before-quit', () => { isQuitting = true; clearTimeout(bridgeReconnectTimer); clearInterval(bridgeHealthTimer); bridgeSocket?.close(); });
app.on('window-all-closed', () => {
  if (isQuitting && process.platform !== 'darwin') app.quit();
});
