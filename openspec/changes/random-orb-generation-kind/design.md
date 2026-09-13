## Context

见 `proposal.md`。实机 payload 里化废为宝描述已是「随机生成一个充能球」，mechanicTags 含 `orb`。电击+ 与破损核心文本是闪电。模型把三者写成「仅有闪电球生成手段」。冷却剂知识库 goodWhen/badWhen 也在说「目标球类型」。

## Goals / Non-Goals

**Goals:**

- 从文本推出 `orbGeneration`（`random` / 具名种类 / 未具名）。
- 牌组、遗物、候选带上该字段；提示禁止把随机球说成单一具名种类。
- 化废为宝评价去掉「目标球类型」否决。

**Non-Goals:**

- 不模拟球槽与激发伤害。
- 不强制改推荐为冷却剂。

## Decisions

### 1. 按卡面推导种类，不猜默认闪电

「随机…充能球」→ `random`。文本点名闪电/冰霜/黑暗/等离子 → 对应种类。只写「生成充能球」且未点名 → `unspecified`，不得当成闪电。

备选：只改提示、不加字段。否决：模型已经看见正确描述仍写错，需要显式字段。

### 2. 知识库化废为宝按状态触发，不按目标球种

与 status-synergy 一致：goodWhen 看状态牌生成；badWhen 不写目标球类型不匹配。

## Risks / Trade-offs

- [模型仍忽略字段] → 提示与字段同时约束；测试覆盖 payload 与提示词。
- [彩虹类多种类文本] → 多种具名并存时保留全部，不当成 random。

## Migration Plan

桌面端重启后生效。回滚上述文件即可。

## Open Questions

无。
