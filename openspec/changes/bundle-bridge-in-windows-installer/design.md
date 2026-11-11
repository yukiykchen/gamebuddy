## Context

当前交付是 Setup EXE + Bridge ZIP。用户已确认不要自动猜 Steam 路径，改为安装时自选游戏根目录。

## Goals / Non-Goals

**Goals:**

- 一份 Setup 同时携带桌面端与预编译 Bridge。
- 安装结束（或安装段末尾）弹出目录选择；用户选中 STS2 根目录后写入 `mods\GameBuddyBridge`。
- 用 `SlayTheSpire2.exe` 或 `data_sts2_windows_x86_64` 校验目录有效。
- 静默安装 `/S` 不弹窗，跳过 Bridge 拷贝（或仅在已有环境变量指定路径时拷贝——本期直接跳过）。

**Non-Goals:**

- 不解析 `libraryfolders.vdf`，不扫全盘。
- 不在卸载桌面端时删除游戏 mods（避免误删用户其他 Mod）。
- 不把游戏私有程序集打进安装包。

## Decisions

1. Bridge 文件通过 electron-builder `extraResources` 放到 `$INSTDIR\resources\bridge\`（`gamebuddy_bridge.dll`、`GameBuddyBridge.json`）。
2. 在 `build/installer.nsh` 的 `customInstall` 中：非静默时用 `nsDialogs::SelectFolderDialog` 选目录；校验后 `CreateDirectory` + `CopyFiles` 到 `$STS2\mods\GameBuddyBridge`。
3. 校验失败可重试选择或跳过；跳过只提示，不回滚桌面端。
4. 覆盖已有 Bridge 文件时直接覆盖；不备份（体积小、版本以安装包为准）。
5. 安装说明改为以单 Setup 为主；ZIP 仍可作备用分发。

## Risks / Trade-offs

- 应用宝 Wine 下文件夹对话框偶发异常：失败时允许跳过并提示手动复制 `resources\bridge`。
- 用户选错到 `mods` 或嵌套目录：校验要求根目录存在游戏可执行文件或 `data_sts2_windows_x86_64`，降低嵌套拷贝风险。
