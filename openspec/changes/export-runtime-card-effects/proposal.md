## Why

选牌 Agent 目前能识别升级状态，但卡面文本主要依赖 Spire Codex 补全，且只传普通能量费用。Codex 不可用、版本不一致或卡牌使用星费/X 费时，LLM 可能看不到游戏里真实显示的完整效果与费用。

## What Changes

- GameBuddyBridge 从实机 `CardModel` 导出运行时卡面文本、升级状态、能量费用/X 费与星费/X 星费，同时保留现有 `cost` 字段兼容旧客户端。
- 运行时字段不可读取时明确上报缺失，不编造数值；Agent 才使用同版本 Spire Codex 逐字段补全并标注来源。
- 卡牌奖励 Prompt 为候选牌和完整牌组传入效果文本、结构化费用、升级状态、来源与完整性，要求 LLM 不得把缺失字段当成确定事实。
- 数据协议、Replay/Harness 校验和项目文档同步覆盖新增字段。
- 将 OpenSpec CLI 作为项目本地开发依赖，确保规范流程版本可复现。

## Non-goals

- 不自动点击、拿牌或修改游戏状态。
- 不恢复已移除的伤害计算，也不自行推导动态伤害。
- 不重写卡牌 Tier、社区评价或整体选牌评分公式。
- 不要求旧 Replay 立即补齐新增可选字段。

## Capabilities

### New Capabilities

- `game-bridge`: 卡牌快照以向后兼容方式暴露实机效果文本、升级状态和完整费用。
- `agent-decisions`: 选牌上下文优先使用实机卡面信息，并向 LLM 明确传递字段来源和完整性。

### Modified Capabilities

- （无）

## Impact

- Mod 协议：`mod/GameBuddyBridge/Scripts/GameBuddyExporter.cs`
- Agent：`agent/knowledge/spire-codex.js`、`agent/tasks/card-reward.js`、`agent/llm/openai.js`
- 校验与文档：`harness/protocol.js`、`harness/validate-agent.js`、`harness/validate-mod.js`、`docs/data-contract.md`
- 开发依赖：`package.json`、`package-lock.json`
