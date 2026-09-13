## 1. 协议与检测

- [x] 1.1 协议允许 `rest.closed`（含可选 `action`）。`node harness/validate-protocol.js` 通过
- [x] 1.2 观察存储在生命上升或卡牌新升级（上一帧是休息处）时写入 `rest.closed`；Mod 在休息 UI 结束时同样发送。`node harness/validate-observation.js` 或 agent 测试覆盖回血后的合成事件

## 2. 任务切换

- [x] 2.1 `selectTask`：休息选择完成后不再因 RestSite 格子返回 `rest_site`；有分叉则 `map_route`。`node harness/validate-agent.js` 覆盖「rest.opened → 回血 → 仍在 RestSite → map_route」
- [x] 2.2 `rest.closed` 清休息建议卡与主窗口休息页；`main.js` 对该事件 `force` consider。`npm run test:syntax` 通过
- [x] 2.3 主窗口 `showingRest` 只在当前建议是 `rest_site` 时成立

## 3. 验证

- [x] 3.1 运行 `npm run test:syntax`、`node harness/validate-agent.js`、`node harness/validate-protocol.js`、`node harness/validate-mod.js` 并通过
