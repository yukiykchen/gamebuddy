# GameBuddy 编码约定

改可观察行为时必须先走 OpenSpec，不要直接改业务代码。

可观察行为包括：主面板/桌宠 UI、`gamebuddy.state.v1` / 事件协议、`agent/` 建议与任务、`mod/GameBuddyBridge` 采集、Harness 协议与 Replay 语义。

## 必须

1. 先 `openspec list`。没有合适的 active change 时，先 propose（可先 explore）。
2. 已有 change 且 `tasks.md` 存在时，再 apply，按任务实现。
3. **`openspec/changes/<name>/tasks.md` 出现之前，禁止修改业务代码。** 提案阶段只写 `openspec/changes/` 下的计划文件。
4. 按当前工具调用，不要在 shell 里执行 `/opsx-*`：

| 工具 | 提案 | 实现 |
| --- | --- | --- |
| Cursor | `/opsx-propose` | `/opsx-apply` |
| Claude Code | `/opsx:propose` | `/opsx:apply` |
| Codex | `$openspec-propose` | `$openspec-apply-change` |

## 可以跳过 OpenSpec

- 错别字、格式化、纯注释
- 只改 `openspec/config.yaml`、本文件、`CLAUDE.md` 或 `.cursor/rules/`

计划文档用中文；OpenSpec 标题和 SHALL/MUST 保持英文。
