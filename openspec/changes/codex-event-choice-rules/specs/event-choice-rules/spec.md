## Purpose

让 GameBuddy 使用与当前游戏版本对应的事件决策树和真实玩家状态，对问号事件及远古选项进行可追溯、安全且可降级的逐项分析。

## ADDED Requirements

### Requirement: Event snapshots expose stable optional identifiers
事件快照 SHALL 以向后兼容方式提供可用的事件、页面和选项稳定标识。协议 MUST 接受缺少这些字段的旧快照，并保留运行时标题、描述和锁定状态作为事实来源。

#### Scenario: New Bridge captures an event page
- **WHEN** 游戏事件页面显示可选按钮
- **THEN** 快照在游戏版本可读取时包含 `eventId`、`pageId` 和每项的 `optionId`
- **AND** 每项仍包含当前界面的标题、效果文本和锁定状态

#### Scenario: Old Bridge sends display text only
- **WHEN** 快照没有稳定标识但包含事件标题与可见选项
- **THEN** 协议仍接受该快照
- **AND** Agent 可按标题与选项文本降级匹配

### Requirement: Event choices use versioned catalog facts
系统 MUST 按稳定 ID 优先、标题次之匹配当前版本事件，并按当前页面或可见选项定位决策树节点。匹配结果 MUST 标明事件 ID、页面 ID、游戏版本、匹配方式和完整度，且 MUST NOT 把未匹配内容表述为确定规则。

#### Scenario: Multi-page event advances
- **WHEN** 同一事件进入效果和代价不同的后续页面
- **THEN** 系统匹配新的页面选项并重新分析
- **AND** 不沿用初始页面的代价或建议

#### Scenario: Catalog does not contain the event
- **WHEN** 事件 ID、标题和可见选项均无法可靠匹配目录
- **THEN** 系统只分析运行时明确显示的效果
- **AND** 将知识完整度标记为部分或未知

### Requirement: Every visible option receives structured analysis
每个未锁定选项 SHALL 输出规则分数、主要收益、主要代价、风险等级、可执行性、未知项和数据来源。分析 MUST 结合当前生命、最大生命、金币、牌组、遗物与药水，并 MUST NOT 猜测随机奖励的具体结果。

#### Scenario: Option exchanges health for a reward
- **WHEN** 选项明确损失生命或最大生命并给予金币、遗物、删牌或升级
- **THEN** 分析同时展示代价与收益
- **AND** 根据当前剩余生命调整风险，而不是只比较奖励价值

#### Scenario: Option has random output
- **WHEN** 效果只声明随机卡牌、遗物或药水
- **THEN** 分析保留随机性和不确定性
- **AND** 不发明将获得的具体物品

### Requirement: Unsafe options cannot become the recommended choice
规则层 MUST 排除已锁定、金币不足或明确会立即致死的选项。存在可执行选项时，首选 MUST 来自可执行集合；若没有足够事实支持排序，系统 MUST 明确表示无法可靠推荐，而不是无理由选择第一个按钮。

#### Scenario: Health cost is lethal
- **WHEN** 选项确认造成的生命损失不小于当前生命
- **THEN** 该选项标记为致命且不可推荐
- **AND** LLM 也不得选择它

#### Scenario: Rules cannot distinguish unknown choices
- **WHEN** 所有可执行选项都缺少可确认效果且规则无法形成有意义排序
- **THEN** 系统不发布伪确定的规则首选
- **AND** 界面保留真实选项并提示效果尚未确认

### Requirement: LLM reviews only rule-bounded event choices
启用 LLM 时，模型 SHALL 接收事件原文、当前玩家资源、版本化规则匹配和每个选项的结构化利弊。模型 MUST 只能返回规则层标记为可推荐的真实索引；无效输出或请求失败 MUST 回退到已形成的规则结果。

#### Scenario: LLM selects an excluded option
- **WHEN** 模型返回被锁定、资源不足、致命或不存在的索引
- **THEN** 系统拒绝该结果
- **AND** 使用规则首选

#### Scenario: LLM service is unavailable
- **WHEN** 已有可靠规则排序但模型请求失败
- **THEN** 系统展示规则首选及其结构化理由
- **AND** 不阻塞事件界面

