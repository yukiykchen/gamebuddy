## ADDED Requirements

### Requirement: Event advice exposes benefits costs and provenance
桌宠事件建议卡 SHALL 展示首选的理由、主要收益、主要代价或风险，以及事件知识版本和匹配来源。没有可靠规则首选时 MUST 不宣称某个按钮最佳。

#### Scenario: Reviewed event advice opens
- **WHEN** 桌宠收到带结构化分析的事件建议
- **THEN** 建议卡显示首选、收益和风险
- **AND** 来源区分规则评分与 LLM 复核，并显示事件数据版本

#### Scenario: Event facts are incomplete
- **WHEN** 当前事件无法可靠匹配且没有规则建议
- **THEN** 桌宠不展示伪确定的首选
- **AND** 保持事件真实选项由主面板展示并提示资料不完整

