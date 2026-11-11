## Why

读档回退会把两次战斗拼进同一条时间线，但断线重连不能当成读档。需要先在本机记下游戏真正读取已保存对局的次数，供以后拆分观察片段。这些记录先不上云。

## What Changes

- Mod 在游戏进入已保存对局的建立流程时记一次读档。新开局和 Bridge 重连不计数。
- 累计次数和每次的时间写入 Mod 程序集所在目录的 `save-loads.json`。
- 该文件只留在本机，不进入 WebSocket、桌面端或云端。

## Capabilities

### New Capabilities

- `local-save-load-count`: 在 Mod 目录记录游戏确认的读档次数，不上传、不展示。

### Modified Capabilities

（无）

## Impact

- `mod/GameBuddyBridge`：增加只读观察和本地文件写入。
- 不修改 `gamebuddy.state.v1`、Electron、桌宠或个人数据。

## Non-goals

- 不自动出牌、不点击、不修改游戏存档或对局状态。
- 不根据这次计数拆分战斗时间线，也不重算流派分或战斗分。
- 不恢复已删除的主面板和桌宠读档数字，不根据断线推断读档。
- 不上传，也不把文件复制到 Electron `userData`。
