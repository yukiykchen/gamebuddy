## Context

见 `proposal.md`。当前 Bridge 连续发送 `gamebuddy.state.v1` 状态和战斗/奖励/火堆等局部事件，但没有稳定 `runId`、明确整局结束事件或长期汇总。Electron 已在主进程使用 `app.getPath('userData')` 保存桌宠偏好；已有 `recordDecision` 写入工作目录 `runs/`，不适合面向玩家的安装版历史。四流派评分仅覆盖铁甲，不能作为全角色通用画像。

参考图的页面结构和视觉语言直接作为实现模板：黄色纹样背景、左侧单一主角色、右上五星图、右下蓝青数据区和纵向滚动。只替换为 GameBuddy 与《杀戮尖塔 2》的角色和对局数据，不复制其中的第三方角色与 Logo；页面不再增加设计说明、数据链路或副角色区。

## Goals / Non-Goals

**Goals:**

- 用最少且可验证的数据完成跨角色的本地玩法画像。
- 每一项百分比都能回溯到原始计数，未知数据不冒充零。
- 把铁甲流派成长接入最近一局复盘，但不让其他角色获得伪造流派标签。
- 即使断线、重连或应用崩溃，也不重复或损坏历史。
- 页面在 1120×720 最小窗口仍保持参考图的左右主结构。

**Non-Goals:**

- 不评价逐回合出牌是否最优，不建立敌人基准数据库。
- 不比较社区排名，不把倾向值解释成能力值。
- 不引入 SQLite、云账号、遥测或新的网络依赖。
- 不从游戏安装目录自动提取或重新分发角色美术。

## Decisions

### 1. 先补可靠对局事实，不用楼层回退猜结局

Bridge 为状态的 `run` 增加可选字段：

```text
runId, seed?, ascension?, startedAt?, playtimeSeconds?, result?
```

并新增事件：

```text
run.started { runId, character, ascension?, seed?, startedAt? }
run.ended   { runId, result, act, floor, playtimeSeconds? }
```

正常胜负由游戏运行时事实发布；同一 `runId + result` 只发布一次。关闭游戏时无法证明玩家主动放弃，因此不立即写 `abandoned`；下次出现不同 `runId` 时，主进程才把旧活动草稿归档为放弃。曾考虑用“楼层变小”推断新局，但每日挑战、重连和菜单快照都会造成误判，因此放弃。

为复盘补充或强化以下事实：

- `combat.started/ended`：`roomType`、敌人列表、胜负、回合数、开始/结束生命。
- 回合伤害：按同一回合敌人生命的可确认下降累计，保存本局 `maxTurnDamage`；无法观察的溢出伤害不猜测。
- Boss：持续保存地图计划的 `nextBossId/name`，实际进入 Boss 战后以最终遭遇的 Boss ID/name 覆盖。
- `card.played`：卡牌 ID、类型；只统计类型已知的打出。
- `card.reward.closed/selected`：明确拿取或跳过，未知结果单列。
- `rest.closed`：`HEAL`、`SMITH` 或 `UNKNOWN`。
- `shop.opened/closed`：进入次数、前后金币；只有能排除事件失金时才计 `goldSpent`。
- `room.entered`：节点 ID 与 `Monster/Elite/Boss/Shop/RestSite/Unknown` 类型。

### 2. 主进程维护一个版本化 JSON 仓库

文件位于：

```text
app.getPath('userData')/review-history.v1.json
```

结构如下：

```json
{
  "schema": "gamebuddy.review-history.v1",
  "updatedAt": 0,
  "activeRun": {
    "runId": "…",
    "startedAt": 0,
    "lastSeenAt": 0,
    "checkpoint": {}
  },
  "runs": []
}
```

每条完成记录保存：

```text
identity:
  runId, character, ascension?, seedHash?, startedAt, endedAt, result
progress:
  finalAct, finalFloor, playtimeSeconds?, progressPercent
finalState:
  hp, maxHp, gold, deck[], relics[], potions[], deckSize
  finalBossId?, finalBossName?, maxTurnDamage?
counters:
  combats, normalCombats, eliteEntries, eliteWins, bossEntries,
  typedCardsPlayed, attacksPlayed,
  cardRewards, cardsTaken, rewardSkips, unknownRewards,
  shopsVisited, knownGoldSpent, unknownShopClosures,
  restSites, smiths, heals, unknownRestActions,
  roomsByType
archetypes?:
  finalScores, peakScores, firstStartedFloor
```

