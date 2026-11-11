'use strict';

// 加载事件可能在窗口关闭后才送达。捕获原WebContents，避免读取销毁窗口的属性。
function guardWindowCallback(host, isCurrent, callback) {
  const contents = host.webContents;
  return function (...args) {
    if (host.isDestroyed() || contents.isDestroyed() || !isCurrent()) return;
    return callback.apply(this, args);
  };
}

module.exports = { guardWindowCallback };
