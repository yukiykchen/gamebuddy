## Purpose

让观战评论根据当前角色展现不同性格，以稳定节奏引用真实怪物与近期 Mod 事件，并独立保留可核对的技能介绍。评论异步生成，60 秒内晚返回不因短时间限制丢失，过期场景不会串入当前战斗。

## ADDED Requirements

### Requirement: Character specific commentary
系统 SHALL 为铁甲战士、静默猎手、故障机器人、储君、亡灵契约师选择不同人格提示和示例，未知角色使用中性口吻。事实 SHALL 来自当前快照与近期 Mod 事件，未知内容不得编造。

#### Scenario: Character changes
- **WHEN** 当前角色改为储君或亡灵契约师
- **THEN** 后续请求采用对应人格，不再沿用战士口吻，旧角色待返回结果被丢弃

### Requirement: Periodic two phrase generation
系统 SHALL 在有效战斗入场时启动首批，此后每 15 秒请求两条不同评论，即使怪物行动没有变化。事件只更新输入，不能额外启动请求；延迟的调度不能补发积压批次。重复/无效输出 SHALL 被过滤，不能用固定闲聊补足两条。

#### Scenario: Quiet battle continues
- **WHEN** 场景维持不变，距离上一请求已满 15 秒
- **THEN** 使用最新状态与近期消息请求两条新的评论

#### Scenario: Previous batch is still pending
- **WHEN** 到达下一周期但上一批未返回
- **THEN** 正常启动新批次；上一批同场返回仍可显示，经文本去重后排队

### Requirement: Sixty second danmaku deadline
弹幕请求 SHALL 使用 60 秒超时，不能沿用 1.5 秒、4 秒或默认 120 秒。同场普通动作变化 SHALL 不使其失效；离场、断线、换局、换角色或死亡 SHALL 取消/丢弃旧请求。其他建议请求的超时 SHALL 保持原行为。

#### Scenario: Slow same-scene response
- **WHEN** 弹幕请求超过 15 秒才返回且仍在同一有效战斗
- **THEN** 可正常显示，不能因后续普通事件触发而丢弃

### Requirement: Independent monster skill messages
系统 SHALL 在入场及怪物行动变化时保留原有技能台词与悬停技能名、效果、来源，不等待 AI，也不受固定闲聊每 15 秒配额限制。相同快照不得重复介绍；不同怪物/技能不得因恰好同一句台词而相互吞掉。技能介绍 SHALL 独立统计为 monster_skill。

#### Scenario: AI is pending or unavailable
- **WHEN** 两个怪物进入战斗或改变行动
- **THEN** 相应技能介绍可独立上屏，悬停仍能核对行动详情
