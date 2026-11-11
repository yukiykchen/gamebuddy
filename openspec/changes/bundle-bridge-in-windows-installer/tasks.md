## 1. Package Bridge into Setup

- [x] 1.1 在 electron-builder 配置中把 `distribution/GameBuddyBridge` 打进安装包的 `resources/bridge`。
- [x] 1.2 确认打包产物含 `gamebuddy_bridge.dll` 与 `GameBuddyBridge.json`。

## 2. Installer copy step

- [x] 2.1 在 `build/installer.nsh` 增加交互安装时的目录选择、STS2 根目录校验，以及拷贝到 `mods\GameBuddyBridge`。
- [x] 2.2 支持取消/跳过与校验失败重试；静默安装不弹窗、不阻断桌面端安装。

## 3. Docs

- [x] 3.1 更新 `docs/windows-install-guide.md`：默认用单 Setup 完成桌面端+Bridge；ZIP 仅作备用说明。
