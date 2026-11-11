## Why

当前战斗弹幕悬停已可用，但正文不对：入场飘机制杂句而不是怪物名；回血会被读成防御；B 站与 LLM 在事实波次里被关掉。玩家要的是认人、报下一招，并留下一点观战场氛围。

## What Changes

- 入场每个独特怪物名只出一条弹幕；同名多只合并。悬停给一两句 Codex 简介，不出现“档案/标签/资料”。
- 名字事实后跟 2–4 条氛围（B 站 + 职业兼容短句 + LLM），不恢复“进入战斗/战斗进行中”。
- 之后有可靠招式名则出 `小啃兽 · 哈气`，否则退回“将要攻击/防御/释放状态/回血”。同一招、同一类别不重复。
- 回血优先于防御：`HealIntent` 在场就报回血。
- 空闲约 20 秒且无新事实时，只补一波 LLM 氛围，不得编造新招式。
- 战士局不得出机宝口吻。

## Non-goals

- 不自动出牌、不点击、不改游戏状态。
- 不从 B 站或 LLM 推断机制、伤害或胜率。
- 不报血量、格挡、回合等游戏 UI 已有信息。
- 不把建议面板搬到弹幕正文。
- 不重做全屏覆盖层窗口。

## Capabilities

### New Capabilities

- （无）

### Modified Capabilities

- `battle-danmaku`: 入场名字 + 氛围；回合招式名或类别；空闲一波。
- `scene-language-danmaku`: 短简介与招式悬停；回血不塌成防御。
- `game-bridge`: 导出 `intentKinds`，保留原始 Intent 类型名。

## Impact

- `mod/GameBuddyBridge`、`gamebuddy.state.v1`、`agent/danmaku/`、相关测试
- 需重新编译并完整重启游戏
