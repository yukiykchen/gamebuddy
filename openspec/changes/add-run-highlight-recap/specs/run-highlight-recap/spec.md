## Purpose

为玩家生成简短、可核实的“本局复盘”：固定数据条、模型从本局记录中选出的三个重要片段，以及最后一句总结。片段可以是失误、遗憾、关键选择或高光。

## ADDED Requirements

### Requirement: Compact player recap

系统 SHALL 在单局记录提供“本局复盘”，展示固定数据条、从本局记录选择的三个不同重要片段和最后一句总结。片段 SHALL 可以是有证据的失误、遗憾、关键选择或高光，MUST NOT 限定为正向高光或强制好坏配比。卡片标题 MUST 不超过10字，正文 MUST 不超过40字，总结 MUST 不超过40字；正文目标为120–220字，数据少时可更短。系统 MUST NOT 在该能力中提供逐回合过程、时间线、回放控制或展开长篇战报入口。

#### Scenario: Short completed run
- **WHEN** 已结束对局只有两个有证据的重要片段
- **THEN** 页面 SHALL 只显示两张短卡，不编造第三张
- **AND** SHALL 保留现有历史与终局牌组功能，不要求玩家查看战斗经过。

### Requirement: Fixed metric strip

数字条 SHALL 固定展示累计输出、实际抗伤、累计受伤、实际恢复四个项目，并保持名称和顺序。缺数据 MUST 保留位置显示未记录，未知 MUST NOT 填0。顶部 SHALL 展示可得角色、进阶、到达层数、结果和时长；只有日志跨度时 MUST 使用“记录覆盖”。最高回合实际爆发、最高斩杀和SL SHALL 保留为次级已知纪录，完整记录确认无致死命中时显示无斩杀。

#### Scenario: A fixed metric is unavailable
- **WHEN** 本局缺少可靠的斩杀伤害记录但有最高单击数据
- **THEN** 累计数字条 SHALL 保留缺项显示未记录
- **AND** 系统 MUST NOT 将最高单击冒充最高斩杀，或用治疗请求量冒充实际恢复。

### Requirement: Scenic and expressive recap

系统 SHALL 使用项目本地的爬塔主题背景及清晰遮罩展示战况、重要片段和总结，文风 SHALL 为懂机制的损友兼战地记者。已记录火堆的回血/升级和当时生命 SHALL 支持本局选择风格；跨事件画像 MUST 由实际代价取舍支持，不宣称玩家的稳定人格。

#### Scenario: Kept fairy matches a later rescue
- **WHEN** 事件明确提供交出瓶中精灵的选项，玩家选择其他资源；后来同战斗窗口内持有精灵、生命归零、精灵消失且实际恢复吻合30%生命上限机制
- **THEN** 系统 SHALL 可以展示精灵保留后的救命伏笔，内部标明机制吻合推断及证据
- **AND** 缺少持有/消失/真实恢复、窗口有读档或机制不吻合时 MUST NOT 指定精灵救命。

#### Scenario: Missing historical totals
- **WHEN** 旧对局缺少阵营或实际治疗字段
- **THEN** 页面 SHALL 仍展示其可核实片段、固定缺项与一句总结
- **AND** 背景 MUST NOT 影响窄屏阅读，重新打开 SHALL 读取缓存。

#### Scenario: Summary follows the selected moments
- **WHEN** 三个重要片段完成查证与选择
- **THEN** 系统 SHALL 根据所选片段最后生成一句本局总结
- **AND** 总结 MUST 不引入无证据的新结论。

### Requirement: Grounded model selection

模型 SHALL 获得覆盖本局全部已记录战斗、重要选择和构筑变化的紧凑概览，并可通过只读工具按需读取局部事件、对象经历和当时套路证据，寻找有反差、伏笔、转折或具体机会的少量故事。模型 MUST NOT 被限制为只润色程序预选冠军。输出 MUST 引用已取得的事实与指标，MUST NOT 自由创造数字、卡名、归因或有效尝试之外的战绩。

对已知有类型观察关系，系统 SHALL 可使用可信事实句渲染，模型负责选取及发现新关系；标题/正文/总结 MUST 受相同命题范围约束。库存存在 MUST NOT 改写成未使用或玩家动机。工程诊断/证据限制 MUST NOT 作为故事正文；模型自由pattern MUST NOT 被当成已验证关系来源来生成总结或优先级。

#### Scenario: A model labels an ordinary play as recovery
- **WHEN** 普通出牌候选自称health_recovery但没有已验证恢复关系
- **THEN** 系统 MUST NOT 因该pattern生成生命归零后的总结
- **AND** SHALL 仅根据真正支持的片段生成或回退总结。

#### Scenario: Interesting non-record moment
- **WHEN** 非最高伤害片段具有可确认的套路或险胜证据
- **THEN** 模型 SHALL 可以将其选作高光
- **AND** 系统 SHALL 验证引用与指标后展示。

#### Scenario: Upgrade never used before death
- **WHEN** 日志确认低生命时升级一张牌、下一场精英阵亡，且可靠实例身份与完整出牌覆盖证明该牌未使用
- **THEN** 模型 SHALL 可以将升级未兑现作为故事
- **AND** MUST NOT 仅因死亡就断言升级是错误或死亡原因。

#### Scenario: Ordinary health change without a twist
- **WHEN** 只有24血进精英、4血离场，未发现其他值得讲的联系
- **THEN** 该经过 SHALL 可以作为背景
- **AND** 系统 MUST NOT 为凑足卡片而要求模型将其选作高光。

#### Scenario: Same hit holds multiple records
- **WHEN** 同一命中同时是最大命中、Boss收尾与最大过量
- **THEN** 系统 SHALL 合并为一张卡，不让同一事件重复占据多个位置。

### Requirement: Evidence-based archetype context

套路描述 SHALL 使用当前知识版本和片段发生时的牌组/状态；MUST 区分组件存在、实际触发与可归因收益，MUST NOT 用终局牌组倒推早期事件或展示流派分数。

#### Scenario: Owned but not triggered
- **WHEN** 玩家持有相关核心但没有该场触发证据
- **THEN** 页面 MAY 描述构筑方向
- **AND** MUST NOT 声称它在本场贡献了具体伤害或格挡。

### Requirement: Reliable short recap fallback

复盘生成 SHALL 后台运行且按对局与事实版本缓存。无模型、超时、格式/引用无效时 SHALL 保留固定数据条与本地可核实片段；缺失指标 MUST 保留位置显示未记录，采集范围不足时 SHALL 准确限定为已记录，MUST NOT 填零。清空记录或事实修订后，旧请求 MUST NOT 恢复被清除或过时的内容。

#### Scenario: Late response after clear
- **WHEN** 玩家清空本局记录后模型返回
- **THEN** 该结果 MUST 不再进入页面或缓存。

### Requirement: Accurate processing disclosure

原始事实 SHALL 本地保存；模型高光仅 SHALL 使用本局精选简报、必要事件片段与套路/SL信息，不发送整库历史、密钥、原始种子或共享留言。启用模型总结时，页面 MUST 准确区分本地保存和模型处理，不承诺所有内容从不外发。

#### Scenario: LLM recap enabled
- **WHEN** 向已配置模型服务发送本局复盘请求
- **THEN** 请求 SHALL 只含必要精选事实
- **AND** 页面对应文案 SHALL 说明可使用模型生成总结。
