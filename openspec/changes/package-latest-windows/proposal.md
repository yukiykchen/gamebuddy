## Why

已发布的 Windows 安装包仍是 v0.1.1-rc.1，预编译 Mod 不包含流派教学。当前本地代码已有弹幕和构筑引导，但 Windows 全屏下弹幕层收不到鼠标移动，发弹幕按钮保持点击穿透。

## What Changes

- 用当前本地桌面端和 Mod 源码生成新的 Windows 安装包与预编译 Bridge。
- Windows 上由主进程按光标位置探测弹幕层，命中按钮或弹幕时取消点击穿透。

## Capabilities

### New Capabilities

- `windows-danmaku-pointer`: Windows 弹幕层在全屏游戏下仍能点击发弹幕并悬停弹幕。

### Modified Capabilities

## Impact

桌面端弹幕窗口、预编译 `gamebuddy_bridge.dll`、Windows NSIS 安装包文件名与安装说明中的构建编号。
