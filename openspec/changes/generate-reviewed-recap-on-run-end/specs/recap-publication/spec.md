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

### Requirement: Permanent per-run recap publication

最终故事卡、画像和结语 SHALL 作为对局记录独立存档。已存档对局 MUST NOT 因重启、重新展开、提示词变化、模型变更或新增结算而重新生成。战况数值 SHALL 继续按当前事实计算。模型失败或超时 MUST NOT 占用正式存档。

#### Scenario: A recap is reopened after a new release
- **WHEN** 某局已有正式复盘，玩家在新版本展开该局
- **THEN** 系统 SHALL 直接读取原文，并用本地记录刷新战况

#### Scenario: A legacy finished recap is still available
- **WHEN** 旧缓存中还有已完成的故事卡
- **THEN** 系统 SHALL 将其原文迁移到正式存档
