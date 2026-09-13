## Why

选牌会把「每当生成状态牌就生成充能球」的牌当成球体系。牌组明明有超频、强撑等状态生成，却因电击/双重释放数量少和缺少集中而建议 SKIP。触发条件与效果被搞反，状态协同读不出来。

## What Changes

- 从卡牌描述识别状态牌相关：生成伤口/灼伤等，以及「每当生成状态牌」这类触发。
- 选牌协同：此类候选按牌组里的状态生成能力计分和写理由，不按充能球数量或集中缺失否定。
- 送给模型的候选说明带上触发条件和状态生成协同；系统提示要求以卡面触发为准。
- 知识生成脚本同步打上对应标签，避免下次同步冲掉。

## Non-goals

- 不代打、不替玩家拿牌或点跳过。
- 不禁止 SKIP；没有状态生成时仍可跳过。
- 不重做全部选牌公式，也不保证每一次都拿化废为宝。
- 不联网重拉全卡评价档案；运行时从描述推导，脚本只改标签规则。

## Capabilities

### New Capabilities

- （无）

### Modified Capabilities

- `agent-decisions`: 状态生成触发的奖励牌按状态协同评价，不以球体系替代触发条件。

## Impact

- `scripts/sync-card-evaluations.js`、`agent/tasks/card-reward.js`、`agent/llm/openai.js`
- 新辅助：`agent/knowledge/mechanic-tags.js`
- 测试：`harness/validate-agent.js`
