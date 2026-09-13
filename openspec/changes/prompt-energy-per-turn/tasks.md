## 1. Prompt 字段

- [x] 1.1 选牌与休息处 LLM payload 只传 `energyPerTurn` / `maxEnergy`，不传战斗残留 `energy`。`node harness/validate-agent.js` 用 energy=2、maxEnergy=3 的选牌快照断言 payload 费用为 3 且没有 `energy: 2`
- [x] 1.2 选牌系统提示写明按每回合能量判断卡费。`npm run test:syntax` 通过

## 2. 验证

- [x] 2.1 运行 `node harness/validate-agent.js` 并通过