只保存种子的 SHA-256 短哈希，不保存共享弹幕、LLM 输入输出、客户端 ID、API Key 或完整决策日志。每个有效事件或楼层变化后节流写活动草稿，最长 5 秒落盘一次；结束事件立即归档。写入采用同目录临时文件、`fsync` 后 rename，启动时若主文件损坏则尝试 `.bak`，仍失败就保留坏文件并显示恢复提示，不静默清空。

JSON 足以承载 100 局，易导出且不增加原生依赖。曾考虑 SQLite，但当前数据规模、查询复杂度和 Electron 打包成本都不值得。

### 3. 五星图统一表示“越高越常这样玩”

所有轴按全角色最近最多 50 局聚合，至少 3 局才绘制。聚合使用总分子/总分母，避免一局只有一次操作却与长局同权。每轴保留 `{ value, numerator, denominator, unknown }`。

#### 进攻出牌

```text
attackPlay = 100 × attacksPlayed / typedCardsPlayed
```

只统计类型已知的实际打出牌。它表示出牌结构偏进攻，不表示攻击牌打得正确。

#### 拿牌克制

```text
skipRate = rewardSkips / (rewardSkips + cardsTaken)
netGrowth = max(0, finalDeckSize - observedStartDeckSize)
compactness = clamp(1 - netGrowth / 25, 0, 1)
cardRestraint = 100 × (0.6 × skipRate + 0.4 × compactness)
```

奖励结果未知时不进入分母。选择 60/40 是因为“明确跳过”比起始卡组差异更能表达主动克制；最终页面同时显示平均牌组张数，防止单分数掩盖事实。

#### 精英挑战

```text
eliteShare = eliteEntries / (eliteEntries + normalCombats)
eliteChallenge = 100 × clamp(eliteShare / 0.30, 0, 1)
```

30% 战斗房为显示上限，只用于把常见区间铺满雷达，不表示最优路线。Boss 不进入分母。

#### 商店消费

```text
visitPart = clamp(shopsVisited / actsReached, 0, 1)
spendPart = knownGoldSpent / (knownGoldSpent + finalGold)
shopSpending = 100 × (0.5 × visitPart + 0.5 × spendPart)
```

没有可靠消费或结束金币时该部分未知；只知道其中一部分时，按已知部分归一，不把未知补零。

#### 火堆升级

```text
campUpgrade = 100 × smiths / (smiths + heals + otherKnownRestActions)
```

未知火堆行为不进分母。它表示更常升级还是回血，不表示升级一定正确。

轴值保留一位小数，绘图显示整数。详情抽屉展示公式、分子、分母、未知数和一句中性解释。

### 4. 近期统计条使用结果指标，不与倾向轴混为一谈

页面右下固定显示全角色最近最多 50 局：

- 胜率：`win / (win + loss)`；放弃单列，不进胜率分母。
- 平均到达进度：每局按章节起点与本章已走楼层映射到 0–99，胜利固定 100。
- 精英挑战率：有至少一次精英挑战的局数占比。
- 最多连胜：最近50局按时间排列的最长连续win段；失败或主动放弃中断，以次数展示。

每条同时显示百分比和 `分子/分母`；平均值显示“均值 · N局”。没有数据时显示“暂无”，不画 0% 蓝条。

### 5. 页面只展示一个主角色

统计窗口是全角色最近 50 局：

- 主角色：局数最多者；并列时最近使用者优先。
- 左上蓝色胶囊显示全窗口 `胜局 / 有结果局数`，旁边显示放弃数。
- 五星图和统计条汇总全角色最近最多50局；主角色仅用于偏好展示，不过滤统计。

角色素材使用可替换 provider：

1. `src/assets/review/characters/<character>.webp` 中由项目合法提供的专用图；
2. 对应 `src/assets/pets/<character>/advising.png`；
3. 带角色名和色块的占位。

第一版不自动读取游戏安装目录。这样 UI 可先完整落地，后续替换授权大图不影响数据和布局。

### 6. UI 复刻参考图结构，作为按需创建的“个人数据”窗口

应用启动时只创建桌宠与弹幕窗口，不再创建原有 `mainWindow`。桌宠和系统托盘右键菜单新增“个人数据”；点击后创建唯一 `reviewWindow`，直接加载轻量 `review.html`，不加载决策工作台、侧栏、推荐逻辑或 LLM 日志。重复点击聚焦已有窗口；用户关闭时销毁 `reviewWindow`，不隐藏在后台。旧工作台文件第一阶段保留用于回退，但不再由正常启动流程创建或暴露入口。

个人数据窗口保留独立 Electron 顶部标题栏用于拖动和关闭，主体直接使用全幅明亮布局：

