## 1. 标签与协同

- [x] 1.1 增加状态标签推导（生成伤口/灼伤 vs 状态触发）。超频/强撑为生成，化废为宝为触发不是生成。可用 `node -e` 或 agent 测试断言
- [x] 1.2 选牌对状态触发候选按 `status_generate` 协同加分和写理由，不因球数量少否定。`node harness/validate-agent.js` 覆盖「超频+强撑牌组，化废为宝规则分高于 SKIP，理由含状态生成」
- [x] 1.3 知识同步脚本使用同一套标签规则。`node --check scripts/sync-card-evaluations.js` 通过

## 2. 模型输入

- [x] 2.1 选牌候选带触发说明；系统提示要求以卡面触发为准，不得把状态触发牌当成球体系。`npm run test:syntax` 通过

## 3. 验证

- [x] 3.1 运行 `npm run test:syntax` 与 `node harness/validate-agent.js` 并通过
