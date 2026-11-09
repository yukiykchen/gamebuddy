# 对局记录与情境判定设计

日期：2026-10-26。状态：待实现。本文字段是拟议契约，不代表现有 Bridge 已采集；真实字段语义需在目标游戏版本验收。

## 1. 记录原则

以完整时序为中心，保存选择、动作、状态变化和结果。相同动作使用共同 ID；复杂效果只有能确认来源时才增加父子关联，不把构建完整因果图作为第一版前提。

每个事件保留原始来源顺序；墙上时钟只辅助定位。重启后的新 sourceSessionId 单独排序，用接收序号、会话边界及恢复记录建立时间线，不把跨来源毫秒相等或时间接近视为因果证据。

原始事件与快照为事实源；统计、对象轨迹、故事候选是可重新计算的投影。相邻事件足以发现值得查证的故事，精确收益归因还需来源或明确机制证据。

## 2. 公共事件信封

沿用 `gamebuddy.fact-event.v1`，按事件类型升级 `eventVersion` 并增加可选字段，兼容旧数据。新增事件、必需字段与版本兼容规则在实现前固化到协议 fixtures；不静默改变旧字段含义。

| 字段 | 含义与处理 |
| --- | --- |
| eventId / eventType / eventVersion | 稳定去重键、事件类型与该类型版本 |
| runId / combatId / attemptGeneration | 对局、战斗、尝试身份；非战斗 combatId 可空 |
| sourceSessionId / sourceSeq / sourceElapsedMs | 来源会话、递增序号、来源单调用时 |
| occurredAt / receivedAt / ingestSeq | 发生时间、主进程接收时间及本地接收总序号；接收顺序与发生顺序均保留 |
| location | act、totalFloor、roomId、nodeId；未知单列 |
| turn / side | 回合号、玩家/敌方行动阶段；不能只用整数回合区分双方 |
| decisionId / actionId | 同次选择或执行动作的共同身份 |
| parentActionId / triggerSource | 仅确认时填写；卡牌、遗物、状态、药水、召唤物等来源，不按时间猜 |
| contextSnapshotId | 兼容现有预留字段，用于主要上下文 |
| beforeSnapshotId / afterSnapshotId | 关联动作前、结算后快照；未完成结算明确标 pending/partial |
| payload | 类型特有字段 |
| quality | observationMethod、字段级 unknownFields/unknownReasons、覆盖范围 |

实际游戏版本、Mod 构建、协议版本放进采集会话头；状态、机制知识和生成任务均关联版本。硬编码的策略基线不能冒充当前实际游戏版本。

## 3. 状态快照

新增版本化本地快照契约 `gamebuddy.recap-snapshot.v1`。完整快照可由现有 appendSnapshot 基础能力扩展；接线与恢复读取必须一并实现。事件引用快照时，先可靠落盘快照，再提交完整关联记录，或使用可恢复提交标记；不能 ACK 后丢失被引用快照。

| 区域 | 字段 |
| --- | --- |
| identity | snapshotId、runId、combatId、attemptGeneration、sourceSeq、stateRevision |
| timing | 捕获时点、turn、side、actionId/decisionId、settlementStatus |
| player | entityInstanceId、hp/maxHp、block、energy/maxEnergy、stars/其他资源、状态层数及持续范围 |
| hand | combatCardInstanceId、originDeckCardInstanceId（已确认时）、modelId、升级/改造版本、费用、牌面、可用状态 |
| cardAvailability | playable: true/false/unknown、可选目标、不可用原因、判定来源；费用足够不等于可打 |
| cardZones | 手/抽/弃/消耗区的已知成员与数量、顺序可见性；隐藏顺序不得作为玩家已知信息 |
| items | 遗物及可观察计数、药水实例/槽位/可用状态/目标限制、容量 |
| enemies | entityInstanceId、modelId、名称、阵营、hp/maxHp、block、状态、存活/退出、Boss/阶段身份 |
| visibleIntent | 当时玩家可见的意图、已知数值、段数及目标；未知不可由后续行动反填 |
| choices | 真实候选、价格/资源门槛、锁定状态、可跳过/取消/回血/升级等条件 |
| visibility / quality | 字段当时是否可见、已知/未知、采集缺口和快照一致性 |

捕获时点：战斗开始、玩家回合开始、关键选择前后、动作执行开始前、动作结算后、结束回合前、敌方关键结算、战斗结束。高频小变化可记录增量，配合回合级完整快照；断线恢复重新建立锚点并标记缺口。

