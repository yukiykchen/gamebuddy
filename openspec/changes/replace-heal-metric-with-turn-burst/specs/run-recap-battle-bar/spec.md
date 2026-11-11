## Purpose

本局复盘主数字条向玩家展示这一局已经核实的战况。第四项改为本回合最高出伤，避免把经常无法核实的治疗量占在主位。

## ADDED Requirements

### Requirement: Primary battle bar uses peak turn burst

本局复盘主数字条 SHALL 按顺序展示累计输出、实际抗伤、累计受伤、本回合最高出伤。本回合最高出伤 SHALL 使用该局已核实的玩家回合对敌实际扣血峰值。缺数据时该格 MUST 保留并显示未记录，未知 MUST NOT 显示为 0。次级纪录 MUST NOT 再重复本回合最高出伤，并 SHALL 继续展示可得的最高斩杀与 SL。

#### Scenario: Peak turn burst is known
- **WHEN** 本局已核实玩家回合对敌实际扣血峰值为 50
- **THEN** 主数字条第四项 SHALL 显示本回合最高出伤 50
- **AND** 次级纪录 MUST NOT 再出现同一峰值

#### Scenario: Peak turn burst is unknown
- **WHEN** 本局没有任何可计算的玩家回合扣血记录
- **THEN** 主数字条第四项 SHALL 显示未记录
- **AND** 系统 MUST NOT 用治疗请求量、旧摘要或其他单击伤害填入该格

#### Scenario: Earlier totals stay in place
- **WHEN** 本局同时有累计输出、实际抗伤和累计受伤
- **THEN** 这三项 SHALL 保持原名称、原顺序和原口径
- **AND** 主数字条 MUST NOT 再展示实际恢复

### Requirement: Display verified observations for incomplete battle coverage

对局结束后，主数字条 SHALL 直接显示已有结算可计算出的数值。单场战斗结束事件、覆盖状态或其他结算的缺失 MUST NOT 阻止显示可计算指标。只有当前指标没有可用数据时才 SHALL 显示「未记录」。

#### Scenario: The last combat does not have an end marker
- **WHEN** 伤害事件存在，但最后一场战斗缺少结束事件
- **THEN** 复盘 SHALL 直接显示累计输出、抗伤、受伤和最高回合出伤的已知数值

#### Scenario: A saved recap is reopened
- **WHEN** 已生成的故事卡命中缓存
- **THEN** 界面 SHALL 用当前规则计算战况数字，并复用原有卡片
