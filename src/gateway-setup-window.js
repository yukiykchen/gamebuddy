'use strict';
const { BrowserWindow } = require('electron');
const { guardWindowCallback } = require('./window-lifecycle');

function showGatewayWindow(window) {
  if (!window || window.isDestroyed()) return;
  const contents = window.webContents;
  if (contents.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  // 只在用户主动打开或首次就绪时抬升，不用定时器持续抢焦点。
  window.setAlwaysOnTop(true, 'screen-saver');
  window.show();
  window.moveTop();
  window.focus();
  contents.focus();
}

function createGatewayWindow({ preload, page, isCurrent = () => true }) {
  const window = new BrowserWindow({
    width: 440,
    height: 440,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: true,
    acceptFirstMouse: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#171a1c',
    title: '配置密钥',
    autoHideMenuBar: true,
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false }
  });
  // autoHideMenuBar仍允许Alt唤出菜单；配置窗直接移除Windows/Linux菜单。
  // 保留Mac系统应用菜单，复制粘贴继续由原生编辑行为处理。
  if (process.platform !== 'darwin') window.removeMenu();
  window.setAlwaysOnTop(true, 'screen-saver');
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.once('ready-to-show', guardWindowCallback(window, () => isCurrent(window), () => showGatewayWindow(window)));
  window.loadFile(page);
  return window;
}

module.exports = { createGatewayWindow, showGatewayWindow };
