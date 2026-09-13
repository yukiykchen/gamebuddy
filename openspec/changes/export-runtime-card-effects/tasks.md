## 1. 工具与协议

- [x] 1.1 将 `@fission-ai/openspec` 安装为项目本地开发依赖，并以 `node_modules/.bin/openspec --version` 确认版本为 1.13.0
- [x] 1.2 扩展卡牌协议校验与数据契约，覆盖运行时描述、描述来源、能量/X 费、星/X 星费；保留字符串卡牌和旧可选字段兼容分支并新增协议断言

## 2. Bridge 运行时采集

- [x] 2.1 扩展只读 `CardSnapshot`，优先采集格式化运行时效果与结构化费用，读取失败时安全降级；`harness/validate-mod.js` 已加入关键字段和容错逻辑标记
- [x] 2.2 奖励、完整牌组和战斗牌堆继续统一调用 `MapCards`，协议断言覆盖升级牌和特殊费用格式

## 3. Agent 与 Prompt

- [x] 3.1 实现实机字段优先、Codex 逐字段回退及来源/完整性标记；`harness/validate-agent.js` 已加入运行时覆盖目录、目录降级和缺失数据断言
- [x] 3.2 候选牌与完整牌组向 LLM 传入效果、升级状态、结构化费用、来源和完整性，并更新系统提示禁止臆测；已加入 Prompt 捕获断言

## 4. 验证与交付

- [x] 4.1 运行 `node_modules/.bin/openspec validate export-runtime-card-effects --strict` 并修复规范错误
- [ ] 4.2 运行最小相关校验 `node harness/validate-mod.js`、`node harness/validate-protocol.js`、`node harness/validate-agent.js` 并记录结果
- [x] 4.3 更新 `docs/data-contract.md`、启动指南和 Mod 安装提示，说明新增字段、降级语义及重新构建要求
