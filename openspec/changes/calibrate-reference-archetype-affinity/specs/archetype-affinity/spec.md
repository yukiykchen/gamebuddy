## Purpose

为玩家提供有来源、可解释且可复算的流派契合度，通过教学参考构筑衡量标志性功能、配合及有效密度，帮助识别当前方向、理解已有组合与后续缺口，并明确知识缺失造成的不确定性。

## ADDED Requirements

### Requirement: Reference based independent affinity

系统 SHALL 对各流派分别输出 0 至 100 的契合度、参考路线与事实快照；满分 MUST 对应声明的功能需求与配合充分满足。参考来源与草案状态 MUST 可查看。各分数 SHALL 不被解释为胜率或合计为 100% 的分类概率。

#### Scenario: Complete declared reference
- **WHEN** 输入完整参考牌组和已知遗物
- **THEN** 对应路线输出 100 分，并提供该参照的来源及审阅状态

#### Scenario: Alternative route
- **WHEN** 同一流派存在多条已审阅的参考路线
- **THEN** 系统分别评估并选择最匹配路线，不跨路线拼凑功能获得虚假满分

### Requirement: Functional substitutes and continuous gaps

系统 SHALL 按已核验功能而非逐个卡名匹配，输出缺失功能及可替代组件。缺少关键功能 SHALL 只影响相应覆盖和配合，MUST 不截断或抬升整体分数。

#### Scenario: Missing starter with useful support
- **WHEN** 构筑仍缺启动组件并新增未饱和的有效配套
- **THEN** 契合度可连续增加，缺口仍显示启动组件缺失，不应用 59 分硬上限

#### Scenario: Substitute defense
- **WHEN** 格挡参照中的防御牌被替换为已核验且满足同样需求的防御组件
- **THEN** 系统按功能覆盖计算，不仅因卡名不同大幅扣分

#### Scenario: Amplification is not retention
- **WHEN** 牌组有坚定不移而没有跨回合留存来源
- **THEN** 系统仍显示格挡留存缺口，不把放大格挡误认为保留格挡

### Requirement: Saturation and effective density

系统 SHALL 使超过合理需求的重复组件停止刷覆盖分，并考虑无关牌对参考路线有效密度的稀释。通用资源支持 SHALL 有限计入，多功能卡 MUST 不重复占用多个完整密度单位。

#### Scenario: Add unrelated strikes to block reference
- **WHEN** 在冻结的完整格挡参照中额外加入十张普通打击
- **THEN** 该路线契合度降低，不再保持 100 分

#### Scenario: Redundant payoff copies
- **WHEN** 在已满足格挡转输出需求的参照中额外加入三张全身撞击
- **THEN** 额外副本不提高该路线的契合度

### Requirement: Relics and uncertain knowledge

系统 SHALL 把已核验遗物视作具体功能提供者，MUST 不要求搜齐全部攻略遗物才能满分。未知卡牌、动态效果、缺失附魔 MUST 标明不确定性，不伪造效果或把未知直接当成已知负面。

#### Scenario: Relic provides a missing function
- **WHEN** 已确认的遗物提供当前路线所需功能
- **THEN** 系统重算相应功能，且遗物不占牌组抽牌位置，重复 ID 不重复计分

#### Scenario: Unverified dynamic card
- **WHEN** 出现缺少运行时改造信息的疯狂科学
- **THEN** 系统标记该效果未核验，不让模型虚构其功能或宣称完整战斗判断

### Requirement: Reproducible independent sample evaluation

验证产物 MUST 包含满分参照之外的每个方向至少五套真实完整牌组、来源、版本、数量、预先记录的允许标签、结果及变形测试。系统 SHALL 不以胜负定义流派，不把参照自身的满分计入独立验证命中数。使用过的样本 MUST 标记为校准集。

#### Scenario: Failed run with identifiable direction
- **WHEN** 输入具有力量配合但失败或放弃的真实牌组
- **THEN** 仍按其功能识别方向，胜负不会修改契合度

#### Scenario: Independent fixture report
- **WHEN** 运行冻结的每方向五套样本验证
- **THEN** 输出每套牌的各流派分数、允许标签、置信度及知识快照标识，且报告样本规模与初标偏差

### Requirement: Bounded AI assistance

AI SHALL 仅使用提供的版本化事实和来源提出知识草案或解释已计算结果。实时契合度 MUST 可在无 AI 请求和无 API key 时确定性复算。模型草案 MUST 经过 ID 与牌面事实校验后才可发布。

#### Scenario: No model available
- **WHEN** 模型不可用或没有 API key
- **THEN** 同一输入与同一规则版本仍得到相同契合度和确定性缺口

#### Scenario: Unsupported substitute claim
- **WHEN** 模型声称某卡可以替代另一功能，但没有提供已知牌面证据
- **THEN** 该替代关系保留为待核验草案，不进入正式评分

### Requirement: Candidate marginal teaching

系统 SHALL 对同一完整牌组分别计算选牌前后契合度，整数增量 MUST 等于展示后的分数之差，并附功能缺口、配合与重复收益的上下文理由。推荐排序 SHALL 保持原有战力与情境评估。

#### Scenario: Same card in different decks
- **WHEN** 同一候选分别用于缺少该功能与该功能已充分的牌组
- **THEN** 系统显示各自真实增量，并解释补缺口或同类收益已足够，不固定写死某牌加几分

#### Scenario: Zero or negative delta
- **WHEN** 候选提供的收益被饱和或稀释抵消
- **THEN** 系统如实展示零或负增量，不强制加一，并说明仅代表当前教学路线的贴合变化

#### Scenario: Historical version
- **WHEN** 来源牌组版本不同但牌面 ID 可识别
- **THEN** 按当前提供的牌面功能比较，版本只作来源记录，不过滤、不降低分数或置信度

### Requirement: Output weighted teaching and visible core alerts
系统 SHALL 让自动打击的输出与打击供给占据超过一半的结构覆盖权重，通用资源权重 SHALL 不超过5%；完美打击 SHALL 按已知打击数量提供输出贡献，不只作为普通弹药。条件抽牌 MUST 检查触发来源。核心牌出现时 SHALL 独立播报其构筑作用，不依赖该牌是否为推荐首选。

#### Scenario: Early output versus generic draw
- **WHEN** 起手牌组比较完美打击、灰烬打击与耸肩无视
- **THEN** 完美打击有显著的输出贡献，通用抽牌不再以十二分对六分的悬殊比例压过打击供给，前后差值保持真实

#### Scenario: Reward transition
- **WHEN** 核心牌已出现，随后收到战斗退出快照或另一张牌的建议
- **THEN** 该机会的关键提醒仍可显示一次，确认选牌或关闭机会后不补播

#### Scenario: Serializable alert payload
- **WHEN** 关键提醒完成内部有效性确认并发送至桌面窗口
- **THEN** 仅发送可结构化克隆的数据，内部回调不进入IPC，真实renderer可显示该提醒
