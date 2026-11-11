## Why

桌宠身体或气泡的普通点击目前会意外打开“个人数据”，干扰拖动、查看建议和桌面陪伴；同时最近对局列表只显示摘要，玩家无法核对某一局最终形成的牌组与遗物。需要把打开入口收敛到明确菜单，并让已落盘的终局构筑可直接复盘。

## What Changes

- 移除桌宠身体和气泡普通点击触发“个人数据”的行为；气泡已有的攻略重开和建议卡展开交互保持不变。
- 保留桌宠右键菜单和系统托盘菜单中的“个人数据”入口。
- 让任意历史对局行可点击展开，并显示该局结束时的完整牌组与遗物；缺失数据使用明确空态，不伪造内容。
- 扩展个人数据 dashboard 投影，使每条历史记录携带渲染终局牌组和遗物所需的稳定字段，同时保持历史仅在本地处理。
- 完成验证后重新编译 GameBuddyBridge，并把 `gamebuddy_bridge.dll` 部署到指定的本地游戏 Mod 目录。

## Capabilities

### New Capabilities

- `personal-run-history`: 定义个人数据历史行的选择、展开、终局牌组与遗物展示以及缺失数据空态。

### Modified Capabilities

- `pet-overlay`: 将桌宠普通点击从个人数据入口中移除，同时保留气泡的上下文操作、拖动与右键菜单。

## Impact

- 桌宠交互：`src/pet.js`，以及 `review/window-lifecycle.test.js` 或新增桌宠交互测试。
- 个人数据投影与界面：`review/service.js`、`src/review-ui.js`、`src/review-renderer.js`、`src/styles.css`、`review/service.test.js`、`review/ui.test.js`。
- 窗口入口：`main.js` 与现有 preload IPC 保持兼容，右键和托盘菜单继续调用 `showPersonalData()`。
- Mod 交付：`mod/GameBuddyBridge/GameBuddyBridge.csproj` 的 Release 产物将复制到 `/Users/houwenhao/Applications/steam/steamapps/common/Slay the Spire 2/mods/GameBuddyBridge/gamebuddy_bridge.dll`。

## Non-goals

- 不新增云同步、历史编辑、牌组对比、遗物评分或 LLM 复盘。
- 不改变历史保留数量、终局数据采集协议或游戏状态。
- 不增加自动点击、自动出牌或任何修改游戏状态的行为。
