## Purpose

为模型提供受控只读查询，使其沿整局时序发现并核实故事，按证据强度输出短回顾。

## ADDED Requirements

### Requirement: Scoped read-only investigation

Harness SHALL 提供全局概览、事件检索、连续窗口、对象经历、机制知识与断言检查能力。工具 MUST 绑定当前对局和事实版本，返回证据、范围、完整度及截断/分页信息；MUST NOT 执行任意代码、读任意路径、修改事实或操作游戏。

#### Scenario: Query a card after upgrading
- **WHEN** 模型查询升级对象在下一场战斗的经历
- **THEN** SHALL 返回其变化/入手/使用轨迹及可核实次数和覆盖范围
- **AND** 同名歧义 SHALL 明示，不静默猜实例。

#### Scenario: Partial page is not absence proof
- **WHEN** 工具只返回分页的一部分事件
- **THEN** SHALL 明示截断及继续读取方式
- **AND** MUST NOT 基于当前页无匹配就断言整场未发生。

### Requirement: Bounded model and tool loop

系统 SHALL 允许模型基于概览发起有界工具查询，再提交故事与结构化断言；SHALL 记录显式工具交互及检查结果。轮次、调用和总用时 MUST 有限；无Key、超时或非法输出 SHALL 保留本地有效纪录。事实修订或清空后旧结果 MUST 不得覆盖当前内容。

#### Scenario: Investigation reaches its budget
- **WHEN** 模型达到配置的查询预算
- **THEN** 系统 SHALL 结束继续读取并只发布已支持内容或本地回退
- **AND** MUST NOT 为补齐卡片而生成无证据结论。

### Requirement: Evidence strength controls claims

复盘 SHALL 区分事实反差、机制联系和已验证局部反事实。可计算断言 SHALL 由程序核验；有效事件ID MUST NOT 被视为自由文本因果解释全部成立。评判当时选择时 MUST 使用当时可见信息，不把后续随机结果当作玩家已知。

已记录状态之间的正向关系 SHALL 可在缺少新版快照时使用旧run.observed取证。程序 SHALL 提供带原事件引用的recorded_relation断言供绑定关系的确定字段；它仅证明记录范围内的前后变化/持有状态，不证明任意机制归因。跨会话、重载或位置歧义的变化 MUST NOT 被标成连续回血或成长。

#### Scenario: Health reaches zero and then recovers in a continuous scene
- **WHEN** 同一连续已记录战斗内观察到hp=0、随后正生命且无重载或切场
- **THEN** SHALL 可以描述生命归零后恢复的事实反差
- **AND** MUST NOT 单凭先后指定某瓶药水导致恢复或将其写成最终死亡；仅在另有持有/消失、实际治疗和版本机制吻合的专用关系检查通过时，允许标明机制吻合推断的救命叙事。

#### Scenario: Low health with remaining inventory
- **WHEN** 结束前最后有效观测生命较低且背包仍有药水
- **THEN** SHALL 可以描述该次观测的生命与持有反差
- **AND** MUST NOT 把持有写成整场从未使用、忘用、死亡或确定能救命。

#### Scenario: Bad later draw
- **WHEN** 玩家某次取舍后出现不利随机抽牌
- **THEN** 模型 MAY 描述实际经过或遗憾
- **AND** MUST NOT 仅凭后续结果就定性为当时操作错误。

### Requirement: Limited counterfactual capability

局部行动验证器仅 SHALL 对已声明且独立验收的确定机制返回证明；未知规则、触发或随机依赖 MUST 返回不支持。未验收时该能力 MUST 保持不可用；已验证本回合斩杀 MUST NOT 外推整场或整局必胜。

#### Scenario: Unsupported effect changes the outcome
- **WHEN** 指定序列涉及验证器未支持的限伤或触发
- **THEN** SHALL 返回unsupported及原因
- **AND** 页面 MUST NOT 发布肯定的错失斩杀结论。
