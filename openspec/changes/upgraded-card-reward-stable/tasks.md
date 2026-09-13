## 1. 数据合并与评分

- [x] 1.1 `resolveItem` 以实机 upgraded/cost/name 覆盖目录，并带上 upgradeDescription。名称以 + 结尾视为已升级。`node harness/validate-agent.js` 覆盖趁势打击+ 合并后 upgraded 为 true、描述为 13 点伤害
- [x] 1.2 选牌评分对升级牌使用升级描述；不得把未升级 F 档写成否决理由。LLM 候选含 upgraded、cost、升级描述。系统提示要求按升级后效果评价。`node harness/validate-agent.js` 覆盖升级牌 payload

## 2. 同一屏不因升级标记重算

- [x] 2.1 `cardRewardSignature` 只用卡 ID、canSkip、楼层。同 ID 后至的 upgraded 变化不得第二次 LLM。`node harness/validate-agent.js` 覆盖
- [x] 2.2 Mod 同 ID 优先 `IsUpgraded`。`node harness/validate-mod.js` 检查 `IsUpgraded` 分组标记

## 3. 验证

- [x] 3.1 运行 `npm run test:syntax`、`npm run test:agent`、`npm run harness:validate-all` 并通过
