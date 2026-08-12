# Windows 联调验收

这份清单用于证明“真实游戏状态 -> Mod -> WebSocket -> Runmate 桌面宠物”已经打通。Replay Harness 的绿色结果不能替代这份游戏内验收。

## 环境

- Windows 10/11 x64
- Steam 版《杀戮尖塔 2》
- Godot .NET 4.5.1 或可构建 `Godot.NET.Sdk/4.5.1` 的 .NET 环境
- .NET 9 SDK
- Node.js 20+

## 构建与安装

```powershell
$sts2 = "C:\Program Files (x86)\Steam\steamapps\common\Slay the Spire 2"
dotnet build .\mod\RunmateBridge\RunmateBridge.csproj `
  -c Release `
  -p:Sts2Dir=$sts2 `
  -p:CopyModAfterBuild=true
```

确认游戏目录下存在：

```text
mods\RunmateBridge\RunmateBridge.dll
mods\RunmateBridge\RunmateBridge.json
```

## 验收步骤

1. 先确保 `27182` 没有被 Replay Bridge 占用。
2. 启动《杀戮尖塔 2》并确认 Mod 被加载。
3. 开始或继续一局单人游戏。
4. 启动 Runmate：`npm start`。
5. 桌面宠物状态从 `DEMO`/`WAIT` 变为 `LIVE`。
6. 先运行 `npm run harness:inspect -- --once`，确认探针能打印一份合法状态。
7. 进入战斗，确认生命、能量、手牌、敌人生命和攻击意图更新。
8. 打出一张牌，确认状态变化后桌面端刷新。
9. 结束战斗或打开地图，确认 `combat.ended` / `map.opened` 事件带来对应 UI 变化。
10. 关闭游戏，确认 Runmate 回到等待状态并自动重连。

## 记录结果

```text
Game version:
Mod build commit:
Runmate version:
WebSocket connected: yes / no
Combat snapshot: yes / no
Hand updates: yes / no
Enemy intent and damage: yes / no
Reconnect: yes / no
Notes:
```

如果游戏更新后字段或类名改变，先保留失败快照和 Mod 日志，再更新 `mod/RunmateBridge`，不要直接修改桌面端协议来掩盖采集层变化。
