## Context

现有快照已有 `run.act`、`run.floor`、`map.start`、`map.current`、`map.visited`。菜单或游戏未开时 Mod 不推 state，Bridge 断开后桌面端也没有 live 对局。因此「进入对局」可以做成边沿：从无 live run 到有 live run。只维护本局计数，见修订后的 `proposal.md` 与 `specs/`。

## Goals / Non-Goals

**Goals:**

- 只在进入对局的边沿计数，不扫描会话内楼层回退。
- 起点用地图 start 判断，不用生命和金币。
- 只存本局 SL，不存生涯总数。

**Non-Goals:**

- 不新增协议事件。
- 不把计数送进 Agent prompt。
- 不统计「游戏进程没关、只在局内读档」且 Bridge 从未掉线的情况。

## Decisions

### 1. SL = 带着进度再次进入，不是水位回退

开局若在本局起点：本局 SL = 0。之后每次从「无 live 对局」进入且不在起点：本局 +1。同一段 LIVE 里后续快照不再加。从起点再进则清零，视为新一局。

「无 live 对局」包括：尚未收到 state、Mod 因 `RunManager` 为空停止推送、Bridge 断开、status 离开 live。

备选：比较前后两帧楼层。否决：误把正常推进/丢包当成 SL。

### 2. 起点的定义

本局起点 = `run.act === 1` 且（`map.current === map.start`，或 `visited` 只有 start）。第一层但已经离开 start 节点，算不在起点。

### 3. 主进程只存 thisRun

纯函数输出本局次数。live 才写 `userData/sl-stats.json`；replay/demo 只改内存。

```json
{ "schema": "gamebuddy.sl-stats.v1", "thisRun": 0 }
```

不写 lifetime。

### 4. 气泡按本局次数分档

计数 +1 时广播。thinking/advising 时台词单槽排队。不改 `data-pose`。

## Risks / Trade-offs

- [隔夜正常继续也会 +1] → 按定义这就是一次「不在起点进入」，接受。
- [局内读档但游戏进程和 Bridge 一直连着] → 会漏计。
- [GameBuddy 后开、玩家已在中途] → 仍会 +1。统计的是搭子看到的中途进入。
- [新一局从起点开] → 本局清零，上一局次数不保留。

## Migration Plan

不改事件白名单。先写检测纯函数和测试，再接主进程与 UI。回滚删除计数模块即可。

## Open Questions

无。起点以 `map.current === map.start` 为准。
