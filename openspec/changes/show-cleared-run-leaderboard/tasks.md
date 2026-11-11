## 1. 榜单读取链路

- [x] 1.1 新增 `review/leaderboard-client.js`，校验三个筛选值并以 GET 请求现有 `/v1/leaderboard`，将成功、空结果、超时、网络、HTTP 和坏响应归一化；用新增 `review/leaderboard-client.test.js` 验证 URL 参数编码、请求头和各结果分支。
- [x] 1.2 在 `main.js` 创建榜单客户端并注册只投影 `character`、`ascension`、`gameMode` 的 `review:listLeaderboard`，在 `preload.js` 暴露同名窄桥接；用 mock handler/bridge 测试确认 renderer 不能传入任意 URL 或请求选项。

## 2. 通关榜视图

- [x] 2.1 在 `src/review-ui.js` 为个人数据页增加“通关榜”入口，并实现角色、进阶、模式筛选、排名摘要、观察用时、战斗内读档状态、牌组/遗物/事件详情以及 loading/empty/error 状态；扩展 `review/ui.test.js` 验证服务端顺序、时间格式、HTML 转义、空集合和 `playerId` 不可见。
- [x] 2.2 在 `src/review-renderer.js` 实现个人数据/通关榜双视图、默认 `ironclad/0/Standard` 首次查询、整数校验、显式提交、同条件重试、单项展开和迟到响应丢弃；扩展 `review/renderer-interactions.test.js` 验证打开/返回、无效进阶不请求、错误重试、竞态和键盘交互。
- [x] 2.3 在 `src/styles.css` 增加榜单筛选、排名、详情和状态样式及窄窗口规则，在 `src/review.html` 更新资源缓存版本；用 Electron smoke 在正常窗口和窄窗口确认信息可读、焦点可见且个人数据视图布局未回归。

## 3. 集成与回归

- [x] 3.1 更新 `harness/review-profile-renderer-smoke.js` 的榜单 IPC stub 与交互断言，并更新 `package.json` 将新客户端加入 `test:syntax`、新测试加入 `test:review`；运行 `npm run test:review-renderer` 验证真实 Electron preload/renderer 链路。
- [x] 3.2 运行 `npm run test:review`，确认榜单新增测试通过，同时现有通关上传、名字规则和 Worker 排序测试保持通过。
- [x] 3.3 运行 `npm run test:syntax` 和 `npx openspec validate show-cleared-run-leaderboard --strict`，并人工确认未修改 `shared-danmaku/worker/src/index.js`、`review/clear-upload-client.js`、通关判定、读档识别或显示名规则。
