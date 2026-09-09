# Windows 联调验收

这份清单用于证明“真实游戏状态 -> Mod -> WebSocket -> GameBuddy 桌面宠物”已经打通。Replay Harness 的绿色结果不能替代这份游戏内验收。

## 环境

- Windows 10/11 x64
- Steam 版《杀戮尖塔 2》
- Godot .NET 4.5.1 或可构建 `Godot.NET.Sdk/4.5.1` 的 .NET 环境
- .NET 9 SDK
- Node.js 20+

## 构建与安装

```powershell
$sts2 = "C:\Program Files (x86)\Steam\steamapps\common\Slay the Spire 2"
npm run mod:build -- -Sts2Dir $sts2
```

确认游戏目录下存在：

```text
mods\GameBuddyBridge\gamebuddy_bridge.dll
mods\GameBuddyBridge\GameBuddyBridge.json
```

## 验收步骤

1. 先确保 `27182` 没有被 Replay Bridge 占用。
2. 启动《杀戮尖塔 2》并确认 Mod 被加载。
3. 开始或继续一局单人游戏。
4. 启动 GameBuddy：`npm start`。
5. 桌面宠物状态从 `WAIT` 变为 `LIVE`。
6. 先运行 `npm run harness:inspect -- --once`，确认探针能打印一份合法状态。
7. 进入战斗，确认生命、能量、手牌、敌人生命和攻击意图更新。
8. 打出一张牌，确认状态变化后桌面端刷新。
9. 结束战斗或打开地图，确认 `combat.ended` / `map.opened` 事件带来对应 UI 变化。
10. 在地图页确认出现「下一步」路线建议（无 API Key 时为规则打分；配置 LLM 后可看到「模型」来源）。
11. 打开卡牌奖励，确认三张候选牌、当前牌组和 `card.reward.opened` 事件完整，界面能建议拿牌或跳过；完成选择后确认收到 `card.reward.closed`，卡牌思考动画和旧建议立即消失且不再重复触发。
12. 进入休息处，确认界面能在回血和具体卡牌升级之间给出建议。
13. 进入精英和 Boss 战，确认桌宠分别弹出对应攻略，且手动关闭后本场不重复打扰。
14. 关闭游戏，确认 GameBuddy 回到等待状态并自动重连。

## 记录结果

```text
Game version:
Mod build commit:
GameBuddy version:
WebSocket connected: yes / no
Combat snapshot: yes / no
Hand updates: yes / no
Enemy intent (no damage estimate): yes / no
Card reward and recommendation: yes / no
Rest recommendation: yes / no
Elite guide popup: yes / no
Boss guide popup: yes / no
Reconnect: yes / no
Notes:
```

如果游戏更新后字段或类名改变，先保留失败快照和 Mod 日志，再更新 `mod/GameBuddyBridge`，不要直接修改桌面端协议来掩盖采集层变化。
