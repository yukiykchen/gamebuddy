## 1. Bridge 上报删牌选牌界面

- [x] 1.1 新增 `Scripts/CardRemovalPatches.cs`，在 `CardSelectCmd.FromDeckForRemoval` 上加 prefix：读取 `player` / `prefs` / `filter`，用 `IsRemovable` 加 filter 自行算出候选集合，候选为空或角色已死亡时不上报。反射读取失败只降级，不向游戏抛异常
- [x] 1.2 `GameBuddyExporter.BeginCardRemoval` 发布 `card.removal.opened`：候选牌数组（沿用 `MapCards`）、`minSelect`、`maxSelect`、`cancelable`、`promptTable`、`promptKey`、`inShop`、`candidateCount`
- [x] 1.3 在 `NCardGridSelectionScreen.AfterOverlayClosed` 加 postfix：仅当实例是 `NDeckCardSelectScreen` 且存在未完成的删牌上报时发 `card.removal.closed`
- [x] 1.4 `npm run mod:build` 通过（0 警告 0 错误），产物已复制到游戏 `mods\GameBuddyBridge`；按字节确认新 dll 内含 `card.removal.opened` 字符串与 `FromDeckForRemoval` 类型名

## 2. 协议与文档

- [x] 2.1 `docs/data-contract.md` 事件清单补 `card.removal.opened` / `card.removal.closed` 与载荷说明
- [x] 2.2 修正同文件中「玩家购买、删牌或金币变化后发送 `shop.updated`」的旧表述
- [x] 2.3 `harness/protocol.js` 新增 `validateRemoval` 并接入 `SUPPORTED_EVENTS`（否则事件会在入口被丢弃）；`harness/validate-protocol.js` 增加 1 条正例与 5 条反例；`harness/validate-mod.js` 增加新补丁文件与 7 个标记字符串
- [x] 2.4 `docs/feature-status.md` 增加「删牌建议」行并标注未验收

## 3. Agent 建议

- [x] 3.1 `agent/tasks/shop.js` 新增 `removeTargets(deck, count)`，`removeTarget` 改为薄封装，商店原调用点行为不变
- [x] 3.2 新增 `agent/tasks/card-removal.js`：`findCardRemoval`、`cardRemovalSignature`、`recommendCardRemoval`，张数取 `min(maxSelect, 候选数)`，重复同名牌按多张保留
- [x] 3.3 `agent/orchestrator.js`：`selectTask` 在 `findShop` 之前插入 `card_removal`，`signatureFor`、事件集合、关闭清除与一次性复用同步接入
- [x] 3.4 `main.js`：`card.removal.closed` 进入清除清单，`card.removal.opened` 进入 force 清单，同签名只发布一次；`src/pet.js` 增加删牌建议卡与思考文案
- [ ] 3.5 主面板（`src/renderer.js`）没有删牌视图，本次只在桌宠显示

## 4. 验证

- [x] 4.1 `npm run test:syntax`、`npm run harness:validate-agent`（新增 23 条 card_removal 断言，并验证删掉优先级分支后断言会失败）、`npm run harness:validate-protocol`（22 例）、`node harness/validate-mod.js`、`npm run harness:validate-all`、`npm run test:agent`、`npm run harness:smoke` 全部通过
- [x] 4.2 `openspec validate deck-removal-advice --strict` 通过
- [ ] 4.3 真机三类场景各跑一次：商店购买删牌、任一删牌事件、需删多张的遗物。确认桌宠给出具体牌名而不是路线建议
- [ ] 4.4 真机确认 `FromDeckForRemoval` 的 hook 实际触发（若被 JIT 内联则改用 prompt 的 `LocEntryKey` 判用途，并重跑 4.3）
- [ ] 4.5 真机确认异变与复制打开同一界面时不会收到删牌建议
