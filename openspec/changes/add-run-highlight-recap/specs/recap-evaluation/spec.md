## Purpose

通过可复现的样本和分项评审，检查日志、工具、故事准确性与趣味，并防止误判玩家失误。

## ADDED Requirements

### Requirement: Real completed loss evaluation loop

评测 SHALL 只读选择历史结果为loss且具有run.ended的四个真实对局，排除abandoned和未结束对局。原始日志 MUST NOT 被修改。每轮 SHALL 保存输入哈希、实际运行模式、当前效果、独立子agent评审、修改与回归结果和下一轮改进计划。子agent评审 MUST NOT 冒充玩家人工盲评，四局开发数据 MUST NOT 冒充留出集。来源字段未知时 MUST NOT 为填满复盘卡而制造事实。

#### Scenario: Generic unsuccessful run end
- **WHEN** 历史结果为loss且结束原因只有game_ended_not_cleared
- **THEN** 评测 SHALL 将其纳入已结束失败样本
- **AND** MUST NOT 从该原因推导玩家死亡、未用药或必败操作。

### Requirement: Versioned evaluation evidence

评测运行 SHALL 保存样本/事实修订、模型/提示/工具/知识版本、预算、显式工具轨迹、输出与分项结果。冻结响应的工程复现与重新调用模型的效果试验 MUST 分开记录；合成边界与真实对局结果 MUST 分组报告。

#### Scenario: Repeat an evaluation
- **WHEN** 对同一事实包重新运行检索与校验
- **THEN** 评测产物 SHALL 足以定位所用版本、响应和断言
- **AND** MUST NOT 将另一次模型生成冒充原始响应。

### Requirement: Separate correctness and story value

评测 SHALL 分别报告固定数字、事实支持、选材、连锁联系、误归因/失误误判、趣味/本局特色、篇幅/重复和成本/稳定性。严重事实与失误误判 MUST 不得被趣味或平均分抵消。人工标注 SHALL 允许多种有据选材，不以固定措辞作为唯一答案。

#### Scenario: Entertaining but unsupported blame
- **WHEN** 某卡片有趣但无依据责怪玩家导致失败
- **THEN** SHALL 记为严重归因或失误误判
- **AND** MUST NOT 因趣味分高而通过相应发布门槛。

### Requirement: Holdout and paired regression cases

开发/保留集 SHALL 按完整对局隔离，同局SL尝试 MUST 不跨集。回归 SHALL 覆盖没上手/不可用/可用未用、同名副本、真假斩杀、实际扣血/过量、格挡/抗伤、SL/重连和完整/有缺口等配对。

#### Scenario: Same run has multiple reload attempts
- **WHEN** 构建开发与保留评测集
- **THEN** 同一runId所有尝试与其变体 SHALL 处于同一分组
- **AND** MUST NOT 通过拆分尝试泄漏测试样本。
