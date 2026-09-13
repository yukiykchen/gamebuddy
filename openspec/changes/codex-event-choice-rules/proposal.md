## Why

GameBuddy 已能读取事件界面上的按钮，却没有消费仓库中 66 条 Spire Codex 事件决策树；规则模式会默认选择第一个选项，无法识别致死、最大生命损失、诅咒、后续战斗和多页面递增代价。问号事件需要像选牌一样先由确定规则分析，再让 LLM 在真实选项内复核。

## What Changes

- 将 stable `v0.107.1` 的事件目录建立为版本化运行时索引，按稳定 ID、中文标题、当前页面和可见选项匹配。
- Bridge 以向后兼容方式补充 `eventId`、`pageId` 和 `optionId`；旧 Mod 缺字段时按标题与效果文本降级匹配。
- 为每个可选项解析生命、最大生命、金币、卡牌、遗物、药水、诅咒、战斗、随机结果和未知效果，输出利弊、风险、规则分数与来源。
- 明显致死或资源不足的选项不得成为首选；规则不完整时降低置信度并明确未知风险，不再无理由默认第一项。
- LLM 接收事件原文、完整玩家资源、规则匹配结果及逐项分析，只能选择提供的可执行选项。
- 主面板和桌宠显示推荐理由、主要收益、代价、风险与数据版本。

## Non-goals

- 不自动点击事件、进入战斗、选牌或修改游戏状态。
- 不假设随机奖励的具体内容，不为 Codex 未确认的效果补造事实。
- 不在本次为 57 个问号事件编写主观固定 Tier；策略必须结合当前局面。

## Capabilities

### New Capabilities

- `event-choice-rules`: 事件目录匹配、逐选项确定性分析、安全排序、LLM 受限复核与降级行为。

### Modified Capabilities

- `pet-overlay`: 事件建议卡增加结构化收益、代价、风险和知识来源展示。

## Impact

- 规则与 Agent：`agent/knowledge/event-rules.js`、`agent/tasks/event.js`、`agent/llm/openai.js`
- Bridge 与协议：`mod/GameBuddyBridge/Scripts/GameBuddyExporter.cs`、`harness/protocol.js`
- UI：`src/renderer.js`、`src/pet.js`
- 验证与文档：`harness/validate-agent.js`、`harness/validate-protocol.js`、`harness/validate-mod.js`、README 与数据契约
