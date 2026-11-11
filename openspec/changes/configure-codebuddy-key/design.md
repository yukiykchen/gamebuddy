## Context

见 `proposal.md`。现有客户端在 `agent/llm/openai.js`，启动时读取 `.env` 或进程环境，认证固定为 `Authorization: Bearer`。`normalizeApiRoot` 会保留以 `/v2` 结尾的根地址。Electron 的系统对话框没有文本输入框。

## Goals / Non-Goals

**Goals:**

- 右键只打开配置框；密钥页链接放在配置框里，点击后才打开。
- 有这份配置时，同一次模型调用先走它；失败后再走原来的客户端。
- 没有这份配置时，不改变现有请求。

**Non-Goals:**

- 不替换或清空原来的环境变量配置。
- 不写操作系统环境变量。
- 不在原来的客户端上改认证头。

## Decisions

1. **优先通道和原来的客户端分开。** 本地 JSON 只保存 API Key 和网关。每次调用包一层：先请求优先通道，抛错、超时或没有可用 JSON 时，再用原来的客户端发同一请求。调用方取消时不改走原来的客户端。两个都没有密钥时仍是规则模式。
2. **网关默认是公司个人 token 网关。** 输入框预填 `https://copilot.tencent.com/v2/`，旁边写明「网关」和「公司个人 token 网关」。用户改过的地址按原样规范化后保存。主机为 `copilot.tencent.com` 时请求 `/chat/completions`，认证头使用 `X-Api-Key`。其他网关沿用原来的接口类型和 `Authorization: Bearer`，只替换密钥和根地址。
3. **公司网关使用已验证的默认模型及流式请求。** 弹窗不收集模型。按用户指定的内网 v4.1 Flash，优先公司通道固定使用 `deepseek-v4.1-flash`，并使用 `stream: true`。外部网关及原环境变量客户端继续沿用各自模型和流式设置，不受此规则影响。2026-10-20实测非流式返回11101，旧默认ID `deepseek-flash` 返回11102；正确ID与流式组合返回200 SSE。
4. **存放在 Electron `userData`。** 文件权限收紧。保存后立刻重建建议、构筑说明和弹幕三个客户端。空白密钥不写入。
5. **对话框用独立小窗口。** 右键只打开小窗口。窗口内的「公司内网 API 获取链接」再调用 `shell.openExternal`。小窗口通过 preload 读取和保存。

## Risks / Trade-offs

- [公司网关可能还要求 CLI 指纹头] → 第一版只对 `copilot.tencent.com` 发送 `X-Api-Key`。真实请求若因此失败，同一轮回到原来的客户端。
- [优先通道超时后再走原来的客户端会更慢] → 这是同一轮请求的失败回退，不提前放弃原来的结果。
- [密钥以明文留在 userData] → 文件权限收紧，日志打码。不写入仓库、不写入系统环境。

## Migration Plan

没有本地网关文件时，启动行为与现在相同。回退时删除 userData 中的该文件并重启，只剩环境变量和 `.env`。

## Open Questions

无。

## Gateway window foreground behavior

配置窗使用alwaysOnTop及screen-saver层级，支持全屏工作区可见。每次用户主动打开时restore（如需）、show、moveTop并聚焦窗口和WebContents；已创建时复用窗口。首次ready-to-show也执行相同激活逻辑，保留销毁回调保护。原生窗口工厂独立供Electron smoke复用，不引入周期性焦点操作。本轮仅源码修改，不构建安装包。

## Native menu bar

截图白条为Windows原生File/Edit菜单，现有autoHideMenuBar只能隐藏，单独Alt仍可唤出（本机Electron类型文档明确说明）。在win32/linux配置窗口创建时调用removeMenu彻底移除菜单；不清空全局应用菜单，不拦截输入事件，从而保留原有编辑快捷键和Mac系统Edit菜单。本轮仅源码，不打包。
