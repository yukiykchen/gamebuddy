## Context

见 `proposal.md`。当前铁甲评分在 `agent/knowledge/ironclad-archetypes.js` 的 `scoreOneDetailed`：轴覆盖经饱和曲线得到 `blueprintScore`，核心闭环未闭合时 `raw = min(59, blueprintScore)`，闭合后从 60 重映射。选牌影响把这个 `raw` 当成前后分，并有“四舍五入后首个组件至少 +1”的修正。桌面 `src/archetype-ui.js` 与游戏内奖励 overlay 用 `unformed/started/formed` 和 60/85 分表达阶段。

弹幕导演在 `agent/danmaku/director.js` 按 `displayPriority` 出队：推荐 6、怪物技能 5、带 moment 的 AI 4、其余 2。AI 人格由 `DanmakuBridgeAdapter` 每 15 秒生成最多 2 条，`main.js` 的模型超时为 60 秒。非推荐、非技能的内容键目前按文案去重。商店快照在 `BuildShopSnapshot` 里跳过未存货商品并重编 `index`。奖励与商店的 decision id 只进 fact，没有进桥接事件。

可靠配置只有铁甲四套矩阵和 `CONFIG`。Codex 遗物有 `STRIKE_DUMMY`、`BAG_OF_PREPARATION`、`CHARONS_ASHES`、`VAJRA`、`GIRYA`、`ANCHOR`、`ORICHALCUM`。`PAPER_MONEY` 与 `CALIPERS` 不在 Codex 中。

## Goals / Non-Goals

**Goals:**

- 用同一套评估函数产出准备度、运转状态、已有/缺失功能，以及选牌前后增量。
- 用集中配置驱动关键组件提醒，并接入现有弹幕队列。
- 用机会加对象做去重，播出前按最新牌组、金币和库存复核。

**Non-Goals:**

- 不改 `agent/tasks/card-reward.js` 和商店推荐的排序。
- 不为铁甲以外角色补知识。
- 不新增第二条 AI 生成循环，不用模型判断关键性。

## Decisions

### 1. 准备度单独计算，不改名展示 blueprintScore

`blueprintScore` 保留为诊断值。自动打击轴权重合计 90，其余三套为 100；setup、协同和遗物另加，反协同再扣，所以它不是可直接给玩家看的准备度。

继续复用现有权重、条件系数、结构系数和饱和曲线：

```text
coveragePart = clamp(90 × 各轴饱和覆盖之和 / 各轴权重之和, 0, 90)
synergyPart = bonusCapacity > 0
  ? clamp(10 × (setupCompletion + synergyCompletion + relevantRelics) / bonusCapacity, 0, 10)
  : 0
readiness = round(clamp(coveragePart + synergyPart - clamp(antiSynergy, 0, 15), 0, 100))
```

`bonusCapacity` 是 `setupMax`、各 synergy 上限与已配置遗物分值之和。闭环是否闭合不参与截断或抬分。对外 `score` 暂时等于 `readiness`，避免旧字段突然消失。候选增量是 `round(after) - round(before)`，去掉强制 ±1。

备选是直接展示未封顶的 `blueprintScore`。它会让四套流派的满分口径不一致，并让反协同和额外加分主导观感，因此不采用。

### 2. 运转状态看功能，不看分数

状态 id：`missing_starter`、`incomplete_loop`、`operational`、`stable`。功能存在必须是正权重且生效条件成立。

- 自动打击：启动 `auto_gate`；可运转为启动加上 `auto_loop`、`auto_payoff`、`auto_ammo` 之一；稳定为四项都有且理想汇合率至少 0.60。
- 消耗：启动为 `exhaust_pain` 或 `exhaust_draw`；可运转再加 `exhaust_outlet` 或 `exhaust_event`；稳定为疼痛、抽牌、出口都有，且事件或兑现至少一种，汇合率至少 0.60。
- 力量：启动为生效的 `strength_source`；可运转再加 `strength_multihit` 或 `strength_balance`；稳定再加 `strength_throughput`，汇合率至少 0.60。`DOMINATE` 只有 `strength_vulnerable_package` 成立才算来源。
- 格挡：启动 `block_gate`；可运转和稳定都要求 `block_gate`、`block_conversion`、`block_source`，稳定另要汇合率至少 0.60。

展示文案：尚缺启动组件；已有启动，闭环尚未齐备；可以运转；稳定成型。已有配套时附加“已有部分配套”。

旧阶段映射：前两态 `unformed`，`operational` 为 `started`，`stable` 为 `formed`。玩家可见主文案使用准备度和新状态。里程碑只在确认拿牌且状态向上变化时触发。

### 3. 关键组件配置与矩阵分工

新文件 `agent/knowledge/archetype-key-components.js` 是提醒的唯一牌表和文案模板。它记录角色、流派、稳定 ID、类型（`starter`、`core_synergy`、`ordinary_support`）、功能 id、替代组、生效条件、重复策略和模板。

