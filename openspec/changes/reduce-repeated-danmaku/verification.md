## Validation

2026-10-18，本次验证结果：

- `npm run test:danmaku`：46 项通过，覆盖重复文本、AI 缓存/在途请求、限流/回退、场景稳定、迟到结果及来源计数。
- `npm run test:danmaku-renderer`：通过。使用临时数据目录与实际 Electron/preload/renderer，四个合成来源各投递两次，只创建四个元素、确认四次；清空后计数不重置。测试占比是合成数据，不代表实际使用占比。
- `npm run test:syntax`：通过。
- `npm run test:agent`：4 项通过。
- `openspec validate reduce-repeated-danmaku --strict`：通过。
- `git diff --check`：通过。
- `npm run harness:validate-all`：未全部通过，停止于 `harness/validate-fact-replay.js:16` 的 durable 断言（false !== true）。失败涉及工作区并行新增的事实采集/回放代码，本次未修改这些实现。
- 对全量检查尚未执行到的相关已有检查单独验证：observation 8 项、combat-run/recorded-smoke/lifecycle 三份 Replay、Agent recommendation 82 项和 Mod shape 均通过。

## Limits

未连接真实游戏或真实模型，未测得生产 AI 占比，也未打包发布。当前新增的是应用会话内的 renderer 创建确认计数，应用重启清零。启用本次源码需要重启使用该源码的桌面端；已有安装包不会自动更新。

工作区存在另一组本地事实采集修改，涉及 main.js/package.json/Harness 等共享文件；本次仅维护弹幕相关改动，保留其他修改。
