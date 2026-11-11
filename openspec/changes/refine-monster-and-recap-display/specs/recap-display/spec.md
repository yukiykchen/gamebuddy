## ADDED Requirements

### Requirement: Readable recap card titles

复盘卡片标题 SHALL 围绕本局看点写出逗趣的表达，MUST NOT 出现具体数值。正文 SHALL 继续按既有规则核对所用数值。

#### Scenario: A title mentions a price
- **WHEN** 卡片标题包含交易价格或其他具体数值
- **THEN** 系统 SHALL 要求改写标题，并允许已核对的价格留在正文

#### Scenario: A good story has a flat title
- **WHEN** 卡片故事分达到门槛，但标题没有逗趣的表达
- **THEN** 标题 SHALL 重写并复评。标题仍未达标时 MUST NOT 发布该卡片。

### Requirement: Group identical monsters in the death label

对局列表的「死于」栏 SHALL 把同名怪物合并为一个名称和对应数量。不同名称 SHALL 分别显示。此规则 SHALL 同样适用于已保存的对局。

#### Scenario: A saved death lists several identical enemies
- **WHEN** 历史对局的死因包含同名怪物
- **THEN** 列表 SHALL 显示名称和数量
