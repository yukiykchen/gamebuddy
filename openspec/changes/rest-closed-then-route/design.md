## Context

见 `proposal.md`。`selectTask` 在 `rest.opened` 之后若 `isRestSite(state)` 仍为真会一直返回 `rest_site`。火堆选完人还在格子上，`map.opened` 即使清掉旧建议，下一帧又按格子重新出休息建议。

## Goals / Non-Goals

**Goals:** 用休息选择开/关驱动任务；能读到回血还是升级。

**Non-Goals:** 不扫所有节点类型的通用完成事件。

## Decisions

### 1. 事件 `rest.closed`

`data`: `{ action: "HEAL"|"SMITH"|null, cardName?: string, hpBefore?: number, hpAfter?: number }`。

Mod：`atRest` 下降沿发送，并用打开时快照对比生命/升级推断 `action`。

桌面：`observation-store` 在连续两帧状态上做同样推断并写入 `recentEvents`（旧 Mod 无事件也能切）。已有 `rest.closed` 则不再合成。

### 2. `selectTask`

休息选择未完成（最近相关事件是 `rest.opened`，或没有关闭事件且仍在休息 UI）→ `rest_site`。  
否则若 `routeChoiceCount > 1` → `map_route`（允许人还在 RestSite 格子上）。

不再仅因 `currentNode === RestSite` 锁死休息任务。

### 3. 主窗口

`showingRest` 只看 `recommendation.task === 'rest_site'`，不看脚下格子。

## Risks / Trade-offs

- [遗物在火堆外回血被当成 rest.closed] → 只在上一帧已是休息处时推断。
- [用户尚未重编译 Mod] → 桌面合成事件仍能工作。

## Migration Plan

协议多一个事件名。旧客户端忽略即可。

## Open Questions

无。
