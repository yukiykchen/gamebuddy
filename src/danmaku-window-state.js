'use strict';

// 原生透明窗口的重复设置会触发兼容层重合成；只提交真正发生的状态变化。
const mousePassthrough = new WeakMap();

function showInactiveOnce(host) {
  if (!host || host.isDestroyed() || host.isVisible()) return false;
  host.showInactive();
  return true;
}

function setMousePassthrough(host, enabled) {
  if (!host || host.isDestroyed()) return;
  const next = Boolean(enabled);
  if (mousePassthrough.get(host) === next) return;
  host.setIgnoreMouseEvents(next, { forward: true });
  mousePassthrough.set(host, next);
}

function setBoundsIfChanged(host, bounds) {
  if (!host || host.isDestroyed()) return;
  const current = host.getBounds();
  if (['x', 'y', 'width', 'height'].every(key => current[key] === bounds[key])) return;
  host.setBounds(bounds);
}

module.exports = { showInactiveOnce, setMousePassthrough, setBoundsIfChanged };
