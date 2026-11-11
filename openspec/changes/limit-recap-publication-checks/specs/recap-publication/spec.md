## ADDED Requirements

### Requirement: Numeric and wording checks on published recap text

发布检查 SHALL 核对可渲染结构、数值及其含义和明确不合适的措辞。实体索引、引用清单完整度和固定字数 MUST NOT 作为发布门槛。

#### Scenario: A number is used with the wrong meaning
- **WHEN** 候选把生命上限的终值写成增加量，或把未满的生命称为满血
- **THEN** 系统 SHALL 要求修正或舍弃错误片段

### Requirement: Interest scoring and one regeneration round

通过数值和措辞校验的模型卡片 SHALL 按 0–3 分评价趣味性。2 分及以上 SHALL 保留模型原文。未达到 2 分的片段 SHALL 有一次重生成机会。新稿 SHALL 经同一数值、措辞和趣味检查，仍未通过时 MUST NOT 展示，也不得用低分原稿补位。

#### Scenario: A low-scoring draft is regenerated
- **WHEN** 首轮同时有达标和低分片段
- **THEN** 系统 SHALL 保留达标片段，只为低分片段重生成一次，并只展示复评达到 2 分的有效新稿

#### Scenario: A regenerated draft still fails
- **WHEN** 新稿得分仍低于 2 分，或无法通过数值和措辞校验
- **THEN** 系统 SHALL 省略该片段，允许复盘没有故事卡片