- 背景：暖黄色底，叠加低对比度 GameBuddy 方脸重复纹样和浅色速度线。
- 左上：圆角蓝色大胶囊，黄色大号胜局数字、白色总局数。
- 左列约 48%：`主角色` 横条和占满左列主体的 4:5 大图框；不显示副角色。
- 右列约 52%：上半区五边形蓝色网格、蓝色外轮廓、青色半透明数据面；五个中文轴名环绕顶点。
- 右下：`最近的50场对局` 横条、三条蓝底/青色填充统计条与最多连胜数字、右侧蓝色滚动条；统计条下方直接接最近游戏记录。
- 最近记录每行固定显示角色头像/名称、`通关/未通关/放弃`、关底 Boss、最终楼层和最高单回合伤害；字段未知显示“未知”。
- 字体：使用现有系统中文字体；数字加粗，棕橙色标签，蓝/青仅用于数据图形。
- 动效：切换角色时数据面 180ms 过渡；尊重 `prefers-reduced-motion`，不做粒子或闪烁。

在 1120×720 使用左右 46/54 布局；宽度低于 900 时上下堆叠，但不改变信息顺序。视觉上不复用当前主工作台的深色面板，避免参考图风格被稀释。`review.html` 仅加载复盘专用脚本和样式，避免为了一个统计页创建完整客户端 renderer。

五星图使用原生 SVG，不引入图表库：五个同心多边形、五条轴线和一个数据多边形即可满足需求，便于测试坐标、无数据轴和辅助文本。

### 7. Renderer 只读，文件能力留在主进程

主进程负责仓库、聚合、导出和清空；preload 只暴露窄 IPC：

```text
review:getDashboard
review:export
review:clear
review:changed
```

Renderer 不接收任意文件路径，不直接访问 Node `fs`。导出通过系统保存对话框；清空必须由 renderer 二次确认后携带一次性确认 token 调用，避免误触。

## Risks / Trade-offs

- **[风险] 五星轴看起来像能力评级** → 标题固定写“玩法倾向”，轴详情和页脚明确“高低不代表优劣”。
- **[风险] 角色本身卡牌结构影响进攻出牌比例** → 当前按用户要求跨角色汇总，仅作为行为统计；后续风格图采用可比决策机会，避免直接把攻击牌占比当个性。
- **[风险] 商店金币差分混入事件失金** → 只有完整 shop open/close 区间且来源可确认时计消费，其余记 unknown。
- **[风险] 崩溃时拿不到 run.ended** → 活动草稿持续 checkpoint；新 `runId` 到来时归档旧局为 abandoned。
- **[风险] 放弃会拉低视觉战绩** → 胜率只用 win/loss，abandoned 独立显示。
- **[风险] 角色大图缺失影响参考图还原** → 预留固定画框和三层素材回退；专用授权图可后换，不阻塞功能。
- **[风险] 100 局完整牌表增大文件** → 只保留最终牌表和计数，不保存逐帧状态；预计文件保持在数 MB 内。
- **[风险] 协议升级影响旧 Mod** → 新字段保持可选，主进程没有 `runId` 时不写正式历史并显示“需要新版 Bridge”。

## Migration Plan

1. 先扩展协议和 Replay fixtures，旧状态继续通过验证。
2. 增加本地仓库并只记录活动草稿，在隐藏开发入口核对重复/恢复。
3. 开启完成记录和聚合器，用固定 fixtures 校验五轴分子分母。
4. 接入复盘页和角色切换，完成 1120×720、宽屏及窄屏截图验收。
5. 最后开放导出/清空并在真实胜利、死亡、重连和新局替代场景验收。
6. 回滚时隐藏复盘入口并停止写入；保留 JSON 文件，后续恢复不会丢历史。

## 本轮口径修正

先按endedAt稳定降序取50局，再统一大小写计主角色；主角色并列最近优先，mainCharacterSampleSize独立于全体sampleSize。弃局的已观测行为保留，但winRate仅win/loss。摘要保存endReason，历史重投影只能读取本地有效事实且保留缺少事实的旧条目。

Abandon增加前置标记与异常清理，嵌套OnEnded读取放弃上下文；postfix维持原有完成时机。结果分类使用纯C#状态组件进行顺序测试。五星图缺维度时提示具体缺失，不再在满3局后显示“再完成0局”。新风格五维仅形成设计文档，不在本轮替换现有公式。

## 近期统计精简

本轮用户进一步指定近期统计仅保留通关率、平均进度、精英挑战，删除20张内牌组与火堆升级，再加最近50局最多连胜。连胜以结束时间顺序读取，主动放弃、失败、未知结果都会断开；以“X连胜”数字呈现，不画百分比条。此调整针对截图中的近期统计条，不擅自替换尚待讨论的五维风格图公式。
