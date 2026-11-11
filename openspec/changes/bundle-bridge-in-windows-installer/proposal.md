## Why

Windows 用户现在要分别下载 Setup 和 Bridge ZIP，再手动拷进游戏 `mods`。安装桌面端时附带 Bridge，并让用户选一次游戏目录即可完成，能少一步、少出错。

## What Changes

- Setup 安装包内置预编译 `GameBuddyBridge`（dll + json）。
- 安装流程在桌面端装完后，弹出目录选择，用户指出《杀戮尖塔 2》根目录；校验通过后写入 `mods\GameBuddyBridge`。
- 用户取消或未选到有效游戏目录时，桌面端安装仍成功，并提示可稍后手动安装 Bridge。
- 更新 Windows 安装说明：主路径改为「一个 Setup」；保留 ZIP 作为备用说明。

## Capabilities

### New Capabilities

- `windows-bridge-bundle`: Windows NSIS Setup 附带 Bridge，并在安装时由用户选择游戏目录完成拷贝。

### Modified Capabilities

- （无既有 capability 的需求条文变更；安装指南随交付流程更新。）

## Impact

- `package.json` electron-builder 额外资源、`build/installer.nsh`、`docs/windows-install-guide.md`、可选仍发布的 Bridge ZIP。
- 不改变游戏内 Mod 协议或桌面端运行时行为。
