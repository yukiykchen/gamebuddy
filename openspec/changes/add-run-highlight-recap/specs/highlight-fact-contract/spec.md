## Purpose

为简短高光提供可验证的伤害、格挡、危急程度、动作归因和单局 SL 数据，严格区分有效战绩与重打元数据。

## ADDED Requirements

### Requirement: Ordered contextual evidence

日志 SHALL 保留来源会话、来源序号、发生/接收时间、接收顺序及对局/战斗/回合/尝试范围。关键选择和动作 SHALL 关联已可靠落盘的前后状态，包含当时已知手牌、动态费用、资源、状态、目标和可选项；缺失与未完成结算 MUST 标明。相邻时间 MUST NOT 单独作为精确收益归因。

#### Scenario: Reconstruct a decision window
- **WHEN** Harness读取一条出牌事件前后的窗口
- **THEN** SHALL 能取得该动作对应的现场与结算状态，或明确缺失原因
- **AND** MUST NOT 将事后状态冒充动作前状态。

### Requirement: Reliable subject identity and absence evidence

系统 SHALL 区分卡牌模型、永久实例和战斗实例，已确认时记录来源关系。整场未使用/未上手等负面事实 SHALL 附带查询范围、连续覆盖和身份可靠度。次数为0但存在影响结论的缺口时，MUST NOT 断言从未发生。

#### Scenario: Same-name copy was played
- **WHEN** 同名两张牌中一张升级，另一张打出，且实例关系可确认
- **THEN** 查询 SHALL 分开返回两张牌的经历
- **AND** 身份无法确认时 MUST 降级为牌型统计，不推断升级实例的使用情况。

#### Scenario: Partial capture shows zero plays
- **WHEN** 查询出牌次数为0，但战斗中途缺失记录
- **THEN** SHALL 返回覆盖不足
- **AND** MUST NOT 证明该牌整场未使用。

#### Scenario: Drawn and unplayed are distinct
- **WHEN** 一张牌进入手牌后未使用
- **THEN** SHALL 保留入手时点、资源与可用性记录
- **AND** MUST NOT 将未使用写成从未上手。

### Requirement: Distinct damage measurements

系统 SHALL 分别保存并验证请求伤害、减免/格挡后生命截断前结算伤害、实际扣血与受击前生命。未确认的字段 MUST 标记未知。单回合实际爆发 MUST 只累计玩家阵营对敌方的已确认生命损失；MUST NOT 混入玩家自损、受伤或未知方向伤害。

#### Scenario: Ten HP target receives a huge hit
- **WHEN** 目标受击前为10HP、最终结算为9999、实际扣血为10且确认致死
- **THEN** 过量片段 SHALL 可使用9999与10，过量为9989
- **AND** 实际扣血爆发 SHALL 只累计10。

#### Scenario: Only requested amount is known
- **WHEN** 只知道请求9999与实际扣血10，没有最终结算及受击前生命
- **THEN** 系统 MUST NOT 展示“10血吃了9999”的结论。

### Requirement: Explicit hit and action attribution

“单次命中”“单张牌合计”“多段攻击” SHALL 分开计算。关联到卡牌的收益 MUST 有动作/触发来源证据；MUST NOT 用时间相邻推断归因。“Boss终结” SHALL 验证目标身份、致死和战斗胜利；“一刀秒整场Boss” MUST 另有完整战斗与阶段证据。

#### Scenario: Five-hit card
- **WHEN** 同一张牌产生5次各20点伤害
- **THEN** 可以显示该牌合计100或5段命中
- **AND** MUST NOT 显示单次命中100。

#### Scenario: Boss has low remaining health
- **WHEN** Boss被单次命中终结，但此前已受到伤害
- **THEN** 页面 MAY 显示Boss终结一击
- **AND** MUST NOT 称满血秒杀或一击结束整场。

### Requirement: Actual shielding and observed danger

实际格挡 SHALL 累计对玩家伤害结算中被格挡吸收的量；最高持有格挡与累计获得格挡 SHALL 分开。最危险战斗 SHALL 包含已确认死亡，其他战斗按可核实的最低正生命比例及稳定同值规则选取；最险胜局 SHALL 另限定为已确认获胜战斗。记录不全 MUST 限定为已记录，不预测未发生伤害，放弃或结果未知 MUST NOT 被当成死亡。

#### Scenario: Shield was not consumed
- **WHEN** 玩家获得100格挡、实际只吸收12伤害
- **THEN** 实际抗伤 SHALL 为12，MUST NOT 显示挡住100。

#### Scenario: Death is recorded
- **WHEN** 一场战斗以玩家死亡结束
- **THEN** 系统 MUST NOT 生成“残血险胜”
- **AND** MAY 在终局结果或其他有证据的片段中体现该战斗。

### Requirement: Reload metadata survives attempt replacement

单局SL SHALL 依据当前runId的游戏确认重载观察事件去重统计。重载元数据 MUST 独立保留，伤害与出牌高光 SHALL 仅使用最终有效尝试。累计本地文件、断线次数与最大attemptGeneration MUST NOT 直接作为单局SL总数。

#### Scenario: Ten reloads on the same combat
- **WHEN** 同一战斗有10条唯一重载观察并保留最后一次有效尝试
- **THEN** 完整采集下本局SL SHALL 计为10
- **AND** 战斗伤害 MUST 只累计最后有效尝试，不把旧尝试的夸张一击作为最终战绩。

#### Scenario: Recording begins mid-run
- **WHEN** 客户端中途接入且只确认后续两次重载
- **THEN** 页面 MAY 显示已记录SL2次
- **AND** MUST NOT 宣称整局总共SL2次。

#### Scenario: Duplicate hook delivery and reconnect
- **WHEN** 同一重载观察重复投递且客户端随后重连
- **THEN** 该观察 SHALL 只计一次
- **AND** 重连本身 MUST 不增加SL。
