# Tasks

- [x] 1. `shop.js` 新增 `isRemovableCard`，`removeTarget` 过滤永恒牌且保留原始 index。
- [x] 2. `combinations` 剔除没有可删目标的删牌服务，避免生成付了钱却删不了牌的方案。
- [x] 3. `event-rules.js` 的 `remove_cards` 按牌组可删张数给分，为 0 转负分并写 cons，牌组未知时保持原行为。
- [x] 4. 服务项 cons 文案区分「都是永恒牌」与「没有值得删的牌」。
- [x] 5. 验证：`node --check`、`npm run test:syntax`、`npm run test:agent`、`npm run harness:validate-all`，以及针对 7 张永恒牌的场景断言。

## 验收实测

事件侧（`analyzeOption`，文案 `移除1张牌。` / `移除2张牌。`）：

| 场景 | 结果 |
| --- | --- |
| 普通牌组 | score=14（与改动前一致） |
| 全永恒牌组 | score=-6，cons=`移除 1 张牌：牌组里的牌都是永恒牌，无法删除` |
| 只有 1 张可删但 offered 2 张 | score=14，pros=`移除 2 张牌（牌组里只有 1 张可以删除）` |
| 牌组字段缺失 | score=14（保持原行为） |

商店侧：

| 场景 | 结果 |
| --- | --- |
| 牌组含 GREED + 基础牌 | 删除目标=`STRIKE_IRONCLAD`（不再是贪婪） |
| 牌组全为 7 张永恒牌 | `removeTarget` 返回 null；服务不进入任何组合（含服务的组合数 0）；cons=`牌组里的牌都是永恒牌，删牌服务删不掉它们` |
| keywords 为英文串 `Eternal` 的卡 | 同样被排除（判定走 keywords_key） |

闸门：`node --check` 通过；`npm run test:syntax` PASS；`npm run test:agent` 4 pass 0 fail；`node harness/validate-all.js` 24 checks + Mod shape valid；`openspec validate fix-eternal-card-removal --strict` valid。
