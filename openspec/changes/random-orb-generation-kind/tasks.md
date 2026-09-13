## 1. 种类推导与提示

- [x] 1.1 从卡面/遗物文本推导 `orbGeneration`（random / lightning / frost / dark / plasma / unspecified）。化废为宝为 random，电击为 lightning。`node harness/validate-agent.js` 覆盖
- [x] 1.2 选牌 LLM 的 deck、relics、candidates 带 `orbGeneration`。系统提示：随机球是任意种类，不得因电击或破损核心写成只能闪电。`node harness/validate-agent.js` 覆盖 payload 与提示
- [x] 1.3 化废为宝知识库评价不再把「目标球类型不匹配」当作否决。选它作候选时 knowledgeEvaluation 不含该类语句

## 2. 验证

- [x] 2.1 运行 `npm run test:syntax`、`npm run test:agent`、`npm run harness:validate-all` 并通过
