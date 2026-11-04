# Why

Bridge 每 200ms 抓一次全量快照，卡面描述走的是「裸 LocString 模板 + GetFormattedText」。v0.107.1 的 `CardModel.Description` 每次返回一个不带变量的新模板，而中文模板里普遍有 `{Damage:diff()}`、`{Stars:starIcons()}` 这类选择器，必须由该卡自身的 `DynamicVars` 绑定后才能解析。缺绑定时本体每次格式化都打一条 `[ERROR] Localization formatting error!` 加约 15 行 C# 栈。

实测（v0.107.1，zh_CN，铁甲战士一局）：62 分钟写出 649MB 日志、514,821 条错误、平均 137.8 条/秒、每条记录 1,323 字节。同一份文本也因此以未解析的模板形式发给桌面端，agent 拿到的是 `造成{Damage:diff()}点伤害两次。` 而不是 `造成6点伤害两次。`

# What Changes

- 周期快照间隔从 200ms 调整为 5000ms，并抽成具名常量。事件类消息（reward/event/shop/rest 的 opened/closed）保持即时，不受该间隔影响。
- 卡面描述改为先绑定该卡的动态变量再格式化，导出玩家实际看到的数字。
- 变量绑定不可用时，描述导出为 `null` 且来源标记为 `unavailable`，不再退回格式化裸模板（这正是刷屏和脏文本的共同来源）。

# Non-goals

- 不改 `gamebuddy.state.v1` 的字段结构，不新增事件类型。
- 不改遗物、药水、事件的文本导出路径（实测错误全部来自 `table=cards`）。
- 不做自动出牌、鼠标控制或任何写游戏状态的能力。
- 不改本体日志级别：本体没有可调项，启动参数只有 `nomods`。
