## Validation

2026-10-18 验证记录：

- `npm run test:danmaku`：50 项通过，覆盖五角色与未知角色、两条输出、15 秒周期、同场慢响应、跨批、60 秒超时（含读取响应体）、外部场景取消、默认客户端 120 秒保持、技能独立输出与计数。
- `npm run test:syntax`、`npm run test:agent`（4 项）：通过。
- `npm run test:danmaku-renderer`：通过；真实 Electron/preload 创建五种来源的元素，重复投递仅确认一次，技能来源单独统计。合成数据占比不代表实际使用比例。
- `node harness/validate-agent.js`：82 项建议回归通过。
- `openspec validate character-danmaku-cadence --strict` 与 `git diff --check`：通过。
- `npm run harness:validate-all`：未全通过；停止于独立的 `fact store cases`，`facts/local-fact-store.test.js:114` 注入的 `simulated disk full` 在写入元数据路径抛出。该部分为工作区另一组事实采集修改，本次未修改或回退。

## Limits

未连接真实游戏或真实模型；人格请求与约束已接入，但模型实际措辞质量仍需实机体验评估。每批要求两句，格式无效或重复内容被过滤后可能少于两句。未打包、发布或重启用户运行中的应用；需重启使用这份源码的桌面端生效。
