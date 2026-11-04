# 本体侧事实（v0.107.1 实测，全部反编译自 `data_sts2_windows_x86_64/sts2.dll`）

- `CardModel.Description` => `new LocString("cards", Id.Entry + ".description")`，每次调用新建，`_variables` 为空。
- `LocString.GetFormattedText()` => `LocManager.Instance.SmartFormat(this, _variables)`；选择器解析不到时由**本体**捕获并打 `[ERROR] Localization formatting error!` + 完整托管栈，然后返回未解析文本。Mod 侧的 `try/catch` 拦不住这条日志，只能不去调用。
- 本体的正确入口：`CardModel.GetDescriptionForPile(PileType, Creature?)`，其内部就是 `DynamicVars.AddTo(locString)` 之后才格式化；`NCard` 的 UI 路径同样如此。
- `DynamicVarSet.AddTo(LocString)` 是 public；`LocString` 是 class（不是 struct），所以反射拿到引用后原地绑定有效。
- `CardModel` 上**不存在** `DynamicDescription`，因此现有回退链的第一项永远落空，实际命中的是裸模板 `Description`。

# 为什么直接用 GetDescriptionForPile

先试过「取 `Description` 模板 + 反射 `DynamicVars.AddTo(locString)` 再格式化」。实测能消掉 `{Damage:diff()}` 一类错误，速率从 137.8 条/秒降到 0.18 条/秒，但**没有归零**：剩下的错误全是 `No source extension could handle the selector named "IfUpgraded"`。反编译本体的私有重载后原因清楚——它在 `DynamicVars.AddTo` 之后还额外绑了 `IfUpgradedVar`、`OnTable`、`InCombat`、`IsTargeting`、`TargetType`、`GainsBlock`、`IsOstyAlive`、`energyPrefix`、`singleStarIcon` 等参数，这些不在 `DynamicVars` 集合里。自己复刻这张清单等于跟着本体改动跑，所以改为直接调用本体公开的 `GetDescriptionForPile(PileType, Creature?)`，也就是 `NCard` 走的那条路；`PileType` 取该卡自己的 `card.Pile?.Type`，不在任何摞里（商店、奖励）时取 `PileType.None`，与本体升级预览的用法一致。

# 频率选择

5000ms 是维护者定的值。按实测 137.8 条/秒折算，裸模板路径若仍在，5s 也只是把 626MB/小时降到约 25MB/小时，所以本 change 把「不再格式化裸模板」和「降频」放在同一个 change 里：前者消除错误，后者降低快照本身的序列化与 JSON 开销。事件类消息不受影响，桌宠的即时反馈仍靠 `PublishEvent`。
