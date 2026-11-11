# GameBuddy 数据埋点与产品度量设计

## 1. 文档目标

本文回答三个问题：

1. GameBuddy 当前已经记录了哪些数据，这些数据能否作为产品埋点使用。
2. 为了完善桌宠建议、流派度、个人数据和共享弹幕，还缺哪些事件。
3. 如何在不上传完整牌组、提示词和玩家隐私的前提下，形成可用于产品决策的数据闭环。

本设计只定义埋点，不代表立即上传任何现有本地数据。正式接入远端前必须提供明确授权、关闭入口和删除能力。

## 2. 核心判断

GameBuddy 当前“有很多数据”，但“没有产品埋点系统”。

现有数据主要用于运行功能和本地调试：

- Mod Bridge 通过本地 WebSocket 持续发送游戏状态和生命周期事件。
- `review-history.v1.json` 在本机保存最近 100 局，用于个人数据页面。
- `runs/<runId>/decisions.jsonl` 在项目工作目录记录完整建议结果，主要用于开发调试。
- LLM 输入、输出和耗时保存在内存日志并输出到控制台。
- 共享弹幕 Worker 在云端保存弹幕内容、场景、匿名作者哈希和展示/举报计数。

这些数据缺少统一事件模型、授权状态、安装会话身份、可靠上传、失败重试、版本控制和查询口径，因此不能直接回答：

- 有多少玩家成功连接游戏？
- 哪一步最容易失败？
- 哪类建议真正被看到、采用或忽略？
- 流派度是否帮助玩家更早完成构筑？
- 个人数据页面是否值得保留？
- 哪些弹幕场景有内容、哪些场景长期空白？

## 3. 产品目标与北极星指标

GameBuddy 的目标不是单纯帮助玩家赢，而是帮助玩家理解并完成一套能运转的卡组构筑。

第一阶段建议使用以下核心指标：

### 3.1 北极星指标：流派启动局率

```text
流派启动局率 =
数据完整且已结束的适用对局中，至少一个流派首次达到 60 分的对局数
/
数据完整且已结束的适用对局数
```

当前只对铁甲战士四流派生效；扩展其他角色后再形成全角色指标。

这个指标比胜率更接近产品目标，但不能单独优化。必须同时观察：

- 首次达到 60 分的楼层分布。
- 最终流派分和本局峰值。
- 最终牌组厚度。
- 最终楼层和通关结果。
- 玩家是否为了追分拿了不适合当前局面的牌。

### 3.2 质量指标

- Bridge 激活率：启动 GameBuddy 后成功进入 `LIVE` 的会话比例。
- 建议覆盖率：存在合法决策场景时，成功生成建议的比例。
- 建议可见率：生成的建议中，真正进入桌宠可见状态的比例。
- 建议结果一致率：可以客观确认玩家选择时，玩家实际选择与首选一致的比例。
- 建议延迟：从场景可决策到建议可见的 P50/P95。
- 数据完整率：结束对局中，关键字段达到最低完整度的比例。
- 个人数据回访率：完成对局后 7 天内打开“个人数据”的安装比例。

### 3.3 护栏指标

- 游戏内掉帧和 GameBuddy CPU/内存异常。
- Bridge `invalid`、`stale` 和重连频率。
- LLM 错误率、超时率和规则降级率。
- 错误建议举报或快速关闭比例。
- 共享弹幕举报率。
- 遥测关闭率和数据删除失败率。

胜率只能作为结果背景，不应成为建议算法的唯一目标。

## 4. 当前数据审计

### 4.1 Mod Bridge 状态与事件

位置：

- `mod/GameBuddyBridge/Scripts/GameBuddyExporter.cs`
- `harness/protocol.js`
- `harness/observation-store.js`

已有：

- 对局身份、角色、幕数、楼层、房间和 Boss。
- 生命、金币、牌组、遗物和药水。
- 战斗回合、敌人、意图和牌堆。
- 开局、战斗、地图、休息处、事件、商店和选牌奖励事件。
- 最高单回合可观测伤害。

适合成为埋点的数据源，但不应原样上传完整状态。

当前缺口：

- `card.played` 仍未可靠接入，进攻出牌轴可能长期缺数据。
- 选牌奖励关闭尚不能在所有路径稳定区分“跳过”和“未知”。
- 商店消费只有部分场景能确定，不能把未知当作 0。
- `run.ended` 的胜利、失败和放弃仍需实机验证。
- 生命周期事件缺少统一的数据完整度标记。

