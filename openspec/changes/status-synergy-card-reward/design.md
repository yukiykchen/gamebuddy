## Context

见 `proposal.md`。`mechanicTags` 用正则扫描述：出现「充能球」就打 `orb`，「伤口/灼伤」却没有状态标签。化废为宝因此按球协同匹配电击/双重释放；超频、强撑进不了协同。知识库 `goodWhen` 也写成球槽/集中。模型看到这些就会 SKIP。

## Goals / Non-Goals

**Goals:** 运行时从描述区分「生成状态」和「状态触发」；状态触发牌优先匹配状态生成协同；LLM 输入带触发说明。

**Non-Goals:** 不强制禁止 SKIP；不联网重生成 `card-evaluations.json`。

## Decisions

### 1. 运行时推导标签

共享 `agent/knowledge/mechanic-tags.js`：

- `status_generate`：把伤口/灼伤/眩晕/黏液加入手牌、抽牌堆或弃牌堆
- `status`：文案涉及状态牌（含「抽到状态牌」「每当你生成状态牌」）
- 「每当你生成状态牌」本身不是 `status_generate`

选牌对牌组和候选都合并这些标签，不依赖档案是否已更新。

### 2. 触发优先于效果

候选若是状态生成触发，协同只看 `status_generate`（没有则看 `status`），忽略 `orb` 计数。`goodWhen`/`cons` 覆盖知识库里的球槽/集中句。候选 payload 增加 `trigger` 与 `synergy`。

### 3. 提示

选牌系统提示：卡面触发条件优先于知识库套话；「每当生成状态牌」不得因效果是充能球就按球体系否决。

## Risks / Trade-offs

- [描述正则漏网] → 用「加入/洗入 + 伤口|灼伤」等具体模式；测试覆盖超频/强撑/化废为宝
- [模型仍 SKIP] → 规则层分数和理由先改对；不锁死模型选择

## Migration Plan

只改桌面 Agent。下次 `npm run knowledge:cards` 会带上新标签。

## Open Questions

无。