启动与核心协同写明 ID。普通配套不逐张抄进提醒表：矩阵里其余正权重配套默认不播报。测试要断言配置中的每张卡都在矩阵对应功能上，每件遗物都在 Codex 中。`PAPER_MONEY`、`CALIPERS` 不进入提醒。`ANCHOR`、`ORICHALCUM` 即使留在评分里，也标为普通增强，不发关键弹幕。

重复策略：同一替代组有效量已达配置上限，或边际准备度不再增加时，不再使用务必拿下。消耗流的疼痛和抽牌是两个启动功能，有一个不等于另一个已足够。

### 4. 提醒级别

模板放在配置中，名称来自当前卡牌、遗物或 Codex，不来自模型。

- `must_take`：当前方向缺少的启动，或补齐最小闭环；对象在售或可选，且商店价格已确认并可支付。
- `focus`：关键协同或能改善已有闭环的关键遗物。
- `direction`：其他流派启动牌，但当前没有该流派配套。
- `unaffordable`：价格高于金币。
- `price_unknown`：价格为空。

一次商店库存变化最多一条合并弹幕、最多两个对象。排序：补齐闭环、补启动、关键遗物、稳定性。各自买得起但总价超过金币时，只允许排序第一的对象使用务必拿下，并说明当前只能优先其一。

### 5. 弹幕接入

在 `DanmakuBridgeAdapter` 增加确定性入口，由 `main.js` 在 `card.reward.opened`、真实事件选牌、`shop.opened`、`shop.updated` 时调用。`selected`、`closed`、商品消失和场景切换时撤销未展示项。

导演为 `key_component` 设置 `displayPriority = 7`，因此先于普通 AI。怪物技能和推荐仍留在队列里，不被丢弃。内容键使用机会加对象，不用文案：

```text
key:{runId}:{opportunityKey}:{objectKey}
```

未展示时按该键更新文案、金币和级别；已展示则记 presented，不重播；失效则从队列删除。`tick` 前用最新牌组、遗物、库存和金币再判断一次。

不调用 `DanmakuLlmAtmosphere`。人物口吻只做配置模板，不改事实。保持 `aiIntervalMs = 15000`、每次 `count: 2`、`timeoutMs: 60000`。

### 6. 机会身份

奖励桥接事件增加 `opportunityId`，取现有 `_activeRewardDecisionId`。去重优先：

```text
{runId}:reward:{opportunityId}:card:{cardId}:{upgraded}
```

没有该字段时退回 `runId + act + floor/totalFloor + coord/room + signature`。只处理当前 `card.reward.opened` 中已揭晓、带稳定 id 和名称的牌。事件里真正打开选牌屏时走同一路径；`source` 应按房间写成 `combat` 或 `event`，但资格不依赖这几个字。

商店桥接事件增加 `visitId`（现有 `_activeShopDecisionId`）和 `stockKey`。`stockKey` 用原始集合类型加过滤前槽位，例如 `card:3`、`relic:1`，售出前项后不得重编。去重为 `{runId}:shop:{visitId}:{stockKey}`。金币和价格不进入键。

## Risks / Trade-offs

- [风险] 旧客户端只认 `unformed/started/formed` → 保留旧字段，同时新增状态字段；可见文案改走新状态。
- [风险] 准备度与旧 60 分爽感不同 → 用状态变化和已有/缺失功能说明，不用跳分。
- [风险] 商店 `index` 漂移造成售出后错去重 → 先补 `stockKey`，否则同一访问内不能只靠 index。
- [风险] 关键提醒和推荐文案同时出现 → 只调整出队优先级，不改推荐结果；战斗中怪物技能仍会随后播出。
- [风险] 配置与矩阵漂移 → 测试锁定 ID、功能和 Codex 名称。

## Migration Plan

先改评估与协议，再改桌面和游戏内文案，然后接弹幕。回滚时恢复 59 分封顶会重新引入分数不涨，不作为兼容行为保留。旧回放若缺少新字段，校验器对历史夹具保持可解码，新产出的铁甲候选影响必须带上准备度、状态和功能列表。

## Open Questions

无。角色口吻已决定为本地模板，不留给模型临场发挥。

## 商店修复及通知边界修订

C#商店删牌服务省略库存键时实际序列化为stockKey:null，JS校验需将其视为缺省，避免整包商店失败。快照中的shop也可建立当前关键机会，解决已经在商店内重连时没有新opened事件的漏报。当前库存/金币更新、已售出及离场必须撤销未显示提醒。

用户明确取消推荐复述弹幕：普通选牌/商店/路线等推荐保留面板与桌宠，不能再进入弹幕队列；系统机会通知只播已确认关键卡牌和遗物。人格闲谈和怪物技能介绍保持。旧文档关于普通推荐弹幕仍播放的要求由此取代。

真实渲染回放还暴露打击木偶被“伤害放大槽已由痛击填满、分差为0”错误拦掉。契合度变化不等于遗物是否有机制作用：已有打击牌且未持有木偶时按明确牌面配合提示，不伪造加分；持有后仍抑制。
