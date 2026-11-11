## Context

见 `proposal.md`。现有 `src/review.html` 只有一个 `#review-root`，`review-ui.js` 负责纯 HTML，`review-renderer.js` 保存个人数据页交互状态并通过 `gamebuddyBridge` 调 IPC。`preload.js` 尚未暴露榜单读取能力。`main.js` 已创建通关上传客户端，但只注册了个人数据相关 IPC。

共享 Worker 已实现 `GET /v1/leaderboard`：三个查询参数 `character`、`ascension`、`gameMode` 缺一不可；返回 `{ items }`，并按 `observedDurationSeconds ASC, createdAt ASC, runId ASC` 排序。`review/clear-upload-client.js` 只负责 POST，不能直接用于读取。Worker 没有分页，当前会返回全部匹配记录。

## Goals / Non-Goals

**Goals:**

- 在同一个个人数据窗口内增加独立榜单视图，不新建 Electron 窗口。
- 复用共享服务地址、超时和客户端标识约定，但把榜单 GET 与上传 POST 分开实现。
- renderer 只能提交三个业务筛选值，不能控制 URL、method、headers 或任意网络目的地。
- 完整呈现现有响应中对玩家有意义的字段，同时隐藏 `playerId`。

**Non-Goals:**

- 不改变 Worker、数据库、上传客户端和上传触发流程。
- 不把本地最近对局自动转换成榜单筛选条件；本地 dashboard 当前不公开进阶和模式。
- 不增加分页、客户端排序、搜索、玩家聚合或“只看自己”。

## Decisions

### 1. 在现有 review root 内做双视图

`review-renderer.js` 增加 `personal | leaderboard` 视图状态；现有 `GameBuddyReviewUi.render` 保持个人数据渲染职责，另加榜单渲染函数。个人数据页 header 的操作区增加“通关榜”，榜单页提供“返回个人数据”。切换时不重新读取、不重置现有 dashboard、profile 或已展开的本地对局。

选择同窗双视图，是因为 `review.html`、窗口生命周期和 preload 已经完整服务于个人数据窗口；新建窗口会重复窗口管理和安全配置。`review.html` 只需更新资源版本标记（必要时更新静态标题），榜单主体仍由现有两个脚本生成。

### 2. 使用固定初始筛选并显式提交

筛选控件为：

- 角色下拉：`ironclad`、`silent`、`defect`、`regent`、`necrobinder`，界面显示现有中文角色名，查询发送小写标识。
- 进阶数字输入：整数，`min=0`、`max=10000`、`step=1`。
- 模式下拉：`Standard`、`Daily`、`Custom`，界面可显示中文说明但提交值保持原字符串。

首次打开立即用 `character=ironclad&ascension=0&gameMode=Standard` 查询。之后只有提交筛选表单才查询，避免每次输入变化都发送请求。查询串由 `URL`/`URLSearchParams` 编码，不手工拼接。

固定默认值比“取最近本地局”更稳妥：当前 dashboard 的 `recentRuns` 不含 `ascension` 和 `gameMode`，为自动推断而扩充本地数据契约会超出本增量。

### 3. 新增独立的只读榜单客户端

新增 `review/leaderboard-client.js`。它复用 `SharedDanmakuClient` 解析后的 `baseUrl`、`timeoutMs` 和 `clientId` 约定，实现 `list({ character, ascension, gameMode })`：

- 客户端先校验角色非空、进阶为 0–10000 整数、模式属于三个允许值。
- GET `${baseUrl}/v1/leaderboard`，带 `accept` 与 `x-gamebuddy-client`，使用现有 4 秒默认超时。
- 仅接受成功 HTTP 且 JSON 的 `items` 为数组；成功返回 `{ ok: true, items }`。
- 配置缺失、参数错误、超时、网络错误、HTTP 错误和响应结构错误返回稳定的 `{ ok: false, reason, status? }`，不向 renderer 抛出底层异常。

不向 `clear-upload-client.js` 增加 GET，以免把已稳定的上传职责和本次展示增量耦合，也避免误改上传测试。

