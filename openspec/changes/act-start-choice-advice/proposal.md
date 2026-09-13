## Why

每一层开局的远古祝福（如佩尔三选一遗物）已经出现选项，桌宠却在推演地图路线。Mod 没有把当前选项写进 `state.event`，Agent 看不到候选，LLM 无法推荐。

## What Changes

- Mod 在事件房（含各幕开局 Ancient）采集可见选项：标题、描述、遗物名与效果，写入 `state.event`。
- 选项出现时发 `event.opened`；选项结束或离开事件房时发 `event.closed`。
- 有可选项时任务为 `event_choice`，由已有 LLM 在候选中推荐；对话中尚未出选项时不得改推路线。
- 桌宠用建议卡展示推荐项与理由；主窗口同步列出选项。

## Non-goals

- 不代点选项、不改游戏。
- 不建完整事件规则库，不保证效果分析器。
- 不猜未证实的 Harmony 屏幕类名；只读已确认的事件房 UI。
- 不改选牌、休息处、路线公式。

## Capabilities

### New Capabilities

- `game-bridge`: 事件房与开局祝福选项进入快照和事件流。
- `protocol`: `state.event` 带可选 `kind`；新增 `event.closed`。
- `agent-decisions`: 开局/事件选择优先于路线，LLM 只在可见选项中推荐。
- `desktop-ui`: 主窗口展示事件/开局选项建议。

### Modified Capabilities

- `pet-overlay`: 事件与开局建议走建议卡；思考文案区分事件分析与路线推演。

## Impact

- `mod/GameBuddyBridge/Scripts/GameBuddyExporter.cs`
- `agent/orchestrator.js`、`agent/tasks/event.js`、`agent/llm/openai.js`
- `harness/protocol.js`、`main.js`、`src/pet.js`、`src/renderer.js`
- `docs/data-contract.md`
- 测试：`harness/validate-agent.js`、`validate-protocol.js`、`validate-mod.js`