### 4.2 本地个人数据历史

位置：`review/service.js`

已有：

- 活动对局草稿。
- 最近 100 局归档。
- 五轴玩法倾向。
- 胜负、楼层、Boss、最高单回合伤害。
- 原子写入和备份恢复。

它是最适合生成“本地聚合埋点”的来源。建议只上传聚合后的数值和桶，不上传完整牌组、完整遗物列表或逐帧状态。

### 4.3 决策日志

位置：`agent/recorder.js`

当前 `runmate.decision_log.v1` 会把建议标题、摘要和完整 payload 写入 `runs/<runId>/decisions.jsonl`。

问题：

- 路径位于工作目录，不适合作为安装版长期数据。
- payload 可能包含完整牌组、候选和详细推理上下文。
- 没有保留期限和清理策略。
- 没有授权状态。

结论：它只能继续作为本地开发诊断日志，不能直接上传为产品埋点。

### 4.4 LLM 调试日志

位置：

- `agent/llm/openai.js`
- `main.js` 的 `publishLlmLog`

已有：

- 模型、任务、请求阶段和耗时。
- 完整系统提示、输入和原始输出。
- API Key 会被替换，但游戏上下文仍可能非常完整。

结论：

- 可以埋模型名、任务、耗时、HTTP 状态、错误码、是否规则降级。
- 禁止上传系统提示、完整输入、完整输出和玩家 API Key。

### 4.5 共享弹幕云端数据

位置：

- `agent/danmaku/shared-client.js`
- `shared-danmaku/worker/src/index.js`
- `shared-danmaku/worker/schema.sql`

云端已有：

- 场景键、阶段、角色、游戏版本和弹幕文本。
- 经盐哈希的随机客户端 ID。
- 创建日期、展示次数、举报次数和状态。

这是一套用户内容服务，不是产品分析平台。不得复用其 `clientId` 或作者哈希作为遥测安装身份。

现有 `served_count` 表示服务端返回次数，不等于弹幕在玩家屏幕上的真实曝光次数。

### 4.6 控制台与运行状态

当前 Bridge、Agent、LLM 和弹幕错误主要通过 `console.log/warn/error` 输出。

这些日志对单机诊断有帮助，但无法形成跨版本错误率、漏斗和趋势，也没有结构化错误码。

## 5. 建议的埋点架构

```text
Mod Bridge / Main / Pet / Personal Data / Shared Danmaku
                         |
                         v
                Telemetry.track(event)
                         |
              +----------+----------+
              |                     |
              v                     v
       本地聚合与调试队列       用户明确授权后
       userData/telemetry       批量上传 HTTPS
                                    |
                                    v
                             Telemetry Ingest
                                    |
                             分区存储与聚合
```

### 5.1 客户端组件

建议新增独立的遥测模块，而不是在各功能中直接调用 `fetch`：

- 统一校验事件名和字段。
- 默认只写本地聚合。
- 仅在用户授权后上传。
- 事件批量发送，每批最多 50 条或 64 KB。
- 失败后指数退避，最多保留 7 天。
- 队列上限建议 5 MB，超过后丢弃最旧事件。
- 应用退出前只做快速落盘，不阻塞退出。
- 所有埋点异常必须静默降级，不能影响桌宠、Bridge 和建议。

### 5.2 事件信封

每个事件使用统一结构：

```json
{
  "schema": "gamebuddy.telemetry.v1",
  "eventId": "随机 UUID",
  "eventName": "recommendation_completed",
  "eventVersion": 1,
  "timestamp": 1723370000000,
  "installId": "独立随机安装标识",
  "sessionId": "每次启动随机生成",
  "appVersion": "0.1.1-rc.1",
  "platform": "win32",
  "locale": "zh-CN",
  "consentVersion": 1,
  "properties": {}
}
```

约束：

- `installId` 不能复用共享弹幕 ID、设备序列号、Steam ID 或游戏账号。
- `sessionId` 每次启动重新生成。
- 对局只使用随机的 `runSessionId`；不上传原始 seed 和本地文件路径。
- 属性只接受白名单字段，不允许透传任意对象。
- 每个事件有独立版本，新增可选字段不改版本，修改语义才升级版本。

## 6. 第一阶段必须增加的事件（P0）

### 6.1 应用与桌宠

