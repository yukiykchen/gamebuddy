## Why

选牌建议在对比冷却剂时，把牌组里的化废为宝说成「只能生成闪电球」。发给模型的卡面已经是「随机生成一个充能球」，但模型把电击+、破损核心和化废为宝捆成同一球种。冷却剂按不同种类计数，随机球可以提供多种类，不能算单一闪电。

## What Changes

- 从卡面/遗物效果推导充能球生成种类（随机、闪电、冰霜等）。
- LLM 牌组、遗物、候选带上该种类；系统提示禁止把「随机生成一个充能球」说成只能生成某一确定种类。
- 化废为宝的知识库评价不再用「目标球类型不匹配」这类单一种类否决语。

## Non-goals

- 不代拿牌、不改游戏。
- 不重做全部充能球协同公式，也不保证因此改拿冷却剂。
- 不补全每一种充能球牌的数值模拟。

## Capabilities

### New Capabilities

- （无）

### Modified Capabilities

- `agent-decisions`: 随机充能球必须按任意种类表述，不得写成单一闪电/冰霜/黑暗。

## Impact

- `agent/knowledge/mechanic-tags.js`、`agent/tasks/card-reward.js`、`agent/llm/openai.js`、`agent/knowledge/card-evaluations.json`
- 测试：`harness/validate-agent.js`
