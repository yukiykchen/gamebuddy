## Purpose

本能力让本局复盘先检索整局，再只发布具有选择兑现、反差、转折或真正极端纪录的片段。记录中没有足够有意思的素材时，系统保留战况数字而不强行生成卡片和总结。

## ADDED Requirements

### Requirement: Whole-run retrieval precedes story selection

系统 SHALL 在生成自由片段前读取整局概览，并 SHALL 对准备采用的片段抓取相关事件或快照的前后窗口。系统 MUST NOT 只凭一个孤立事件、一个单次伤害或一个余额快照生成故事。

#### Scenario: Candidate requires surrounding context
- **WHEN** 整局概览显示一次事件选择可能在后续兑现
- **THEN** 系统 SHALL 抓取选择与后续结果的相关窗口后再决定是否成卡
- **AND** 只有选择本身而没有后续意义时 SHALL 不生成该卡

### Requirement: Recap cards pass an interest threshold during generation

系统 SHALL 只提交具备至少一种复盘价值的片段：选择后的兑现、明确机会代价、前后反差、跨事件联系、险情反转或真正极端纪录。普通拿牌、普通购买、单纯掉血、交易后余额、一次正常胜负和孤立数字 MUST NOT 单独成卡。该判断 SHALL 在生成候选时完成，系统 MUST NOT 增加生成后的第二轮模型校验。

#### Scenario: Ordinary events do not fill the recap
- **WHEN** 一局只有普通购买、普通奖励和正常战斗结果
- **THEN** 系统 SHALL 返回零张片段
- **AND** MUST NOT 为了凑满三张而改写这些普通经过

#### Scenario: A cross-event payoff is selected
- **WHEN** 一次选择与后续兑现或反差由已读取的记录共同支持
- **THEN** 系统 SHALL 可以将其作为一个片段
- **AND** 文案中的数字、名称和结果 SHALL 来自已读取记录或本地已核实关系

#### Scenario: Strong relation survives ordinary-number filtering
- **WHEN** 已核实关系证明此前选择在数层后兑现，或同类选择重复形成整局风格
- **THEN** 系统 SHALL 保留该跨事件片段
- **AND** MUST NOT 因片段同时包含普通生命值、伤害值或回血值而删除整个片段

#### Scenario: Target long run remains a positive benchmark
- **WHEN** 目标长局包含瓶中精灵的保留与后续救命、多次火堆回血和跨事件资源反差
- **THEN** 回归评测 SHALL 生成对应的高价值片段
- **AND** MUST NOT 把全部片段判为空

### Requirement: Recap output may be empty

系统 SHALL 允许每局输出 0–3 张片段。只有至少一张片段时，页面 SHALL 展示本局画像和最后一句总结；没有片段时 SHALL 只展示战况数字和简短的无素材状态，MUST NOT 生成空洞总结。

#### Scenario: No interesting material was found
- **WHEN** 整局检索完成但没有片段达到选材门槛
- **THEN** 页面 SHALL 不显示片段卡、本局画像和“这局怎么说”
- **AND** SHALL 保留可核实的战况数字

### Requirement: Local relations are leads, not mandatory filler

本地已核实关系 SHALL 作为整局检索的优先线索。自由生成可用时，系统 MUST NOT 把未被选中的本地关系自动补进三张卡；模型不可用时 MAY 仅展示预定义的高价值关系，但 MUST NOT 展示普通状态差分或孤立指标。

当同一局具备重复火堆回血，并同时存在后续救命/归零恢复或跨事件资源反差时，这组目标关系 SHALL 作为完整的已核实正向基准保留，不适用普通 fallback 禁止补齐规则。

#### Scenario: Model selects one of several local leads
- **WHEN** 本地提供三个已核实关系而整局生成只选择其中一个
- **THEN** 页面 SHALL 只展示所选关系及其他独立达到门槛的片段
- **AND** MUST NOT 自动补齐剩余两个关系

### Requirement: Turn burst means a whole player turn

最高回合爆发 SHALL 表示同一玩家回合内对敌方造成的实际扣血总和，MUST NOT 被解释为或用单次命中验证。

#### Scenario: Several hits form the peak turn
- **WHEN** 一个玩家回合内多次命中合计 50 点实际扣血
- **THEN** 系统 SHALL 将最高回合爆发记为 50
- **AND** MUST NOT 因任意单次命中低于 50 而否定该值