`main.js` 创建榜单客户端并注册 `review:listLeaderboard`；handler 只接收并投影 `character`、`ascension`、`gameMode`。`preload.js` 仅暴露 `listLeaderboard(filters)`，renderer 不接触服务地址。

### 4. 榜单状态由 renderer 明确建模

controller 增加：

- 当前编辑筛选与最近一次已提交筛选；
- `idle/loading/success/empty/error` 状态；
- 当前 `items`、展开的榜单 `runId`；
- 单调请求序号，忽略较旧请求的迟到结果。

进入榜单触发首次请求；加载时禁用提交按钮并显示“正在读取通关榜…”。提交新条件时清空旧错误并开始新请求。失败后的“重试”使用最近一次已提交条件。返回个人数据后若请求完成，只更新缓存状态，不强制切回榜单。

### 5. 保持服务端顺序并安全呈现详情

榜单不排序，数组索引加一就是名次。摘要行显示：

- 名次；
- `displayName`（空值防御性回退为“匿名人士”）；
- `observedDurationSeconds` 格式化为 `HH:MM:SS`，不足一小时仍显示 `MM:SS`；
- `combatSaveLoad`：`true` 显示“有战斗内读档”，否则显示“无战斗内读档”。

筛选区已经说明角色、进阶和模式，因此不在每行重复。展开区显示终局牌组（id 与升级 `+`）、终局遗物 id、事件选择的 `eventId / pageId / optionId`；空数组分别显示“无记录”。所有来自响应的字符串沿用 `escapeHtml`。`playerId` 和 `runId` 不作为可见文本；`runId` 仅用于 DOM 状态键。

### 6. 具体文件范围

新增：

- `review/leaderboard-client.js`：只读查询客户端和参数/响应归一化。
- `review/leaderboard-client.test.js`：URL、参数、成功、空结果、超时、网络、HTTP 和坏响应测试。

编辑：

- `main.js`：创建客户端并增加窄 IPC handler。
- `preload.js`：暴露 `listLeaderboard`。
- `src/review-ui.js`：入口、筛选表单、榜单行、详情及各状态的纯渲染。
- `src/review-renderer.js`：双视图、查询状态、重试、过期响应和展开交互。
- `src/review.html`：更新脚本/样式缓存版本标记。
- `src/styles.css`：榜单布局、状态、可访问焦点及窄窗口样式。
- `review/ui.test.js`：可见字段、顺序、转义、隐藏 `playerId`、空/错状态。
- `review/renderer-interactions.test.js`：打开/返回、首次查询、提交、校验、重试、展开和竞态。
- `harness/review-profile-renderer-smoke.js`：Electron 环境下补齐 IPC stub，并验证榜单可打开和读取。
- `package.json`：把新客户端加入语法检查，把新测试加入 `test:review`。

`shared-danmaku/worker/src/index.js`、`shared-danmaku/worker/src/clears.test.js`、`review/clear-upload-client.js` 及其测试不改；它们只作为既有接口契约和回归测试运行。

## Risks / Trade-offs

- [接口当前无分页，大榜单可能生成较多 DOM] → 本增量忠实显示完整响应，不引入会改变接口的客户端截断；记录性能问题供后续分页增量处理。
- [角色大小写必须与已存记录一致] → UI 使用实际上传链路中的小写角色标识，不做不可靠的大小写混查。
- [快速连续请求可能由旧响应覆盖新响应] → renderer 用请求序号只接纳最后一次提交的结果。
- [服务端记录可能包含异常文本] → 所有动态文本统一 HTML 转义，数字和数组在展示前做防御性归一化。
- [共享服务不可用会影响榜单但不应影响个人数据] → 错误只保存在榜单状态中，返回个人数据仍使用既有本地 dashboard。

## Migration Plan

无需数据库迁移或 Worker 发布。桌面端可独立发布；回滚时移除榜单入口、IPC 和客户端即可，既有上传记录与共享服务不受影响。
