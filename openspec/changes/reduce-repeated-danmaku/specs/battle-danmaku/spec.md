## Purpose

在实时观战中优先提供少量不重复的 AI 感想，在 AI 不可用时克制使用固定文案，同时保留真实建议与共享留言，并通过渲染确认提供可核对的来源占比。

## ADDED Requirements

### Requirement: Commentary does not repeat across triggers
系统 SHALL 在排队期间及输出后 90 秒内抑制相同评论文本，包括仅标点或空白不同的重复内容。不同有效决策的建议 SHALL 独立保留。同一消息 ID 的 IPC 重投 MUST NOT 创建第二条弹幕。

#### Scenario: Cached AI text arrives under another event ID
- **WHEN** 相同 AI 句子在 90 秒内由另一个触发返回
- **THEN** 不再排队或显示第二遍，也不使用固定句子填补该重复

#### Scenario: Duplicate renderer delivery
- **WHEN** 同一条消息收到两次
- **THEN** 只创建一条弹幕并只确认一次渲染

### Requirement: Continuous combat retains its scene
系统 SHALL 在连续战斗中保留场景身份，不能因存活敌人名单变化重新播放入场或重新获取共享留言；确认新战斗时 SHALL 建立新场景。

#### Scenario: Enemy dies or summons a companion
- **WHEN** 战斗仍在进行但敌人列表改变或暂时为空
- **THEN** 不重复入场；只允许新的行动触发评论

### Requirement: AI first sparse commentary
入场、行动和机制触发 SHALL 优先生成至多一句 AI 评论，不先播放固定句子再追加 AI。无 AI 或生成失败时固定评论 SHALL 每次最多一句，跨触发和场景至少间隔 15 秒。AI 限流或重复抑制 SHALL 静默跳过。建议和玩家共享内容 SHALL 独立于固定评论配额。

#### Scenario: AI succeeds at entry
- **WHEN** 入场生成成功且结果未过期
- **THEN** 只显示一句 AI 评论，不叠加各敌人的固定台词

#### Scenario: AI fails repeatedly
- **WHEN** 多次行动的 AI 请求失败或未配置模型
- **THEN** 固定评论相隔至少 15 秒，每次最多一句

#### Scenario: Old action resolves after scene changes
- **WHEN** AI 结果到达时已换场景、失效、结束或已有更新的评论触发
- **THEN** 丢弃结果且不补发旧场景固定句子

### Requirement: Source ratios use rendered messages
系统 SHALL 提供当前应用会话的已渲染 AI、固定、建议、共享与其他来源计数，以及全部弹幕和评论两种口径的 AI 占比。尚未确认渲染的消息 MUST NOT 进入分母；无样本时占比 SHALL 为未知。统计不等于用户阅读，不外推历史占比。

#### Scenario: Queued message expires
- **WHEN** 消息生成或排队但未渲染
- **THEN** 上屏计数保持不变

#### Scenario: Mixed sources render
- **WHEN** AI、固定、建议、共享消息分别确认渲染
- **THEN** 各来源只计一次；全部占比分母包含全部，评论占比分母仅含 AI 与固定
