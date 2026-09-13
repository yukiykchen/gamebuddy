## 1. 协议与 Mod 采集

- [x] 1.1 协议接受 `event.closed`，以及 `state.event.kind` 为 `ancient` 或 `event`。`node harness/validate-protocol.js` 覆盖佩尔三选一快照与 `event.closed`
- [x] 1.2 Mod 在事件房轮询可见选项写入 `state.event`（遗物祝福用遗物名和效果；`kind` 区分 Ancient）。对话期允许空 options。导出源码含 `EventRoom`、`NEventRoom`、`NEventOptionButton`、`event.opened`、`event.closed`。`node harness/validate-mod.js` 通过
- [x] 1.3 可选项出现发 `event.opened`，选项消失或离开事件房发 `event.closed`。更新 `docs/data-contract.md`。`node --check` 相关 JS 通过

## 2. Agent

- [x] 2.1 `selectTask`：有可选项则为 `event_choice`；事件房/Ancient 且尚无可选项时不得选 `map_route`。`node harness/validate-agent.js` 覆盖「佩尔三选一 + 地图分叉 → event_choice」以及「Ancient 无选项 + 分叉 → 不是 map_route」
- [x] 2.2 事件 LLM 只审可见未锁定选项，payload 含 kind、牌组、遗物、每回合能量；失败则规则保底。`node harness/validate-agent.js` 覆盖 LLM 选第二项与无 LLM 仍出推荐

## 3. 界面

- [x] 3.1 桌宠对 `event_choice` 走建议卡；思考文案为分析事件选项。`node --check src/pet.js` 通过
- [x] 3.2 主窗口展示事件选项与推荐；`event.closed` 清建议卡与思考态。`node --check src/renderer.js main.js` 通过

## 4. 验证

- [x] 4.1 运行 `npm run test:syntax`、`npm run test:agent`、`npm run harness:validate-all` 并通过