动作前快照应在游戏实际接受该动作、效果开始前捕获；after 快照在确认结算完成后捕获。若 Hook 时点不满足语义，就改名或标记部分完成，不能用事后快照冒充现场。

## 4. 身份设计

- 区分 cardModelId、永久牌组中的 deckCardInstanceId 和战斗中的 combatCardInstanceId。
- 战斗副本对应永久牌组实例时，显式记录 originDeckCardInstanceId。游戏不提供可靠关系时标 unknown，不靠同名匹配。
- 优先使用游戏稳定实例身份；必要时由 Mod 外部映射对象身份，不修改游戏逻辑。跨存读档的身份恢复必须验证，不能将重新生成的 ID 视为同一实例。
- 两张同名同升级牌无法区分时，可降级到“该牌型”的统计；不得断言刚升级的那一张未使用。
- 敌人保留实例、阵营、所属遭遇和阶段；同名多只、复活和召唤不共用单一名称键。快照只剩存活敌人时，历史身份不能消失。

## 5. 事件类型与 Payload

以下为需要补齐或规范的字段；复用现有事件，确有缺项才新增类型。

| 事件 | 最小数据及关联 |
| --- | --- |
| rest.options_offered | decisionId、beforeSnapshotId、真实动作/升级候选、限制；回血量已知时保留实际规则值和来源，估计值与实际结果分开 |
| rest.action_completed | 同一 decisionId、选择动作、升级实例、升级前后版本、直接生命/资源变化、afterSnapshotId；当前 offers/results 关联不全需补 |
| reward.offered/updated/resolved | decisionId、候选版本、每个真实候选、可跳过、实际拿取/跳过/未知、获得实例及结果快照 |
| route.offered/selected | decisionId、真实可达入口、当时可见地图、实际入口及选择前后资源 |
| shop.transaction_completed | shopVisitId/decisionId、交易动作、商品/删牌实例、实际价格、余额、前后快照 |
| event.option_selected/resolved | 事件/页面/选项身份、当时动态效果、直接结果、变化实例；随机结果未知时不猜 |
| deck.card_* / relic.* | 变化实例、前后版本、来源 decisionId/actionId、永久或本战/本回合范围 |
| card.drawn / card.moved / card.generated | 卡牌实例、来源/目标牌区、进入手牌原因、动作/触发来源、turn/side |
| card.played | 卡牌实例、实际目标、实际支付、动态费用、manual/auto、执行成功状态、前后快照；必要时增加 action.started/completed 以表达完整范围 |
| turn.ending / turn.ended | 结束前手牌、资源、可用状态、意图快照；玩家主动结束与强制结束分开；若新增 turn.ending 则明确兼容 |
| damage.resolved | hitId、来源/目标实例及阵营、actionId（确认时）、命中索引、目标前后hp/block、请求量、最终结算、实际扣血、吸收量、致死、伤害类别 |
| block.changed / heal.resolved | 对象、变化前后值、来源、实际变化与请求量；不能把治疗请求值等同实际恢复 |
| power.changed / resource.changed | 对象/资源/状态、前值、后值、变化量、有效期和来源 |
| potion.* | 实例/槽位、获得/使用/丢弃/替换、目标、当时是否可用、实际结果 |
| combat.started/ended | 遭遇、敌人身份、战斗前后快照、明确胜负/死亡/中断、最终阶段、完整度 |
| run.reload_observed（拟新增） | 游戏确认重载、runId、当前combatId可空、唯一观察ID/来源计数、发生时间、采集起点；不随尝试替换删除 |
| capture.* | 能力、字段/事件族、开始/结束/恢复、序号缺口及影响范围 |

玩家按下按钮但动作未执行，不写成成功使用。凡是类型声明存在但 Hook/真实值缺失，都在能力矩阵与字段质量中反映。

本次累计实际恢复投影只接受 `heal.resolved.payload.hpBefore/hpAfter` 的明确前后生命差，并要求 `targetSide` 或同战斗已确认实体阵营能确定玩家目标。旧的 `amount/currentHp` 不能替代前后差；当前Mod未保证采到这些新字段，故旧局及未验收采集继续显示未记录，不推算填值。

## 6. 伤害、护盾、SL 的固定口径

### 6.1 伤害

