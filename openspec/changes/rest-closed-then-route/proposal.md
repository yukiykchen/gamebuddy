## Why

火堆选完回血或升级后，人还站在 RestSite 格子上。Agent 靠「当前节点是休息处」继续出休息建议，不会切到下一步分叉。玩家已经做完这一步，需要按「选择是否完成」来换任务，而不是按脚下格子。

## What Changes

- 新增 `rest.closed`：火堆选择完成（回血、升级，或离开休息 UI）。`data.action` 为 `HEAL` / `SMITH`（能推断时）及可选卡名。
- `selectTask` 只在休息选择未完成时走 `rest_site`；完成后即使还在 RestSite 格子，有分叉就走 `map_route`。
- Mod 在休息 UI 结束时发 `rest.closed`；桌面端也用生命/升级变化补发，旧 Mod 同样能切走。
- 休息建议卡在 `rest.closed` 后收起。

## Non-goals

- 不代打、不替玩家点回血或升级。
- 不新做通用「所有节点选择状态机」；先覆盖休息处完成 → 路线。
- 不靠 Harmony 绑定尚未确认的火堆屏幕类名。

## Capabilities

### New Capabilities

- （无）

### Modified Capabilities

- `agent-decisions`: 休息建议随选择完成结束，随后可出路线建议。
- `pet-overlay`: `rest.closed` 后不再展示休息建议卡。

## Impact

- `harness/protocol.js`、`mod/.../GameBuddyExporter.cs`、`harness/observation-store.js`、`harness/replay-bridge.js`
- `agent/orchestrator.js`、`main.js`、`src/renderer.js`、`src/pet.js`
- 测试：`validate-protocol`、`validate-agent`、`validate-mod`、`validate-observation`
