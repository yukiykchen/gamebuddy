## Why

现有游戏内选牌浮层只显示自动打击流，四流派评分虽然已经计算完成，却被放在已废弃的桌面端，玩家在实际选牌时看不到。当前阶段需要把信息直接写到游戏内每张候选卡上。

## What Changes

- 扩展选牌影响消息，使每张可识别的铁甲候选牌同时携带自动打击、消耗引擎、力量叠加、格挡壁垒四个流派度增量。
- 将游戏内每张候选卡上方的单行自动打击标签改为固定四行流派度标签。
- 保持奖励签名、候选 ID 校验、刷新/关闭清理与鼠标穿透行为。
- 不再依赖桌面端四流派展示作为用户可见交付面。

## Capabilities

### New Capabilities

- `in-game-archetype-overlay`: 定义铁甲选牌时每张候选卡直接显示四个流派度增量的协议和游戏内浮层行为。

### Modified Capabilities

（无）

## Impact

- `main.js`、`agent/knowledge/auto-strike.js`：发送每张候选的四套增量。
- `mod/GameBuddyBridge/Scripts/GameBuddyRewardOverlay.cs`：解析并显示每卡四行。
- Harness、协议校验与 Mod 文档：覆盖四套数据、旧消息拒绝或兼容策略及布局。

## Non-goals

- 不展示主流派总览、当前四套总分或“最多两条”筛选。
- 不修改原有推荐排序、SKIP、推荐理由或评分权重。
- 不自动点击、选牌、出牌或修改游戏状态。
