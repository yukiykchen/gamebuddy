## Context

见 `proposal.md`。当前 `CardSnapshot` 只有 ID、名称、类型、普通费用和升级标记；效果文本及星费来自目录。Mod 面向早期访问版本，直接绑定非稳定属性会增加编译和运行时脆弱性。

## Goals / Non-Goals

**Goals:**

- 保留实机数据优先级，目录只补缺失字段。
- 用一个向后兼容的卡牌快照覆盖奖励、牌组和战斗牌堆。
- 让 Prompt 明确知道每项信息的来源与是否完整。
- 游戏字段变化时继续发布状态，而不是让整个 Bridge 失败。

**Non-Goals:**

- 不读取或估算最终伤害。
- 不把静态目录字段伪装成运行时字段。
- 不改变只读边界与建议候选范围。

## Decisions

### 1. Bridge 输出结构化费用并保留 `cost`

新增 `energyCost`、`energyCostX`、`starCost`、`starCostX`；`cost` 继续映射能量费用，避免旧桌面端和 Replay 失效。星费通过容错反射读取早期访问版本中可能变动的成员；读取不到时为 `null/false`。

备选方案是只输出拼接后的费用字符串。否决原因是 LLM 和规则无法可靠地区分未知、X 费与 0 费。

### 2. 运行时效果文本优先，目录逐字段补全

Bridge 按 `DynamicDescription`、`Description` 等候选成员读取格式化文本，并标注 `runtime` 或 `unavailable`。Agent 合并时保留非空运行时文本；只有缺失时，才依据升级状态选择目录的升级/基础文本并标注 `catalog`。

备选方案是继续完全依赖 Codex。否决原因是网络失败、版本漂移和动态文本无法被可靠表达。

### 3. Prompt 使用统一 `costs` 与完整性元数据

候选牌和完整牌组均传 `{ energy, energyX, stars, starsX, source }`、`descriptionSource` 与 `contextCompleteness`。保留顶层 `cost` 供现有展示兼容。系统提示只允许依据已提供事实判断。

## Risks / Trade-offs

- [游戏实际成员名称变化] → 使用只读反射候选名并捕获异常，协议显式降级。
- [运行时描述尚未完成格式化] → 空文本不覆盖目录；Harness 覆盖来源优先级。
- [目录版本落后] → 标注 `catalog` 和 `partial`，LLM 不得声称来自实机。
- [新增字段增大状态消息] → 只增加短文本和标量，不导出变量对象或图片。

## Migration Plan

先更新桌面端使其兼容新旧快照，再重新构建并安装 GameBuddyBridge。旧 Replay 因字段可选仍可读取；回滚时移除新增字段即可，`cost` 保持不变。
