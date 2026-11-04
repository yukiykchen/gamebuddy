# Tasks

- [x] 1. 采集器快照间隔抽成具名常量并从 200ms 改为 5000ms，事件类消息保持即时。
- [x] 2. 卡面描述导出改为「先绑定该卡 `DynamicVars` 再格式化」，解析失败或变量不可用时导出 `null` 并标记 `unavailable`，不再格式化裸模板。
- [x] 3. 商店卡与快照卡两处调用点统一走新的描述导出路径；遗物、药水、事件路径不动。
- [x] 4. 保持 `harness/validate-mod.js` 的 marker 断言可通过（`DynamicDescription`、`DescriptionSource` 等字面串仍在源码中）。
- [x] 5. 验证：`npm run test:syntax`、`npm run harness:validate-mod`、`npm run harness:validate-all`；Mod 需 `dotnet build`（.NET 9 SDK + `STS2_DIR`）。
- [x] 6. 实机验收：v0.107.1 中文环境打一局，核对 `godot.log` 中 `Localization formatting error` 计数为 0、日志增速远低于 10MB/分钟、桌面端收到的卡面描述是已解析数字。

## 验收实测（v0.107.1 zh_CN，铁甲战士局内）

| 指标 | 修复前 | 修复后 |
| --- | --- | --- |
| `Localization formatting error` | 137.8 条/秒（514,821 条 / 62 分钟） | 0 条（75 秒局内采样，本会话累计 0） |
| 日志增速 | 21.2MB/分钟 | 5.5KB/分钟 |
| 导出的卡面文本 | `造成{Damage:diff()}点伤害。` | `造成6点伤害。`（快照 25 条描述，花括号残留 0） |
