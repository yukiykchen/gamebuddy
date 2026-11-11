## Context

见 `proposal.md` 的 Why。当前正文是 `小啃兽 · 哈气：获得2力量`，悬停摊开循环和每招；`src/danmaku.js` 用固定 `durationMs` 4200 删节点，`main.js` 的 `hideDanmakuAfter(6500)` 和新 generation 会整层清掉。`encounter-guide` 已能从机制标签和 `encounter-strategies.priorityTargets` 得到「优先处理谁」，弹幕没用上。

## Goals / Non-Goals

**Goals:**

- 正文只报名，悬停给短知识和时长。
- 飞出左缘才卸；悬停一条则全场停。
- 氛围去掉主持句，只留 B 站 / LLM。

**Non-Goals:**

- 不把遭遇攻略全文搬上弹幕。
- 不改 Mod 协议，不新开覆盖层窗口。

## Decisions

### 1. 正文与悬停拆开

正文：`{name}即将{moveName}`。未知招式才退回 `即将攻击/回血/防御`。悬停用 Codex 效果 + 时长：力量/敏捷 = 本场，格挡 = 本回合，说不清则只写效果。入场名悬停最多三行：循环、优先级、一条机制（如会成长）。不写遭遇名和每招伤害。

备选：继续把效果写进正文。否决，因为玩家明确要悬停才看效果。

### 2. 知识只复述已有结论

入场多目标时，额外一条事实取 `encounter-guide` 已算好的 `priorityTargets[0]` 或机制分（召唤/回复/成长/污染）。小啃兽有哈气叠力量，机制标签是成长，两条时可写「优先处理会成长的小啃兽」。不写该打哪张牌。

备选：把 dangers/tips/avoid 全飞出去。否决，和「不要写那么详细」冲突。

### 3. 主持句从目录拿掉

`catalog` 与 specialty 里含「小伙伴 / 陪你 / 观战席」的句子删除或拉黑。`appendAtmosphere` 只收 `bilibili` 与 `llm_atmosphere`。检索失败不再塞本地陪看句。

### 4. 飞行时间按距离算

布局后再量 `offsetWidth`。`duration = (itemWidth + overlayWidth) / 110px/s`，下限约 8s。`animation.onfinish` 才 `remove`。同场新消息不改 generation、不 `clearDanmaku`、不跑 `hideDanmakuAfter`。离场或断线才清。队列 `expiresAt` 拉到足够发出慢速条。

备选：继续固定 4.2s。否决，短句会停在半屏。

### 5. 全场暂停

覆盖层根节点在任意 `.danmaku-item` 的 `pointerenter` 加 `paused`，所有飞行 `pause()`；`pointerleave` 全员 `play()`。只有被悬停的那条显示详情。空白处仍鼠标穿透。

## Risks / Trade-offs

- [慢速后同屏条数变多] → 仍限制同时 5 条、错开车道，排队等飞完。
- [B 站 / LLM 失败画面变空] → 接受，不再用陪看句填空。
- [全场暂停挡阅读后续条] → 这是预期；离开即继续。
- [优先级像战术指挥] → 只复述知识库已有结论，不提具体卡牌。

## Migration Plan

改 Agent 文案、覆盖层动画和主进程清屏即可，无需重编译 Mod。回退：恢复旧正文和固定时长。

## Open Questions

无。时长映射不够的能力先写效果、不猜回合。
