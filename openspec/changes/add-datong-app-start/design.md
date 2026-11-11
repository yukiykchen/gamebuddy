## Context

见 `proposal.md`。大同应用 GameBuddy 已在轻量版登记，Appkey 用于客户端上报。Electron 主进程在启动后发送一次 HTTPS 请求。

## Goals / Non-Goals

**Goals:**

- 启动后上报 `app_start`。
- 同一台机器复用本地设备标识。

**Non-Goals:**

- 不上传对局和密钥。
- 不因上报失败改变现有流程。

## Decisions

1. **使用灯塔 HTTP 上报。** Electron 主进程直接 POST `https://otheve.beacon.qq.com/analytics/v2_upload`，不额外安装前端 SDK。
2. **设备标识只存在 userData。** 文件名 `datong-device-id`，不进入仓库。
3. **失败吞掉。** `reportAppStart` 捕获网络错误，不抛到启动流程。

## Risks / Trade-offs

- [应用登记在当前账号可见的 demo 空间] → 这是该账号目前唯一有权限的空间。事件可以在大同里看到。
- [Appkey 写在客户端] → 大同 Web 端 Appkey 本来就随客户端分发。

## Migration Plan

无旧埋点可迁移。删除上报调用即可停止。

## Open Questions

无。
