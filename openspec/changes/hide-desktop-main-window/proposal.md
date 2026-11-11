## Why

GameBuddy 的主面板会占用桌面空间，而当前核心体验已经由悬浮桌宠、建议卡和弹幕承载。默认创建或允许重新打开主面板会打扰游戏，因此需要关闭主面板显示，同时保留后台运行能力。

## What Changes

- **BREAKING**：应用启动后不再创建或显示主面板，桌宠点击、右键菜单、系统托盘和 macOS 激活事件也不再打开主面板。
- 保留 Electron 主进程、Bridge 连接、Observation Store、Agent、悬浮桌宠、建议卡、遭遇攻略、弹幕和系统托盘。
- 移除仅供主面板使用的显示入口；系统托盘继续提供桌宠显隐和退出能力。
- 主面板源码可暂时保留，避免把“停止显示”扩大成删除实现。

## Capabilities

### New Capabilities

- `desktop-ui`: 定义 GameBuddy 无主面板运行时的可观察桌面行为。

### Modified Capabilities

- `pet-overlay`: 桌宠交互不再要求点击后打开主面板，其他桌宠交互保持可用。

## Impact

- 主要影响 `main.js` 的窗口创建、应用激活、托盘和桌宠菜单行为，以及 `preload.js` / `src/pet.js` 中的主面板打开入口。
- `src/index.html`、`src/renderer.js` 和主面板样式暂不删除，但不再进入运行时显示路径。
- 不修改本地 WebSocket 协议、Mod、Agent 决策或弹幕语义。

## Non-goals

- 不删除 Electron 运行宿主、桌宠、弹幕、Agent 或系统托盘。
- 不在本次重做设置界面或把主面板能力迁移到游戏内。
- 不增加自动出牌、鼠标控制或任何修改游戏状态的能力。