- requestedDamage：请求/初始量，不直接上屏冒充最终伤害。
- resolvedDamageBeforeHpCap：经过相关减免/格挡之后、受目标剩余生命上限截断之前的确定量；必须在目标游戏版本核实。
- actualHpLoss：目标实际生命损失。
- overkill：仅在语义明确、目标前生命和结算值已知时，取 max(0, resolvedDamageBeforeHpCap - targetHpBefore)。特殊限伤/免死机制不满足该式时标不支持。
- 10HP、最终结算9999、实际扣血10：单击值9999，过量9989，实际扣血爆发累计10。
- 最高回合实际爆发只累计同一玩家回合、玩家阵营对敌方的确认扣血；自损、受伤不混入。持续伤害和召唤物保留独立来源。
- 单次命中、单张牌多段合计、整回合伤害分别统计。“最高斩杀”限定致死命中，和最高单击分开保留。

### 6.2 护盾与危险

- 实际抗伤累计伤害结算中被玩家格挡吸收的量。
- 累计获得格挡、最高持有格挡、实际抗伤分开。
- 最危险战斗可包含已确认死亡；险胜只在胜利战斗内比较。首版用最低正生命比例、同值生命与承伤比例等可核实指标定位，再让模型判断是否有故事性。
- 记录不全时使用“已记录最高/最低”，不宣称全局纪录。

### 6.3 SL

按 run.reload_observed 的唯一观察计数，来源必须是游戏确认 Hook。与 combat.attempt_replaced 关联去重，一次重载不计两次。断线、应用重启、楼层回退不构成SL。

原始尝试保留为诊断记录，默认战绩视图只使用最后有效尝试；SL元信息跨尝试保留。若需调整现有清理策略，保持有效战绩语义兼容。

从开局完整采集显示“SL N次”；中途接入或有缺口显示“已记录SL N次”；旧布尔值可表达“有重载记录”，不能迁移为准确次数。

## 7. 情境证据矩阵

| 故事 | 必要证据 | 可以输出 | 缺证据时 |
| --- | --- | --- | --- |
| 升级后下一战死，牌未使用 | 升级实例、后续战斗、明确死亡、该实例整场出牌覆盖完整且次数0 | 升级了，却一次没来得及用 | 身份或覆盖不完整只说未记录到，或不选该片段 |
| 升级牌没上手 | 上述证据＋整场入手/抽牌/自动使用覆盖与去向 | 到倒下也未上手 | 不能以playCount=0推断drawCount=0 |
| 抽到时没能量 | 入手时间、资源、动态费用和其他限制 | 核心来了，能量已经花完 | 费用或可用性未知时不声称只差能量 |
| 能打却没打 | 当时手牌、可用性/目标、资源、手动结束、实际后果 | 错失一个值得检查的机会 | 不自动等同失误；收益更好需验证 |
| 药留到终局 | 药水身份、持有/使用完整记录、终局 | 药还在背包里 | 不因此断言用了就能赢 |
| 套路终于兑现 | 当时组件、实际触发、效果或结果 | 配合在这场真正用上了 | 只有组件时仅讲方向，不报贡献 |
| 9999打10血 | 已知最终结算、受击前生命、独立命中与致死 | 夸张过量 | 只有请求量不选该结论 |
| 一击终结Boss | Boss/阶段身份、独立致死命中、最终胜利 | Boss终结一击 | 满血秒杀还需满血及整场/阶段证据 |
| 确有斩杀未执行 | 现场快照、合法序列、受支持机制计算、实际行动和结果 | 当回合有已验证斩杀顺序 | 验证器不支持时不使用肯定反事实 |

负面事件可写得有幽默感，但不编造玩家动机；未使用可能来自未抽到、不可用或有合理取舍。普通“24血入场、4血离场”可作为背景，单独不足以成为高质量故事。

## 8. 完整度与零次证明

新增查询级 completeness：范围起止、所需事件族、字段有效率、连续覆盖、身份可靠度、是否截断、缺口列表。不能用 Hook 已安装代替整场完整。

“整场未使用”必须通过 subject 查询返回覆盖证明：开始结束都在记录内、当前有效尝试、出牌事件连续、实例可关联、无影响结论的缺口。分页是工具返回机制，计数在完整索引上计算；只有前十条事件时不得证明零次。

## 9. 存储与兼容

复用 userData 下事实JSONL，增加可靠快照、会话头、关联索引及重载元数据。索引可重建，首版不迁移全库、不引入新数据库或图引擎。旧版事件按缺失能力降级。

全量日志本地保存；模型只收到本次分析用的概览和工具读取片段。角色当时不可见的后续抽牌/随机结果可用于叙事描述，但不能放进“当时应该知道”的判断视图。