| 事件 | 触发时机 | 核心字段 | 用途 |
| --- | --- | --- | --- |
| `app_session_started` | 主进程准备完成 | `launchSource`、`appVersion`、`previousCrash` | 活跃会话、启动稳定性 |
| `pet_ready` | 桌宠首次可见 | `skinId`、`skinMode`、`startupMsBucket` | 桌宠是否真正启动 |
| `pet_menu_opened` | 右键桌宠 | 无或 `source=pet` | 右键入口发现率 |
| `personal_data_opened` | 个人数据窗口显示 | `source`、`historyCountBucket` | 页面使用价值 |
| `personal_data_closed` | 窗口销毁 | `visibleMsBucket` | 停留时长 |

不要记录桌宠在屏幕上的绝对坐标。

### 6.2 Bridge 连接与数据质量

| 事件 | 触发时机 | 核心字段 | 用途 |
| --- | --- | --- | --- |
| `bridge_connect_attempted` | 开始连接 | `attempt`、`mode` | 安装连接漏斗 |
| `bridge_status_changed` | 状态变化 | `from`、`to`、`reasonCode`、`elapsedMsBucket` | WAIT/LIVE/STALE/ERROR 分布 |
| `bridge_message_rejected` | 协议校验失败 | `reasonCode`、`messageType`、`bridgeVersion` | 版本兼容问题 |
| `bridge_reconnected` | 断开后恢复 LIVE | `downtimeMsBucket`、`attempts` | 稳定性 |
| `run_data_completeness` | 对局归档 | 各字段布尔值和 `completenessScore` | 判断指标是否可信 |

`bridge_message_rejected` 禁止附带原始消息。

### 6.3 对局生命周期

| 事件 | 触发时机 | 核心字段 | 用途 |
| --- | --- | --- | --- |
| `run_started` | 首次确认新局 | `runSessionId`、`character`、`ascensionBucket` | 对局基数 |
| `run_ended` | 对局归档 | `result`、`act`、`floorBucket`、`durationBucket`、`dataComplete` | 留存与结果背景 |
| `archetype_score_finalized` | 铁甲局归档 | 四流派最终分桶、峰值桶、首次启动楼层桶 | 流派系统效果 |
| `archetype_milestone_reached` | 首次 started/formed | `archetypeId`、`stage`、`floorBucket`、`scoreBucket` | 玩家爽点出现位置 |

分数建议按 10 分一档上传，不上传完整牌组来解释分数。

### 6.4 建议生命周期

每个任务统一使用一个 `recommendationId` 串联：

| 事件 | 触发时机 | 核心字段 | 用途 |
| --- | --- | --- | --- |
| `recommendation_requested` | Orchestrator 确认任务 | `task`、`trigger`、`fresh` | 需求量与覆盖基数 |
| `recommendation_completed` | 得到合法建议 | `task`、`source`、`latencyMsBucket`、`confidenceBucket` | 成功率与速度 |
| `recommendation_failed` | 规则或模型失败 | `task`、`stage`、`reasonCode`、`fallbackUsed` | 修复优先级 |
| `recommendation_presented` | 桌宠建议真正可见 | `task`、`source`、`presentation` | 生成不等于看到 |
| `recommendation_expanded` | 玩家展开详情 | `task`、`delayMsBucket` | 建议兴趣 |
| `recommendation_dismissed` | 玩家关闭建议 | `task`、`visibleMsBucket` | 打扰程度 |
| `recommendation_outcome_observed` | 游戏状态确认选择结果 | `task`、`match`、`outcomeKnown` | 建议一致率 |

`match=true` 只能表述为“玩家选择与首选一致”，不能表述为“建议导致玩家选择”。

可确认结果：

- 选牌：推荐卡 ID、实际卡 ID或跳过。
- 休息处：推荐 `HEAL/SMITH` 与实际动作。
- 路线：推荐入口节点与下一次实际进入节点。
- 事件：稳定 option ID 可用时比较；只有中文文案时标记低置信度。
- 商店：比较推荐清单中项目是否被购买；价格和库存未知时不判断。

## 7. 第二阶段事件（P1）

### 7.1 个人数据

| 事件 | 字段 | 用途 |
| --- | --- | --- |
| `personal_data_exported` | `historyCountBucket`、`result=success/cancel/error` | 判断导出价值 |
| `personal_data_clear_requested` | `historyCountBucket` | 清空意图 |
| `personal_data_cleared` | `confirmed`、`result` | 数据控制是否可用 |
| `radar_rendered` | `sampleSizeBucket`、`knownAxisCount` | 五星图可用率 |

