## Why

GameBuddy 目前只会在地图上判断是否值得经过商店，进入商店后却看不到当前出售的卡牌、遗物和药水，也无法结合金币与后续威胁决定如何消费。玩家需要进店后一次得到完整、合法且不会超出预算的购物清单，而不是每购买一件再等待一次决策。

## What Changes

- Mod 从当前玩家的 `MerchantInventory` 读取全部仍在售的卡牌、遗物、药水及删牌服务，发送运行时实际价格、库存、可负担状态、升级状态和完整效果文本。
- 新增 `shop.opened`、`shop.updated`、`shop.closed` 生命周期，并在状态快照中保留当前商店；`shop.updated` 只刷新库存展示，不重新调用商店 Agent。
- 新增 `shop_choice` Agent：逐项分析对当前牌组的提升、遗物和药水协同、地图结构、已确定或可能的精英/Boss，并枚举预算内的购买组合。
- 规则层始终生成合法候选，包括“保留金币”；LLM 只能在给定候选中复核，不能发明商品、价格、机制或超预算方案。
- 建议以“一次性买什么”为主结论，并在详情展示完整购物清单、建议顺序、总花费、剩余金币、单件优缺点、威胁适配和不购买理由。
- 主面板和桌宠支持商店场景；关闭或离开商店后立即清理建议和思考状态。

## Non-goals

- 不自动点击购买、卖出、删牌或修改游戏状态。
- 不预测购买后由补货遗物产生的未知新商品。
- 不把目录价格范围当作当前商店的真实售价。
- 不在同一次商店访问中按单件购买结果反复调用 LLM 或改变原购物清单。

## Capabilities

### New Capabilities

- `shop-choice`: 读取真实商店库存，并根据牌组、预算、地图和后续遭遇给出购买优先级与预算计划。

### Modified Capabilities

- `game-bridge`: 增加商店快照和生命周期事件。
- `agent-decisions`: 增加 `shop_choice` 决策及合法候选边界。
- `pet-overlay`: 增加商店单句建议和按需展开的购买依据。

## Impact

- Mod 采集：`mod/GameBuddyBridge/Scripts/GameBuddyExporter.cs`
- 协议与 Replay：`harness/protocol.js`、`harness/replay-bridge.js`
- Agent：`agent/tasks/shop.js`、`agent/orchestrator.js`、`agent/recommendation.js`、`agent/llm/openai.js`
- 桌面端：`main.js`、`src/renderer.js`、`src/pet.js`
- 验证与文档：`harness/validate-protocol.js`、`harness/validate-agent.js`、README 和 `docs/`
