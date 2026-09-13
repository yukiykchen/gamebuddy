## Why

选牌发生在战斗外，快照里的 `player.energy` 经常是上一场打完剩下的 1–2 点。模型把它当成「这局只有 2 费」，于是把 3 费牌判成打不出并建议跳过。玩家的最大能量其实是 3。

## What Changes

- 选牌、休息处送给 LLM 的费用字段只用每回合能量（`maxEnergy` / `energyPerTurn`），不再传战斗残留 `energy`。
- 选牌系统提示写明：判断卡费用每回合能量，不得把残留能量说成这局费用。

## Non-goals

- 不代打、不改游戏协议里的 `player.energy`（战斗 UI 仍显示当前回合能量）。
- 不禁止 SKIP，也不保证这次一定改拿某张牌。
- 不改规则评分公式。

## Capabilities

### New Capabilities

- （无）

### Modified Capabilities

- `agent-decisions`: 选牌/休息 LLM 输入用每回合能量，不用战斗残留能量。

## Impact

- `agent/tasks/card-reward.js`、`agent/tasks/rest.js`、`agent/llm/openai.js` 选牌提示。
- `harness/validate-agent.js`：残留 2 / 最大 3 时 payload 不含误导字段。