取消清空不能记录为 `cleared`。

### 7.2 共享弹幕

| 事件 | 字段 | 用途 |
| --- | --- | --- |
| `shared_danmaku_fetch_completed` | `phase`、`result`、`itemCountBucket`、`latencyBucket` | 内容覆盖和服务质量 |
| `shared_danmaku_presented` | `phase`、`countBucket` | 真实曝光 |
| `shared_danmaku_submit_completed` | `phase`、`result`、`reasonCode` | 投稿转化与失败 |
| `shared_danmaku_reported` | `phase`、`result` | 内容安全 |

遥测事件不能包含弹幕文本、场景完整敌人列表或共享弹幕作者哈希。

### 7.3 LLM 与规则降级

| 事件 | 字段 | 用途 |
| --- | --- | --- |
| `decision_engine_completed` | `task`、`source=rules/llm`、`modelFamily`、`latencyBucket` | 规则和模型占比 |
| `decision_engine_fallback` | `task`、`reasonCode`、`from`、`to=rules` | 离线可用性 |
| `llm_request_failed` | `task`、`provider`、`modelFamily`、`statusClass`、`reasonCode` | 供应商质量 |

禁止上传提示词、输入 JSON、输出文本和 Authorization Header。

## 8. 第三阶段事件（P2）

只有 P0/P1 口径稳定后再增加：

- 进程内存区间、CPU 区间和 renderer 数量。
- 桌宠动画帧率和弹幕排队长度。
- 本地历史文件大小和恢复耗时。
- 各游戏版本/Bridge 版本的数据兼容率。
- 采样后的页面渲染耗时。

性能事件建议 1%–5% 会话采样，避免埋点本身增加负担。

## 9. 数据完整度模型

每局归档时生成以下布尔值：

```json
{
  "hasStableRunId": true,
  "hasExplicitResult": true,
  "hasCardPlayed": false,
  "hasRewardOutcomes": true,
  "hasShopSpend": false,
  "hasRestActions": true,
  "hasBoss": true,
  "hasMaxTurnDamage": true
}
```

建议定义：

```text
核心完整 = hasStableRunId && hasExplicitResult
流派完整 = 核心完整 && hasRewardOutcomes
五星完整 = 流派完整 && hasCardPlayed && hasShopSpend && hasRestActions
```

任何统计都要声明所需完整度。缺字段的对局进入 unknown，不得补成 0。

## 10. 产品分析漏斗

### 10.1 安装到激活

```text
app_session_started
  -> pet_ready
  -> bridge_connect_attempted
  -> bridge_status_changed(to=LIVE)
  -> run_started
  -> recommendation_presented
```

用于定位“程序启动了但没有产生价值”的环节。

### 10.2 构筑价值

```text
run_started
  -> card reward recommendation presented
  -> recommendation outcome observed
  -> archetype milestone started
  -> archetype milestone formed
  -> run_ended
  -> personal_data_opened
```

该漏斗不能证明因果，但可以发现：

- 哪类流派很少启动。
- 哪些关键卡建议经常被忽略。
- 启动是否普遍发生得太晚。
- 玩家成型后是否愿意查看个人数据。

### 10.3 建议质量

```text
recommendation_requested
  -> completed
  -> presented
  -> expanded/dismissed
  -> outcome_observed
```

按 `task`、`source`、角色、游戏版本和数据完整度切分。

## 11. 隐私与合规边界

### 11.1 默认策略

推荐默认仅本地统计。第一次准备上传时展示独立授权：

- 明确说明收集目的和字段类别。
- 默认不开启远端产品分析。
- 允许只开“匿名产品分析”，不绑定共享弹幕。
- 设置中可以随时关闭。
- 关闭后停止新增上传并清空待上传队列。
- 提供“删除云端匿名数据”，以 `installId` 授权删除。

### 11.2 永不上传

- API Key、Authorization Header。
- LLM 系统提示、完整输入和完整输出。
- 完整牌组、完整手牌、逐帧战斗状态。
- 原始游戏 seed。
- 玩家姓名、Steam ID、设备序列号和文件路径。
- 弹幕正文和用户输入文本。
- 崩溃日志中的任意原始对象转储。

### 11.3 仅授权后上传

- 随机安装 ID。
- 角色、任务类型和枚举型游戏行为。
- 分桶后的楼层、时长、分数、延迟和数量。
- 已知目录中的卡牌 ID，用于建议结果比较时仍建议先在本地转换成分类或哈希。

