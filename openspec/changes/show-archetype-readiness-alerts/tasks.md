## 1. 准备度与运转状态

- [x] 1.1 在 `agent/knowledge/ironclad-archetypes.js` 按 `design.md` 计算 `readiness`，取消 59 封顶和闭环后从 60 抬分；`score` 等于 `readiness`。用 `agent/tests/ironclad-archetypes.test.js` 验证：缺启动时未饱和配套仍能把准备度推过 59，重复同一功能收益递减且不能单靠堆叠到 100。
- [x] 1.2 按功能谓词输出 `missing_starter`、`incomplete_loop`、`operational`、`stable`，以及已有和缺失功能。条件未成立的牌不算启动。旧 `stage` 只做兼容映射。测试验证补齐地狱狂徒后状态变为可以运转，即使准备度仍低于 60。
- [x] 1.3 选牌前后分、增量、前后状态和补齐功能都走同一评估。增量等于前后准备度之差，去掉强制 ±1。扩展 `agent/tests/auto-strike.test.js` 或现有候选影响测试，断言三者一致。

## 2. 关键组件配置

- [x] 2.1 新增 `agent/knowledge/archetype-key-components.js`，集中铁甲四套流派的稳定 ID、类型、功能、替代组、生效条件、重复策略和文案模板。普通配套不进入提醒。`PAPER_MONEY` 与 `CALIPERS` 不播报。锚和奥利哈钢不算务必拿下的关键遗物。
- [x] 2.2 新增 `agent/tests/archetype-key-components.test.js`：配置 ID 都能在矩阵或 Codex 中找到；痛击等普通配套不是 `must_take`；已有足够启动时不再强推副本；其他流派且没有配套的启动牌使用可考虑方向的模板。

## 3. 弹幕提醒

- [x] 3.1 实现纯确定性的选牌与商店评估：只看当前可选或在售对象，排除预览、历史、已领取和未揭晓随机奖励。金币不足或价格为空时不用务必拿下。多件合计买不起时不暗示全买，一次最多合并两个对象。购买或拿牌确认后按实际牌组重算。
- [x] 3.2 在 `DanmakuDirector` 为 `key_component` 使用机会加对象的内容键和 `displayPriority` 7。未展示提醒可更新金币与库存，失效则丢弃，播出前再确认。已展示不因刷新、重渲染或 AI 评论重播。
- [x] 3.3 在 `DanmakuBridgeAdapter` 和 `main.js` 接入奖励、事件真实选牌和商店开关。不新增定时器或 LLM 调用。扩展 `agent/tests/danmaku.test.js` 与 `agent/tests/danmaku-experience.test.js`：重复刷新只播一次，事件选牌能触发，商店售出和离场丢掉未展示提醒，人格弹幕仍每 15 秒最多 2 条，怪物技能介绍仍会播放，无 API key 时关键提醒仍发出。

## 4. 协议与展示

- [x] 4.1 铁甲候选影响和当前构筑展示带上准备度、运转状态、已有/缺失功能；旧阶段字段保持可解码。奖励事件增加 `opportunityId`，商店事件增加 `visitId` 与过滤前的 `stockKey`，事件选牌的 `source` 能区分战斗和事件。更新 `harness/protocol.js`、Mod codec/exporter 和对应测试。
- [x] 4.2 桌面 `src/archetype-ui.js`、里程碑和游戏内奖励 overlay 展示“准备度”和运转状态，状态变化不靠跳分。只有确认拿牌造成状态上升才反馈。扩展 `agent/tests/archetype-ui.test.js`、`agent/tests/archetype-milestone.test.js` 和 Mod overlay 测试。

## 5. 验证

- [x] 5.1 运行 `npm run test:syntax`、`npm run test:agent` 和 `npm run harness:validate-all`，确认推荐排序测试仍然通过，且上述行为用例都在结果中。syntax 与 agent 通过，推荐用例 82 条通过；`harness:validate-all` 停在既有 Mod 标记 `OrderByDescending(card => card.IsUpgraded)`，该字符串在本次改动前的 exporter 里也不存在。


## 6. 商店兼容和通知修复
- [x] 6.1 复现Mod删牌服务的null stockKey导致商店整包拒绝，兼容缺失/null可选键，仍拒绝错误类型/重复索引/非法价格；验证推荐恢复。
- [x] 6.2 商店关键卡牌/遗物支持新鲜快照进入和重连，按机会对象去重，购买/离场撤销；与推荐链路独立。
- [x] 6.3 停止将各类普通推荐转为弹幕，保留面板/桌宠推荐以及人格、怪物技能与关键组件通知。
- [x] 6.4 运行协议、Agent、弹幕和真实renderer商店回放，更新记录，重启源码版应用。
