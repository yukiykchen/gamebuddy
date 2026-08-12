# RunmateBridge

这是运行在《杀戮尖塔 2》进程内的只读数据采集 Mod。它不调用出牌、移动、选择奖励或鼠标控制 API，只把当前对局状态通过本地 WebSocket 推给 Runmate 桌面端。

## 采集内容

- 当前局：角色、Act、楼层、房间、当前地图节点
- 玩家：生命、最大生命、格挡、金币、能量、卡组、遗物、药水
- 战斗：回合、手牌、抽牌堆、弃牌堆、消耗牌
- 敌人：名称、生命、格挡、是否存活、`Monster.NextMove` 类型
- 敌人攻击意图：通过 `AttackIntent.GetTotalDamage` 计算当前预估伤害
- 状态变化事件：战斗开始/结束、回合开始、地图打开

## 构建环境

STS2 Mod 使用游戏随附的 Godot .NET SDK 和程序集。需要在 Windows、安装了游戏和 Godot .NET SDK 的机器上构建：

```powershell
dotnet build .\mod\RunmateBridge\RunmateBridge.csproj -c Release `
  -p:Sts2Dir="C:\Program Files (x86)\Steam\steamapps\common\Slay the Spire 2" `
  -p:CopyModAfterBuild=true
```

也可以设置 `STS2_DIR` 环境变量。构建前项目会检查 `data_sts2_windows_x86_64\sts2.dll` 和 `0Harmony.dll` 是否存在，避免生成一个看似成功但无法加载的 Mod。

## 协议

默认监听 `ws://127.0.0.1:27182`，发送：

```json
{ "type": "state", "data": { "schema": "runmate.state.v1", "source": "sts2-mod-bridge" } }
```

事件不会覆盖服务器保存的最近状态。新客户端连接或发送 `request_snapshot` 时，服务端始终先返回最近一份 `state` 快照。

桌面端已经把回放桥和真实 Mod 桥放在同一个协议边界，后续 Agent 只需要订阅桌面端状态，不需要了解 Godot 或 STS2 内部对象。