### 11.4 保留策略

- 客户端待上传队列：最多 7 天。
- 服务端原始事件：建议 90 天。
- 日级聚合：建议 13 个月。
- 删除请求：目标 7 天内完成。
- 共享弹幕内容继续使用独立的内容保留规则，不能与遥测混表。

## 12. 服务端最小设计

不要把产品埋点写入现有共享弹幕 D1 表。

建议独立入口：

```text
POST /v1/telemetry/batch
POST /v1/telemetry/delete
```

服务端职责：

- 校验 schema、事件白名单和字段类型。
- 限制单批大小、单安装速率和时间戳偏移。
- 丢弃未知属性，禁止任意 JSON 落库。
- 将接入日志与产品数据分开。
- 建立按日期、事件名和版本的分区。
- 保存删除索引，但不建立真实身份。

第一阶段可以使用 Cloudflare Worker + Analytics Engine 或独立 D1 数据库；事件量增大后再迁移列式分析存储。不要为了复用部署而把遥测耦合进共享弹幕业务逻辑。

## 13. 代码接入点

| 模块 | 建议埋点 |
| --- | --- |
| `main.js` | 会话、Bridge 状态、窗口打开关闭、个人数据操作 |
| `agent/orchestrator.js` | 建议请求、完成、失败、规则降级 |
| `main.js::publishRecommendation` | 建议真正发送给桌宠 |
| `src/pet.js` | 展开、关闭和右键菜单行为 |
| `review/service.js` | 对局结束、完整度、流派最终摘要 |
| `src/review-renderer.js` | 页面打开、导出、清空确认 |
| `agent/danmaku/shared-client.js` | 拉取、提交的结果码和延迟 |
| `agent/danmaku/bridge-adapter.js` | 共享弹幕真实展示数量 |
| `agent/llm/openai.js` | 请求结果、耗时和错误类别，不记录正文 |
| `GameBuddyExporter.cs` | 只负责提供事实；遥测尽量在 Electron 主进程聚合 |

不要让 Mod 直接访问遥测服务器。这样可以保持游戏接入层只连接本机，统一由 Electron 管理授权和上传。

## 14. 实施顺序

### 阶段 A：先保证口径，不上传

1. 定义 `gamebuddy.telemetry.v1` 和事件白名单。
2. 增加本地 `Telemetry.track()`、批处理队列和单元测试。
3. 接入 P0 事件，但只写本地开发输出。
4. 建立数据完整度模型。
5. 用 Replay 验证事件顺序、幂等和 unknown 处理。

### 阶段 B：授权与远端

1. 增加匿名产品分析授权和隐私说明。
2. 生成独立随机 `installId`。
3. 建立批量接收、删除和限流接口。
4. 默认关闭上传，用内测渠道验证事件量和字段。
5. 建立启动漏斗、Bridge 稳定性和建议质量看板。

### 阶段 C：优化功能

1. 根据 Bridge 错误分布优化安装和版本兼容。
2. 根据建议失败/延迟优化规则兜底和模型调用。
3. 根据流派启动楼层调整关键牌权重与启动反馈。
4. 根据个人数据回访和停留情况调整统计内容。
5. 根据弹幕覆盖率补充空白场景，而不是无差别增加文案。

## 15. 上线前验收

- 关闭遥测时没有任何遥测网络请求。
- 清空队列与删除接口均可验证。
- 重连、重复状态和窗口重复打开不会重复计数。
- Replay 的同一操作只产生一次事件。
- 所有错误使用有限枚举 `reasonCode`，不上传异常原文。
- unknown 不记为 false、0 或失败。
- 埋点失败不影响桌宠、建议、弹幕、个人数据和游戏。
- 文档中每个远端字段都能解释其产品用途。
- 服务端拒绝未注册事件和额外属性。

## 16. 推荐的第一批看板

第一批只做四个看板：

1. 激活漏斗：启动 → 桌宠显示 → Bridge LIVE → 开局 → 首条建议。
2. 稳定性：Bridge 状态、协议错误、LLM 错误、规则降级和建议延迟。
3. 构筑价值：流派启动率、首次启动楼层、最终分、峰值和结果背景。
4. 功能使用：个人数据打开/导出/清空，共享弹幕拉取/展示/投稿/举报。

先保证这四组数据可信，再扩展更细的卡牌和路线分析。
