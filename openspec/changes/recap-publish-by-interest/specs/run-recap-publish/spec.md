## Purpose

本局复盘在生成片段时把数字和名称绑到已记录的值。生成完成后直接采用这些片段，不再进行第二轮校验。

## ADDED Requirements

### Requirement: Generated recap cards publish without a final review

系统 SHALL 在片段生成并完成记录绑定后直接展示这些片段。系统 MUST NOT 再调用单独的校验回合来批准、否决或要求修改已生成片段。绑定无法对上已记录值的占位符 MUST NOT 被填成新数字或新名称。

#### Scenario: A grounded card is not reviewed again
- **WHEN** 模型提交的片段已把正文数字绑定到本局记录中的值
- **THEN** 系统 SHALL 展示该片段
- **AND** MUST NOT 因为另一次语义校验而丢弃它

#### Scenario: An unbound value is not invented
- **WHEN** 片段正文的占位符对不上已记录的值
- **THEN** 系统 MUST NOT 用编造的数字或名称填上该占位符
