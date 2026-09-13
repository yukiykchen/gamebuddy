## Context

见 `proposal.md`。`recommendCardReward` 把 `state.player.energy` 和 `maxEnergy` 一起塞进 payload。战斗结束后 Mod 仍可能上报上一回合剩下的能量。模型读到 `energy: 2` 就写成「当前能量仅 2 点」。休息处 payload 同样传了 `energy`。

## Goals / Non-Goals

**Goals:** 选牌/休息 LLM 只看见每回合费用。

**Non-Goals:** 不改战斗出牌（那才该用当前能量）。

## Decisions

### 1. 删掉 out-of-combat payload 里的 `energy`

改传 `energyPerTurn` 与 `maxEnergy`，都取 `player.maxEnergy`。不另传残留值，避免模型再读错字段。

备选：两个都传并改名 `combatEnergyRemaining`。否决：选牌根本不需要残留能量。

### 2. 选牌系统提示补一句约束

「判断卡费和能否打出时只用 energyPerTurn/maxEnergy。选牌在战斗外，不得把上一场残留能量说成这局费用。」

## Risks / Trade-offs

- [已发布的错误 SKIP 不会自动改] → 点主窗口「刷新数据」或关奖励再开会重算。
- [模型仍可能胡说费用] → payload 不再提供 2 这个钩子，提示也写明。

## Migration Plan

只改 prompt。回滚恢复 `energy` 字段即可。

## Open Questions

无。
