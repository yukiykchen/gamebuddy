# GameBuddyBridge

这是运行在《杀戮尖塔 2》进程内的只读数据采集 Mod。它不调用出牌、移动、选择奖励或鼠标控制 API，只把当前对局状态通过本地 WebSocket 推给 GameBuddy 桌面端。

从安装依赖到启动桌面端的完整流程见 [GameBuddy 启动与开发指南](../../docs/getting-started.md)，逐项真机检查见 [Windows 联调验收](../../docs/windows-validation.md)。

## 采集内容

- 当前局：角色、Act、楼层、房间、当前地图节点
- 地图：全部节点坐标与类型、子节点连线、从当前位置到 Boss 的可达路线，以及游戏已公开时的遭遇 ID/名称
- 玩家：生命、最大生命、格挡、金币、能量、卡组、遗物 ID/名称、药水 ID/名称
- 战斗：回合、手牌、抽牌堆、弃牌堆、消耗牌
- 敌人：稳定 ID、名称、生命、格挡、是否存活、`Monster.NextMove` 类型
- 敌人攻击意图：只导出游戏当前的 `Monster.NextMove` 类型，不推算实际伤害
- 状态变化事件：战斗开始/结束、回合开始、地图打开、进入休息处、事件/开局祝福选项出现与结束
- 事件房：当前事件标题、描述、可见选项（含远古祝福遗物名与效果），并尽力读取稳定的事件、页面和选项 ID；早期访问字段变化时继续使用显示文本
- 卡牌快照：导出升级状态、游戏当前格式化效果文本、普通能量/X 费与星/X 星费；可选运行时字段变化时明确标记不可用
- 卡牌奖励：监听 `NCardRewardSelectionScreen` 打开和刷新，导出当前候选牌、刚结束的战斗类型/敌人和可读取到的下一个 Boss
- 商店：在 `MerchantRoom` 中导出当前玩家库存里的全部在售卡牌、遗物、药水、删牌服务、运行时价格与可购买状态；库存或金币变化时发送更新事件

## 构建环境

STS2 Mod 使用游戏程序集和 `Godot.NET.Sdk/4.5.1`。需要在 Windows、安装了游戏、[.NET 9 SDK](https://dotnet.microsoft.com/download/dotnet/9.0) 和 [MegaDot / Godot .NET 4.5.1](https://megadot.megacrit.com/) 的机器上构建。在 Steam 库中右键游戏并选择“管理 → 浏览本地文件”可找到实际安装目录：

```powershell
dotnet build .\mod\GameBuddyBridge\GameBuddyBridge.csproj -c Release `
  -p:Sts2Dir="C:\Program Files (x86)\Steam\steamapps\common\Slay the Spire 2" `
  -p:CopyModAfterBuild=true
```

也可以设置 `STS2_DIR` 环境变量。构建前项目会检查 `data_sts2_windows_x86_64\sts2.dll` 和 `0Harmony.dll` 是否存在，避免生成一个看似成功但无法加载的 Mod。

## 安装与启用

带 `CopyModAfterBuild=true` 的构建会生成并复制以下文件：

```text
<STS2>\mods\GameBuddyBridge\gamebuddy_bridge.dll
<STS2>\mods\GameBuddyBridge\GameBuddyBridge.json
```

完整退出游戏后重新启动，在首次 Mod 提示或主菜单/设置中的 `Mods` / `Modding` 页面启用 `GameBuddy Bridge`；Early Access 版本可能调整入口名称。manifest 的 `dependencies` 为空，因此无需安装 BaseLib、ModConfig 或其他第三方 Mod。游戏只在启动时扫描 Mod，替换 DLL 后必须重启。

启用后开始或继续一局，在 GameBuddy 仓库根目录执行：

```powershell
npm run harness:inspect -- --once
```

输出包含 `source=sts2-mod-bridge` 即表示 Mod 已加载且本地 WebSocket 正常。若一直无法连接，依次检查 DLL/JSON 是否位于同一目录、Mod 是否启用、游戏是否已经重启，以及端口 `27182` 是否被 Replay Bridge 占用。

## 协议

构建产物名必须与 manifest 的 `id` 一致，即 `gamebuddy_bridge.dll`。默认监听 `ws://127.0.0.1:27182`，发送：

```json
{ "type": "state", "data": { "schema": "gamebuddy.state.v1", "source": "sts2-mod-bridge" } }
```

事件不会覆盖服务器保存的最近状态。新客户端连接或发送 `request_snapshot` 时，服务端始终先返回最近一份 `state` 快照。商店使用 `shop.opened`、`shop.updated`、`shop.closed` 表示进入、库存/金币变化和离开；桌面端在进店时一次生成完整购物清单，后续更新只刷新库存与余额，不逐件重新决策。

桌面端已经把回放桥和真实 Mod 桥放在同一个协议边界，后续 Agent 只需要订阅桌面端状态，不需要了解 Godot 或 STS2 内部对象。

卡牌奖励通过 Harmony 生命周期 Hook 采集，但仍然只读：Mod 不会调用卡牌选择或跳过接口。游戏更新后若 `NCardRewardSelectionScreen` 的生命周期发生变化，日志会记录 `Harmony reward-screen patches failed`，其余状态采集仍会继续运行。

卡牌的动态描述和星费属于早期访问版本中可能变化的可选成员，Bridge 使用容错只读反射读取。读取失败时对应来源为 `unavailable`，不会阻止状态发布；桌面端可以使用 Spire Codex 回退并保留来源标记。更新本 Mod 后需要重新构建、复制 `gamebuddy_bridge.dll` 并重启游戏。
