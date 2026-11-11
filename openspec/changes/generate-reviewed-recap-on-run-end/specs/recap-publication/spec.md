## ADDED Requirements

### Requirement: Background generation after a completed run

本地已持久化的真实对局结束后，应用 SHALL 在后台生成复盘。展开该局时 SHALL 复用正在进行的生成任务或已完成结果。

#### Scenario: The review window stays closed
- **WHEN** 玩家打完一局且应用收到有效结算
- **THEN** 故事生成 SHALL 无需展开对局即可启动

### Requirement: Publish only approved stories from the run

故事卡 SHALL 讲述本局实际发生的选择、变化或事件及其看点。普通经过、技能或物品介绍、未证实的事件 MUST NOT 作为达标故事发布。未评分稿、低分稿、本地候选 MUST NOT 出现在玩家的故事区域。

#### Scenario: An encyclopedia explanation gets rewritten
- **WHEN** 候选只解释怪物技能或道具效果，或没有本局看点
- **THEN** 系统 SHALL 允许一次重新选材，只发布最终通过的卡片，其他情况下留空
