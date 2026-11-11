## Why

铁甲自动打击流派度首版只认四核和少量辅助，坏牌几乎只靠厚度稀释（0～−2），力量轴/硬毒与无关牌无法区分；耸肩等过牌混合防被误判为稀释。玩家已确认「白名单 + 黑名单 + 厚度稀释税」机制，需要落到计分代码。

## What Changes

- 重写 `autoStrikeScore` / `autoStrikeImpact`：保留结构分与 setup 稀释；扩展辅助白名单与打击包弹药；加入软反/硬毒罚分。
- 移出误计辅助（坚定不移、痛击额外拷贝）；战斗专注降为 B；纯墙不抬分。
- 候选增量可附带简短原因标签（过牌辅助 / 稀释 / 支线冲突 / 破坏循环等），供选牌卡悬停或旁注；主数字口径不变。
- 更新单测与牌表文档对齐；不改选牌排序与 SKIP。

## Capabilities

### Modified Capabilities

- `agent-decisions`: 自动打击流派度计分规则（白名单/黑名单/稀释）。

### New Capabilities

- （无）

## Impact

- `agent/knowledge/auto-strike.js`、`agent/tests/auto-strike.test.js`
- 可选：`src/renderer.js` 展示原因标签（title/旁注）
- `docs/auto-strike-archetype-card-list.md`（已定归属，计分落地后微调表述）
- 不修改 Bridge / 协议字段名（仍用 `archetypeImpact.deltaPoints`；原因字段可选扩展）
