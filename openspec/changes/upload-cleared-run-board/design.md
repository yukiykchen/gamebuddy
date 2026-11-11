## Context

见 `proposal.md`。通关与否已经由 `RunManager.OnEnded` 的布尔值决定：`true` 为通关，放弃流程中的 `false` 为放弃，其余 `false` 为未通关。战斗内读档已有 `combat.attempt_replaced`。卡组和遗物在最后一次 `run.observed`。`GameMode` 只参与对局指纹。`event.opened` / `event.closed` 没有记下被选中的选项。共享弹幕 Worker 使用 D1，但没有通关表。

## Goals / Non-Goals

**Goals:**

- 在通关结束点追加一次上传，不改结束判定。
- 事件选择、通关模式、读档标记都作为新字段或新事实加进去。
- 排行榜数据落在现有 Worker 的新表，弹幕接口保持原样。

**Non-Goals:**

- 不修改建议、弹幕、个人数据展示和大同上报。
- 不识别战斗外读档。
- 不做榜单页面。本变更只保证能写入并按条件读回。

## Decisions

1. 桌面端在事实 `run.ended` 且 `payload.cleared===true` 时组包。用时取该局第一条开局/恢复事实到结束事实的秒数。`runId` 用现有对局编号。
2. `combatSaveLoad` 为该局是否存在 `combat.attempt_replaced`。没有这条事实就是 `false`，不读取 `save-loads.json`。
3. Mod 在开局事实里额外写入 `gameMode` 字符串，读取方式与进阶相同。指纹算法不改。
4. Mod 在玩家确认事件选项时新增 `event.selected`，带事件标识和选项标识。`event.opened` 与 `event.closed` 的现有载荷不改。
5. 卡组和遗物取通关前最后一次观察里的 id 与升级标记，不上传完整牌面描述。
6. Worker 新增 `clears` 表和 `POST /v1/clears`、`GET /v1/leaderboard`。同一 `runId` 重复提交返回已有记录。弹幕路由不改。

## Risks / Trade-offs

- [观察用时不是游戏内计时] → 字段名使用 observed duration，榜单不称为官方速通。
- [客户端可伪造成绩] → 本期只做去重和字段校验，不做对战校验。
- [事件选择钩子挂错会漏记] → 只在确认选择时发事实；漏记则该局事件列表为空，不阻断上传。
