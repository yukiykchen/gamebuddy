## Purpose

为五职业的攻略套路提供有来源的卡牌作用分类，通过实际牌组缺失与可选补强建议帮助学习构筑，避免分数、单一满分牌表和模型自行宣布组件足够产生误导。

## ADDED Requirements

### Requirement: One component broadcast per system
奖励、事件可见选牌与商店 SHALL 同时覆盖有来源的核心和辅助牌；每个体系 MUST 合并为一条通知，不同体系分别使用对应玩法的文案。商店遗物 SHALL 并入所属体系，预算、机制冲突、售出、离场与按访问去重规则 MUST 保持有效。多体系牌 SHALL 可分别出现在相关体系通知中，不得用全局商品去重吞掉另一体系。

#### Scenario: Multiple support cards and systems
- **WHEN** 同一批候选包含同一体系的多张核心/辅助牌，且有另一体系的组件
- **THEN** 每体系只有一条通知，分别列出其组件与作用；辅助牌不再被核心名单过滤。

### Requirement: Source-backed all-character classifications
系统 SHALL 覆盖 Spire 攻略列出的五职业全部套路，核心、辅助、关键遗物关系 MUST 可追溯来源；非网站补充 MUST 单独标注来源性质。没有明确体系关联或机制冲突的牌 SHALL 返回空体系并静默隐藏，不得伪造“通用”“未知”等流派，也不得自动标为冲突。

#### Scenario: Unrelated candidate stays silent
- **WHEN** 候选无明确套路归属且未发现与当前路线的机制冲突
- **THEN** 不展示构筑悬停、不为其请求AI；候选仍参与普通推荐及上下文匹配。

#### Scenario: All characters and multiple memberships
- **WHEN** 五职业卡牌被分析且同牌关联多个体系
- **THEN** 所有对应体系分别返回定位，包含其网站出处，不产生流派分数。

#### Scenario: Unified strike membership
- **WHEN** 悬停完美打击或其他打击供给牌
- **THEN** 数量增伤与打击供给统一归自动打击，不返回独立打击成长体系，AI候选及商店也遵循相同分类。

### Requirement: Grounded diagnosis and advice
每个体系 SHALL 返回定位、短板、建议三行；数量 MUST 使用持有牌组而非候选加入后的数据。具备组件 MUST NOT 被描述为数量足够或稳定成型。AI MUST 仅使用已确认事实与合法诊断建议配对，失败或不可用 SHALL 立即保留规则结果。

#### Scenario: Small strike package
- **WHEN** 20张牌中只有3张打击且地狱狂徒已存在
- **THEN** 提示如实显示打击与循环数量，不得说供给足够或已稳定。

#### Scenario: Untrusted AI output
- **WHEN** AI 虚构数量、缺少已持有核心、修改体系、返回未知配对或宣称成型
- **THEN** 该输出不被显示，继续使用基于真实牌组的提示。

### Requirement: Mechanic-specific conflicts
冲突提示 SHALL 有当前路线证据及明确牌面机制原因，并分别解释使用条件；不得以不在核心清单或属于其他套路作为冲突依据。

#### Scenario: Draw lock
- **WHEN** 已有自动打击路线且候选会锁住后续抽牌
- **THEN** 提示抽牌循环冲突与使用次序建议，而非笼统宣称该牌不能拿。

### Requirement: Explicit strategy and shared decision constraints
每个体系 SHALL 提供运转链、补强优先级、配套条件、例外与机制依赖，并实际进入悬停及推荐模型请求。选牌、商店和删牌 SHALL 共用机制冲突评估，模型输出 MUST 再次校验；不在网站名单不得作为拒绝依据。

#### Scenario: Attack transformation breaks strike components
- **WHEN** 已有明确自动打击配合而原始力量会将手牌攻击变化为巨石
- **THEN** 悬停说明打击标记与循环功能丢失的当前手牌风险，普通选牌与购物不得无条件强推，单张巨石本身不被误报为会改变整副牌。

#### Scenario: Conditional conflict and incompatible model output
- **WHEN** 候选只是需要先后顺序，或者模型选择了已被明确排除的结构冲突牌/购物清单
- **THEN** 条件冲突保留使用例外，违反约束的模型结果回退共同规则；奖励不可跳过时仍有可解释的风险最小选择。

#### Scenario: Removal protects engine components
- **WHEN** 商店提供删牌服务且牌组依赖打击数量、重复爪击或其他核心组件
- **THEN** 删牌候选不得仅凭名称含打击等字样推荐删掉核心输出或唯一引擎组件，并说明删除代价。
