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
- **WHEN** 本局缺少完整的玩家回合扣血记录
- **THEN** 主数字条第四项 SHALL 显示未记录
- **AND** 系统 MUST NOT 用治疗请求量、旧摘要或其他单击伤害填入该格

#### Scenario: Earlier totals stay in place
- **WHEN** 本局同时有累计输出、实际抗伤和累计受伤
- **THEN** 这三项 SHALL 保持原名称、原顺序和原口径
- **AND** 主数字条 MUST NOT 再展示实际恢复
