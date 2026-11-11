## 1. Correct the summary

- [x] 1.1 在 `review/fact-service.js` 用累计楼层和未结束的最后战斗生成终局楼层与死因，并让 `review/service.js` 把结局类型传到面板。
- [x] 1.2 扩展 `review/fact-service.test.js`，覆盖换幕累计 39 层、死后显示猫头鹰法官、通关仍显示建筑师，以及放弃不写成死因。

## 2. Show the corrected fields

- [x] 2.1 在 `src/review-ui.js` 对死因使用“死于”，通关保持“关底 BOSS”。
- [x] 2.2 在 `GameBuddyExporter.PublishRunObservation` 写入 `totalFloor`。

## 3. Verify

- [x] 3.1 运行 `node review/fact-service.test.js` 和 `node review/ui.test.js`。
