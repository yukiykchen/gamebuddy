## Why

卡牌奖励会出现已升级的牌（如趁势打击+）。知识库和目录是未升级数据，合并时覆盖了实机的升级状态与描述。模型按 F 档未升级牌评价，容易 SKIP。Mod 在 `IsUpgraded` 从 false 变为 true 时会再发一次 `card.reward.opened`，签名变了，一次奖励被问两次，建议从拿牌改成跳过。先前的同屏只问一次锁的是「含升级标记的签名」，所以没拦住。

## What Changes

- 实机快照的 `upgraded`、费用、名称优先于目录；升级牌用升级后描述。
- 评分和 LLM 把已升级奖励按升级后效果评价，不得用未升级档位直接否决。
- 同一组卡牌 ID 只发布一次建议；升级标记闪烁不再重算。
- Mod 同一 ID 优先取已升级模型。

## Non-goals

- 不代拿牌、不改游戏。
- 不重做全部选牌公式，不禁止 SKIP。
- 不把社区未升级档位改写成升级档位档案。

## Capabilities

### New Capabilities

- （无）

### Modified Capabilities

- `agent-decisions`: 升级奖励牌按升级后效果评价；同一组卡 ID 不因升级标记闪烁而换建议。
- `game-bridge`: 奖励采集同一 ID 优先已升级模型。

## Impact

- `agent/knowledge/spire-codex.js`、`agent/tasks/card-reward.js`、`agent/llm/openai.js`、`agent/orchestrator.js`
- `mod/GameBuddyBridge/Scripts/GameBuddyExporter.cs`
- 测试：`harness/validate-agent.js`、`harness/validate-mod.js`
