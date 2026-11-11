## Context

弹幕窗口默认 `setIgnoreMouseEvents(true, { forward: true })`，并设置 `focusable: false`。Windows 全屏游戏占住鼠标后，转发的移动事件到不了页面，按钮无法切换为可点击。

`distribution/GameBuddyBridge/gamebuddy_bridge.dll` 仍是不含 `card_guidance` 的旧构建。游戏目录里的 DLL 更新，但安装包流程打包的是 `distribution/`。

## Goals / Non-Goals

**Goals:**

- Windows 上光标落在发弹幕按钮、输入栏或飞行弹幕上时，窗口接收点击和悬停。
- 光标离开这些区域后恢复穿透，避免挡住游戏。
- 用当前 Mod 源码重新编译，并放入 `distribution/` 与安装包附件。

**Non-Goals:**

- 不改变 macOS 上现有的鼠标转发路径。
- 不改流派判定规则。

## Decisions

主进程在 `win32` 上每 40ms 读取 `screen.getCursorScreenPoint()`，换成弹幕窗口客户区坐标后发给渲染进程。渲染进程用 `document.elementFromPoint` 判断是否命中 `.danmaku-item` 或 `.shared-composer`，再调用现有的 `danmaku-pointer-mode`。这样不依赖 Windows 把鼠标移动转发给未聚焦的透明窗口。

安装包版本号改为 `0.2.0`，与已发布的 `0.1.1-rc.1` 文件名区分。

## Risks / Trade-offs

探测间隔约 40ms，极快的单击可能仍发生在穿透打开时。光标先停在按钮上再点击可以命中。

Mod 只能链接本机《杀戮尖塔 2》程序集，产物继续只分发 Bridge，不包含游戏程序集。

在 macOS 上交叉生成的 NSIS 安装包，安装后卸载器常因 PE 元数据改写触发 “Installer integrity check has failed”。正式发布仍应优先在 Windows CI 打包；本地交付额外关闭 `CRCCheck`，并保持 `signExecutable: false`。

桌宠右键「关闭」改为退出整个进程，因为主面板默认只隐藏，托盘图标在应用宝 Wine 下又几乎不可见，用户否则没有可靠退出手段。
