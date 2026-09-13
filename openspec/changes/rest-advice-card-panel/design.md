## Context

见 `proposal.md`。选牌建议走 `bridge-card-recommendation`，会拉宽桌宠窗口并渲染左侧卡。休息处只走 `bridge-recommendation`，由 `setRecommendation` 把 `reason` 整段写入 `.speech`。

## Goals / Non-Goals

**Goals:**

- 复用现有建议卡 DOM/CSS，不新做第三种面板。
- 休息处发布后进入 card 窗口尺寸。
- `rest.opened` 不得清掉已经展示的休息建议卡。

**Non-Goals:**

- 不改休息处 Agent 输出 schema。
- 不把路线/事件迁到建议卡。

## Decisions

### 1. 复用选牌建议卡，而不是新面板

`publishRecommendation` 对 `rest_site` 与 `card_reward` 一样发送 `bridge-card-recommendation` 并 `resizePetWindow('card')`。`setCardRecommendation` 按 `task` 填标题和要点。

备选：单独休息面板。否决：视觉应与选牌一致，维护两套布局没有收益。

### 2. 气泡只留短句

休息处不再把 `reason` 拼进 `say()`。建议卡自己说「建议升级 X」或「建议回血」。`setRecommendation` 遇到 `rest_site` 时不再写长气泡。

### 3. 何时收起

`map.opened`、`combat.started`、`card.reward.closed` 仍清建议卡。`rest.opened` 只清 `task === 'card_reward'` 的旧卡，不清当前休息建议。

## Risks / Trade-offs

- [建议卡和攻略卡同时出现] → 休息处无战斗攻略，沿用现有互斥。
- [关闭建议卡后 Agent 仍持有 recommendation] → 与选牌相同：姿态可离开 advising，主面板仍可显示详情。

## Migration Plan

只改主进程广播和桌宠渲染。回滚这三个文件即可。

## Open Questions

无。
