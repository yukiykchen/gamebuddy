## Context

`run.observed.floor` 来自 `RunState.ActFloor`。摘要使用 `totalFloor ?? floor`，旧事实没有 `totalFloor`，所以第三幕 6 层被写成整局 6 层。进入下一幕前还会出现一次比最后房间高 1 的过渡值。

`finalBossName` 会在每次 `roomType` 含 Boss 时覆盖。第二幕碾碎爪因此留到结局，即使玩家随后死于普通敌人。失败时最后一场战斗没有 `combat.ended`；中途退出被 `combat.attempt_replaced` 替换的战斗不能当成死因。

## Goals / Non-Goals

**Goals:**

- 这局显示 39 层、死于猫头鹰法官。
- 通关仍显示最后的关底 Boss。
- 主动放弃不把未结束战斗写成死因。

**Non-Goals:**

- 不回放或改写已存储事实。
- 不改准备度、弹幕或战斗胜负标记。

## Decisions

1. 快照新增 `totalFloor = RunState.TotalFloor`。摘要优先用最后一条有效 `totalFloor`。
2. 没有 `totalFloor` 时，按幕分段取该幕最大正楼层。后面还有下一幕、且存在 `最大楼层 - 1` 时，减掉进入下一幕时的过渡楼层。
3. `cleared === false` 且 `reason !== "abandoned"` 时，死因是最后一场已开始、未结束、且没有被 `combat.attempt_replaced` 替换的战斗。多个敌人用顿号连接。
4. 卡片文案：死因显示“死于”，通关仍显示“关底 BOSS”。

## Risks / Trade-offs

- 过渡楼层规则依赖现有快照在换幕时加 1。以后快照带上 `totalFloor` 后不再走这条路径。

## Migration Plan

桌面端启动时已有 `rebuildFactReviews()`，重启 GameBuddy 会重算这局。游戏内新字段要等模组重新加载后才出现。

## Open Questions

无。
