## Context

原实现只保留 `activeEncounterGuide`。关闭面板时该值被清空，因此渲染进程既不知道当前战斗仍有攻略，也没有可恢复的数据。与此同时，`dismissedEncounterGuideKey` 会阻止同场状态更新重新生成攻略。

## Decision

将“当前战斗生成过的攻略”和“攻略面板正在显示”拆成两个状态：

- `cachedEncounterGuide` 保存当前战斗已生成的攻略；
- `activeEncounterGuide` 仅代表面板是否可见；
- `bridge-encounter-guide-state` 同步 `available`、`visible`、`kind` 和 `title`；
- `reopen-encounter-guide` 直接恢复缓存，不调用攻略构建逻辑。

关闭面板继续设置同场去重键，保证后续回合状态不会自动重开。战斗结束时同时清除缓存、可见状态和去重键。

## Failure handling

若缓存已不存在或战斗已经结束，重新打开请求只回传当前不可用状态，不显示旧攻略。按钮点击后先在渲染端隐藏，主进程随后广播权威状态，避免连续点击。
