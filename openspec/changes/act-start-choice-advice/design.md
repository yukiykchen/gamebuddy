## Context

见 `proposal.md`。协议已允许可选 `state.event` 和 `event.opened`，Agent 已有 `event_choice` 与 `completeEvent`。当前 Mod 快照没有 Event 字段，实机永远走不到该任务。各幕开局 Ancient 与途中事件共用事件房 UI；STS2MCP 已用 `EventRoom`、`NEventRoom`、`NEventOptionButton` 读选项（遗物祝福写在 `Option.Relic`）。GameBuddy 现有采集对 `NMapScreen.Instance` 同样是轮询，不必为未证实的 Overlay 类打 Harmony。

实机截图里地图分叉仍在，最新场景事件可能仍是 `map.opened`，所以桌宠会显示「正在推演后续路线」。

## Goals / Non-Goals

**Goals:**

- 用已确认的事件房节点轮询选项，写入快照并打生命周期事件。
- 可选项在时锁定 `event_choice`；对话中无选项时不要改去 `map_route`。
- 建议卡复用休息处/选牌面板。

**Non-Goals:**

- 不新增 Harmony 屏幕补丁。
- 不实现事件规则库。
- 不在桌面端用地图节点类型虚构按钮文案。

## Decisions

### 1. 轮询事件房，不猜 Overlay 类名

在 `BuildSnapshot` 中若 `CurrentRoom` 是 `EventRoom`，从 `NEventRoom.Instance` 收集可见 `NEventOptionButton`。类型来自已能编译的社区 Mod，与 `NMapScreen` 同一稳定度。

备选：给未知 `AfterOverlayOpened` 打补丁。否决：类名未在本仓库的 `sts2.dll` 上核对。

### 2. 可选项过滤

候选排除不可见、锁定、已选、纯 Proceed。遗物祝福的 `label`/`description` 用遗物名和动态描述。`kind` 用 `AncientEventModel` 判断。对话期允许空 `options`，快照仍带 `event` 以便挡住路线任务。

### 3. `event.closed` 收建议卡

开局常先发过 `map.opened`，选完祝福不会再发一次。用选项从有到无或离开事件房发 `event.closed`，主进程据此清建议卡。旧 Mod 不发 Event 时行为与现在相同。

### 4. LLM 只审可见选项

沿用 `completeEvent`。补充 `kind`、生命、牌组、遗物、每回合能量。无 key 或失败时规则保底（仍是可见选项之一），避免空白。

### 5. UI 复用建议卡

`publishRecommendation` 对 `event_choice` 走 `bridge-card-recommendation`。主窗口增加事件选项列表，不新建第三种桌宠面板。

## Risks / Trade-offs

- [游戏小版本改 UI 节点名] → 采集失败则不写假选项；`currentNode` 为 Ancient 时仍禁止 `map_route`。
- [地图节点在树中仍可见] → 不以 `IsVisibleInTree` 当作玩家正在选路；事件房存在时不选 `map_route`。
- [用户未重装 Mod] → 桌面端无法发明按钮文案，需重装后才有开局建议。

## Migration Plan

重编译并覆盖 `mods/GameBuddyBridge`。协议向后兼容：无 `event` 的旧快照仍合法。回滚 Mod DLL 与桌面这批文件即可。

## Open Questions

无。
