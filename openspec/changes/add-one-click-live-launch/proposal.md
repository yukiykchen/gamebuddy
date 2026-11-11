## Why

真实联调目前需要手动构建复制 Mod、启动桌面端并从 Steam 启动游戏，容易遗漏顺序或让 Replay Bridge 占用 Mod 的端口。需要一个保守的一键入口，把这些步骤变成可诊断的 Windows 启动流程。

## What Changes

- 新增 Windows PowerShell 一键实时启动脚本：校验游戏目录、游戏未运行、端口可用、Node/npm 与 Mod 构建环境；构建并复制只读 Mod，启动 GameBuddy，再启动游戏可执行文件。
- 新增 `npm run live:win` 入口，支持传入 `-Sts2Dir`；首次或特殊 Steam 库目录可明确指定游戏路径。
- 当 Mod 需要在游戏内首次启用时，脚本只提示用户确认，不试图绕过游戏的 Mod 管理界面。

## Capabilities

### New Capabilities

- `one-click-live-launch`: 在 Windows 机器上，以可验证的顺序启动真实游戏、只读 Bridge Mod 与 GameBuddy 桌面端。

## Impact

- 新增 `scripts/start-live.ps1` 与 npm 命令。
- 更新真实游戏启动文档。
- 不更改 Mod 协议、游戏状态、Agent 决策或游戏操作边界。
