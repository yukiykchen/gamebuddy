## Purpose

为本地复盘提供可靠、幂等且不依赖界面猜测的对局生命周期事实，使客户端能够区分新局、胜利、失败、放弃和断线恢复，并保存完整的最终摘要。

## ADDED Requirements

### Requirement: 对局具有稳定身份
Bridge SHALL 为同一局游戏的所有状态提供稳定且非空的 `runId`，并提供角色、进阶等级、种子（可获取时）、开始时间和当前游戏时长。重连和界面切换 MUST NOT 改变同一局的 `runId`。

#### Scenario: 同一局重连
- **WHEN** GameBuddy 在一局游戏中断线后重新连接
- **THEN** 后续状态 SHALL 继续携带原来的 `runId`
- **AND** 客户端 MUST NOT 创建第二条对局记录

#### Scenario: 开始新局
- **WHEN** 玩家开始一局不同的游戏
- **THEN** Bridge SHALL 发布新的 `runId`
- **AND** 新 `runId` MUST 与上一局不同

### Requirement: 协议发布明确的开始和结束事实
协议 SHALL 支持 `run.started` 与 `run.ended` 事件。`run.ended` SHALL 包含 `runId`、`result`、最终章节、最终楼层和游戏时长；`result` MUST 为 `win`、`loss` 或 `abandoned` 之一。

#### Scenario: 正常胜利
- **WHEN** 游戏确认玩家完成本局
- **THEN** Bridge SHALL 恰好一次发布 `run.ended`
- **AND** `result` SHALL 为 `win`

#### Scenario: 角色死亡
- **WHEN** 游戏确认本局因角色死亡结束
- **THEN** Bridge SHALL 恰好一次发布 `run.ended`
- **AND** `result` SHALL 为 `loss`

#### Scenario: 旧草稿被新局替代
- **WHEN** 客户端已有未结束的旧 `runId` 且随后观察到新的 `run.started`
- **THEN** 客户端 SHALL 将旧局归档为 `abandoned`
- **AND** MUST NOT 把新局状态合并进旧局

### Requirement: 复盘采集字段可追溯
Bridge SHALL 让客户端可靠识别战斗类型、进入的房间类型、卡牌奖励拿取或跳过、火堆选择、商店进入及金币变化、卡牌打出类型、每回合可观测伤害、关底 Boss 和最终牌组。缺失字段 MUST 保持未知，不得推测为零或失败。

#### Scenario: 精英战结束
- **WHEN** 玩家进入并完成精英战
- **THEN** 生命周期数据 SHALL 能唯一计入一次精英挑战和对应结果

#### Scenario: 跳过卡牌奖励
- **WHEN** 奖励界面关闭且没有候选牌进入牌组
- **THEN** 生命周期数据 SHALL 记录一次明确的奖励跳过

#### Scenario: 记录最高单回合伤害
- **WHEN** 同一回合内一个或多个敌人受到可观测生命损失
- **THEN** Bridge SHALL 累计该回合伤害并更新本局 `maxTurnDamage`
- **AND** 回合切换 MUST 开始新的累计窗口

#### Scenario: 记录关底 Boss
- **WHEN** 游戏暴露当前章节关底 Boss 或玩家实际进入 Boss 战
- **THEN** 生命周期数据 SHALL 保存 Boss ID 与显示名
- **AND** 实际遭遇的最终 Boss SHALL 优先于仅规划的 Boss

#### Scenario: 无法判断操作
- **WHEN** 状态差分无法唯一判断商店消费、删牌或火堆行为
- **THEN** 对应字段 SHALL 标记为未知
- **AND** 复盘计算 MUST NOT 将未知当作零

### Requirement: 生命周期扩展保持向后兼容
新增字段和事件 SHALL 保持现有 `gamebuddy.state.v1` 消费者可继续读取原有状态；不认识新事件的旧客户端 MUST 能忽略它们而不影响建议功能。

#### Scenario: 旧消费者接收扩展状态
- **WHEN** 状态包含新增的对局生命周期字段
- **THEN** 原有战斗、选牌、路线和弹幕消费者 SHALL 继续工作

### Requirement: Explicit abandonment survives nested end hooks
玩家明确放弃时，桥 SHALL 发布唯一abandoned结束事实及兼容结果；Abandon内同步触发OnEnded(false) MUST NOT 先把原因降为普通失败。正常死亡和胜利 SHALL 保持原语义，异常清理不得泄漏放弃状态到下一局。

#### Scenario: Nested OnEnded during Abandon
- **WHEN** 玩家触发Abandon且该路径内部调用OnEnded(false)
- **THEN** 该局唯一结果为abandoned；后续普通死亡仍为loss，胜利仍为win。
