## Why

当前遭遇攻略只在 Boss 和精英战触发，普通怪物即使已经被 Bridge 和 Spire Codex 准确识别，也不会弹出机制与打法。普通战同样可能造成关键战损，玩家应在开战时直接得到与强敌一致结构的可执行提示。

## What Changes

- 所有非 Boss、非精英的真实战斗均识别为普通遭遇，并按每场一次生成攻略。
- 使用 Spire Codex 当前版本的 63 个普通遭遇及完整怪物机制进行精确匹配；事件战无法匹配遭遇时仍按实际敌人生成机制提示。
- 普通遭遇输出与 Boss/精英一致的摘要、牌组检查、目标优先级、危险窗口、应对建议和常见失误。
- 没有人工社区档案时，根据确定的怪物机制标签和当前敌人组合生成可追溯的机制策略，明确标注“机制推导”，不冒充社区结论。
- 桌宠显示“小怪攻略”标题和短提示，维持每场只弹一次、可关闭、战斗结束自动收起。

## Non-goals

- 不自动出牌、选目标、点击界面或修改游戏状态。
- 不恢复伤害、斩杀线或最优出牌序列计算。
- 不为 63 个普通遭遇伪造人工审核或社区共识档案。
- 不改变 Boss 和精英已有的人工复核策略。

## Capabilities

### New Capabilities

- `encounter-guides`: 所有战斗类型均可生成一次性、可追溯的机制与策略攻略。

### Modified Capabilities

- `pet-overlay`: 桌宠为普通怪物使用明确的小怪攻略标题、来源和提示文案。

## Impact

- 遭遇识别与策略：`agent/tasks/encounter-guide.js`、`agent/knowledge/spire-codex.js`
- 桌宠：`src/pet.js`
- 主进程生命周期：`main.js`
- Harness 与文档：`harness/validate-agent.js`、`README.md`、`docs/data-contract.md`、`docs/feature-status.md`
