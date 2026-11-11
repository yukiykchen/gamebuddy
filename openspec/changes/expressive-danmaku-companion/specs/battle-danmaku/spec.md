## Purpose

使杀戮尖塔观战弹幕在保留事实技能介绍的同时，通过合理发言时机、不同角色观察角度及真实本局记忆提供连续陪伴感。所有回忆和精彩时刻只来自已采集证据，缺失事实不被补写成游戏结果。

## ADDED Requirements

### Requirement: Spaced and relevant presentation
系统 SHALL 保留每 15 秒请求两句与 60 秒超时，AI 实际显示至少间隔 6 秒；就绪的关键组件通知、技能与精彩时刻 SHALL 优先于普通闲聊。延后的 AI 不得阻塞就绪技能。无新变化时普通评论 SHALL 至多每 30 秒显示一句；怪物已消失的当前目标评论 SHALL 丢弃。

#### Scenario: Skill arrives between two comments
- **WHEN** 第一条 AI 已显示，第二条待显示，此时出现技能或关键通知
- **THEN** 技能/关键通知可先显示，第二条仍须满足距上一条 AI 至少 6 秒

#### Scenario: Target dies before delayed comment
- **WHEN** 评论绑定的怪物已消失或死亡
- **THEN** 该当前目标评论不上屏，基于有效已发生精彩事件的历史评论不受该目标存活要求影响

### Requirement: Evidence based highlights
系统 SHALL 根据明确事实识别残血跨回合存活、连出牌后敌人残血、重复强化意图、长战敌人倒下及新牌首次打出，并优先用于下一批评论和显示。普通快照重复 SHALL 不产生重复精彩时刻。未知伤害来源、强化效果、胜负不能猜测。

#### Scenario: New card first play
- **WHEN** 本局观察到新卡入牌组且收到该牌的真实打出事件
- **THEN** 可评论其首次登场，不宣称未观测到的收益或伤害归因

### Requirement: Distinct perspective and run memory
五角色 SHALL 有不同关注点、场景反应和回忆语气并进入真实生成提示。系统 SHALL 保存本局有限的遭遇、残血、恢复和新牌经历，重遇相关敌人时允许回忆；换局或换角色 SHALL 隔离记忆，未知经历不得补造。

#### Scenario: Repeated encounter
- **WHEN** 本局此前在包含该类怪物的战斗中残血，随后再遇到同类
- **THEN** 提供有证据的关联记忆，不指称该怪物必然造成伤害

### Requirement: Clear speaker identity
技能 SHALL 使用可见怪物名/行动名与独立技能样式，AI SHALL 显示角色身份并保留角色框。技能悬停仍显示效果和来源，同类多只怪物可区分。系统 SHALL 提供可阅读的实际人格配置与说明文件。

#### Scenario: Skill and character comment coexist
- **WHEN** 技能介绍与 AI 评论同时可见
- **THEN** 不依赖悬停即可辨认怪物技能与角色感想，技能详情仍可访问

### Requirement: Player centered personality reactions
人格AI SHALL 将玩家打牌、伤害变化和生命状态作为可选素材，MUST 不强制每批围绕这些事件，也不把静态怪物数量/行动旁白当作默认持续主题。高血量状态 SHALL 不因重复快照或每个周期重复触发。两句 SHALL 采用不同反应角度，重复/近似表达 SHALL 被抑制。怪物技能介绍 SHALL 保留，15秒两句与60秒超时保持。

#### Scenario: Attack and damage
- **WHEN** 观察到攻击牌打出或敌人明确减少生命
- **THEN** 可生成相应人格反应，但不能把出牌本身宣称为已命中或把未知伤害归于该牌

#### Scenario: High health without changes
- **WHEN** 玩家血量充足且持续收到相同状态
- **THEN** 可有一次基于高血量的角色反应，随后不反复播报血多或怪物场景


### Requirement: Optional topics and bounded semantic repetition
人格AI SHALL 自主选择话题，MUST 不强制每场/每批覆盖攻击、受伤、血量或防御。系统 SHALL 提供丰富人格写作角度及近期话题/笑点记录，限制血量和防御主题各120秒最多一次，并抑制可识别的同义重复；不得为凑数固定轮播示例。

#### Scenario: Low health is optional context
- **WHEN** 玩家持续残血并每15秒请求弹幕
- **THEN** 模型可选择其他有依据或不新增事实的角色感想，血量复述即使换措辞也受主题冷却限制

#### Scenario: Independent second line
- **WHEN** 请求包含攻击或受伤事件
- **THEN** 两句话无需围绕同一事件，可以独立选角度，或者只输出一句/保持安静

#### Scenario: Concurrent paraphrases
- **WHEN** 两个并发批次先后返回相近的血量提醒或已识别的相同笑点
- **THEN** 后返回批次按最新接受历史去重；同局角色历史有界，换局不会错误套用旧局主题禁限


#### Scenario: Optional state input
- **WHEN** 没有新的可用生命状态素材，或生命话题仍在冷却
- **THEN** 文案请求不再每批附带旧HP和格挡数值，不猜缺失值；新的受伤/出牌不会清掉有效的自由闲谈

#### Scenario: Repeated enemy banter
- **WHEN** 刚接受针对怪物的调侃，下一批换标签或换词继续同类笑点
- **THEN** 怪物调侃受45秒冷却，已识别的牙齿/生存等梗另受90秒抑制


### Requirement: Character specific voice mechanics
五角色 SHALL 具有各自的用词、节奏、幽默逻辑和性格反差配置并进入实际请求，MUST 不靠重复关键词区分人格。

#### Scenario: Distinct machine and necrobinder speech
- **WHEN** 同一可选素材分别提供给机器人和亡灵契约师
- **THEN** 机器人使用字面推理与自主意愿的错位，契约师使用家常照料与诡异的反差；实际系统提示包含当前角色的声音摘要，专属事件反应不被通用描述覆盖。

#### Scenario: Contrast examples remain writing guidance
- **WHEN** 提供同素材的中性表达与人格改写示例
- **THEN** 示例只用于指导表达，照抄或明显近似改写仍被过滤，话题自由且不要求固定术语或每场覆盖状态事件。

#### Scenario: Same optional subject
- **WHEN** 相同素材分别提供给五角色
- **THEN** 请求包含五种不同的表达规则与例子，仍不强制某个话题出现
