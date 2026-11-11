## Context

见 `proposal.md`。旧的读档次数按 Bridge 连接边沿推断，已从桌面端移除。本机 `sts2.dll` 中，`SaveManager.IncrementNumReloads(SerializableRun, bool)` 只被已保存单人局和已保存多人局的建立流程调用。`NGame.LoadRun` 也会服务新开局，`SaveManager.LoadRunSave` 也会在主菜单刷新时读取存档，两者都不能当作读档次数。

Mod 目录已经由程序集位置确定，诊断日志写在同一目录。测试工程可以单独编译不依赖游戏程序集的记录类。

## Goals / Non-Goals

**Goals:**

- 每次游戏进入已保存对局的建立流程，本机次数加一。
- 记录落在 Mod 程序集同一目录，进程退出或短时写失败后仍能从文件恢复已成功写入的次数。
- 记录类可在没有游戏程序集的测试中验证。

**Non-Goals:**

- 不把次数放进协议或界面。
- 不读取、不改写游戏存档里的 `NumReloads`。
- 不在这次变更里拆分战斗时间线。

## Decisions

### 1. 观察游戏自己的读档计数入口

对 `SaveManager.IncrementNumReloads` 做 Harmony postfix。该方法返回 `Task`，postfix 在调用开始、任务对象返回时记一次，不等待任务结束。这样新开局和菜单预读存档不会被计入。

备选是挂 `NGame.LoadRun` 或 `LoadRunSave`。前者包含新开局，后者包含主菜单刷新，都会多计。

### 2. 文件放在 Mod 目录

路径为程序集目录下的 `save-loads.json`，与 `gamebuddy_bridge.dll` 和 `GameBuddyBridge.log` 相同。内容为：

```json
{
  "schema": "gamebuddy.save-load.v1",
  "count": 1,
  "loads": [{ "seq": 1, "at": "2026-10-17T14:00:00.0000000Z" }]
}
```

`count` 等于 `loads` 的条数。每次先写临时文件再替换，避免写到一半留下半份 JSON。写入失败只记诊断日志，不抛到游戏。文件中不放 seed、玩家名、路径或账号。

不读取 Electron `userData` 里已废弃的 `sl-stats.json`。

### 3. 记录与补丁分开

次数、时间戳和原子替换放在不引用游戏类型的记录类里，测试工程直接编译该类。Harmony 补丁只负责在入口被调用时通知记录类。补丁注册失败时写诊断日志，其余采集继续运行，并且不补记猜测次数。

## Risks / Trade-offs

- [风险] 游戏更新后该方法签名变化，补丁挂不上 → 诊断日志标明失败，文件保持上次成功写入的次数，不用轮询或断线补记。
- [风险] 异步方法在任务真正完成前就返回，失败的读档也会记一次 → 次数表示游戏已经进入读档建立流程，不表示读档画面已经出现。
- [风险] 多人已保存对局也会调用同一入口 → 与单人一起计入。本次不按模式拆分。
- [风险] 删除 Mod 目录会丢掉记录 → 这是用户指定的位置；不另存一份到桌面端。

## Migration Plan

1. 增加记录类和补丁，用临时目录测试连续两次记录、损坏文件和写失败。
2. 用本机 STS2 程序集构建 Mod。部署后需重启游戏才会加载新 DLL。
3. 回滚时去掉补丁即可。已有 `save-loads.json` 留在 Mod 目录，不主动删除。
