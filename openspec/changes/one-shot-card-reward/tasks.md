## 1. Orchestrator 同签名只发布一次

- [x] 1.1 调整 `consider`：`card_reward` 在已有同签名合法建议时，自动 `force` 不得再开新的规则/LLM 请求，并返回已发布结果。用 `harness/validate-agent.js` 覆盖「第一次发布后再次 force 不增加 LLM 调用、不二次 `onRecommendation`」
- [x] 1.2 主面板刷新仍可对同一奖励重算一次。测试断言只有带刷新意图的 consider 会发起第二次请求，且第二次也只发布一条结果

## 2. 主进程自动触发

- [x] 2.1 窗口 `did-finish-load` 与 `card.reward.opened`：已有同签名建议时只广播现有 recommendation，不再 `force` 重算。`npm run test:syntax` 通过

## 3. 验证

- [x] 3.1 运行 `npm run test:syntax` 与 `npm run harness:validate-agent` 并通过
- [x] 3.2 用 Demo 或 Replay 打开同一卡牌奖励两次（或模拟重复 opened）：桌宠只出现一次建议卡，思考结束后不再把主选择换成另一张牌或跳过
