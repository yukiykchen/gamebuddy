## ADDED Requirements

### Requirement: Distinct monster dialogue within combat

同一场战斗中，已排队或已播放的怪物弹幕台词 MUST NOT 再作为另一条怪物弹幕使用。台词比较 SHALL 忽略标点和空白差异。

#### Scenario: Two enemies choose the same line
- **WHEN** 两只怪物的技能文案首选同一句话
- **THEN** 第二只怪物 SHALL 尝试同技能类别的其他台词；全部用过时 SHALL 省略该条弹幕

#### Scenario: A new fight has several available lines
- **WHEN** 同类技能有多个符合当前战斗去重规则的候选
- **THEN** 系统 SHALL 优先选近期未播放的台词，并使用本地台词池生成技能弹幕
