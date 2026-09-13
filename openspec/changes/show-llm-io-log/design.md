## Context

见 `proposal.md`。`agent/llm/openai.js` 的 `logLlm` 已把开始、系统提示、输入、原始输出、解析结果打到 stdout。主窗口没有订阅。`preload.js` 已有 `onAgentStatus`，但那只是 idle/thinking/ready，没有正文。

## Goals / Non-Goals

**Goals:**

- 把现有 console 日志原样镜像到主窗口。
- 密钥脱敏；进程内环形缓冲，不落盘。

**Non-Goals:**

- 不改 prompt 内容，不把日志当 Agent 记忆。

## Decisions

### 1. 在 `createOpenAiClient` 增加 `onLog`

每次 `logLlm` 同时回调 `{ requestId, task, phase, label, text, at }`。`text` 为完整字符串（对象用 `JSON.stringify(..., null, 2)`）。若 `text` 含 `apiKey` 则替换为 `***`。

备选：只把最终 parsed 塞进 recommendation。否决：用户要看完整输入输出。

### 2. 主进程环形缓冲，IPC `bridge-llm-log`

保留最近 80 条事件（约十几次调用）。`broadcast` 每次带上 `{ entries }`。主窗口 `did-finish-load` 再发一次。`clear-llm-log` 清空。

不写 `userData`。

### 3. 主窗口底部 `<pre>` 面板

放在 `#view-container` 下面，不进 `render()` 模板，避免切页把滚动位置和全文冲掉。可复制、可清空。桌宠不接。

## Risks / Trade-offs

- [地图 payload 很大，面板会很长] → 可滚动；用户明确要完整日志。
- [面板占主窗口高度] → 限制 `max-height`，建议区仍在上方。
- [日志含牌组/遗物] → 仅本机展示，与现有终端日志相同。

## Migration Plan

只加回调和 UI。回滚删除面板与 `onLog` 即可，stdout 日志保留。

## Open Questions

无。
