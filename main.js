const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen } = require('electron');
const path = require('node:path');
const WebSocket = require('ws');
const { createObservationStore } = require('./harness/observation-store');

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
const observationStore = createObservationStore({ staleAfterMs: 5000 });
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

function keepPetVisible() {
  if (petHiddenByUser || !petWindow || petWindow.isDestroyed()) return;
  petWindow.setAlwaysOnTop(true, 'screen-saver');
  petWindow.showInactive();
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
        if (result.accepted) broadcast('bridge-state', result.state);
      }
      if (result.kind === 'event' && result.accepted) broadcast('bridge-event', result.event);
      if (result.accepted) broadcast('bridge-observation', observationStore.getObservation());
    } catch (error) {
      broadcastBridgeStatus('invalid', error.message);
    }
  });

  const disconnect = () => {
    if (disconnected) return;
    disconnected = true;
    if (bridgeSocket === socket) bridgeSocket = null;
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
    if (state) mainWindow.webContents.send('bridge-state', state);
    mainWindow.webContents.send('bridge-observation', observationStore.getObservation());
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
  petWindow.setAlwaysOnTop(true, 'screen-saver');
  petWindow.loadFile(path.join(__dirname, 'src', 'pet.html'));
  petWindow.webContents.on('did-finish-load', () => {
    petWindow.webContents.send('bridge-status', lastBridgeStatus);
    const state = observationStore.getState();
    if (state) petWindow.webContents.send('bridge-state', state);
    petWindow.webContents.send('bridge-observation', observationStore.getObservation());
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
      if (petHiddenByUser) petWindow.hide();
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
  if (petHiddenByUser) petWindow.hide();
  else { petHiddenByUser = false; keepPetVisible(); }
});
ipcMain.on('pet-pass-through', (_event, enabled) => petWindow?.setIgnoreMouseEvents(Boolean(enabled), { forward: true }));
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
ipcMain.handle('get-observation', () => observationStore.getObservation());

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
