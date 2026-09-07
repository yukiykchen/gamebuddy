# GameBuddy

GameBuddy 是面向《杀戮尖塔 2》的 Windows AI 桌面搭子原型，目标是在游戏运行时提供：

- 战斗中的出牌顺序和风险解释（暂缓）
- 卡牌奖励中的选牌建议
- 地图节点和路线选择

当前 Demo 已经包含一个独立的透明悬浮桌面宠物。它会常驻桌面、置顶显示、响应实时状态变化，并可以点击打开完整决策面板。

## 启动原型

```bash
npm install
npm start
```

一键启动桌面宠物和回放数据：

```bash
npm run demo
```

这个命令只使用 Replay Bridge，不读取真实游戏；真实 Mod 接入后仍然使用同一个桌面端入口。直接执行 `npm start` 时，没有真实 Bridge 就只显示等待状态，不再用虚拟对局填充界面。

### 桌面宠物操作

- 左键单击宠物：打开 GameBuddy 主面板。
- 按住宠物拖动：移动宠物位置。
- 右键单击宠物：打开原生菜单，可打开主面板或关闭桌面宠物。
- 关闭桌面宠物不会退出 GameBuddy；可从系统托盘的“显示 / 隐藏桌面宠物”重新显示。

## 接入真实游戏

需要 Windows、Steam 版《杀戮尖塔 2》、Godot .NET 4.5.1 和 .NET 9 SDK。先构建并自动复制只读 Mod：

```powershell
npm run mod:build
# 或指定游戏目录
npm run mod:build -- -Sts2Dir "C:\Program Files (x86)\Steam\steamapps\common\Slay the Spire 2"
```

启动游戏并进入一局后，再执行 `npm start`。桌面端会连接 `ws://127.0.0.1:27182`，状态从 `WAIT` 变为 `LIVE`。可以先用 `npm run harness:inspect -- --once` 验证 Mod 是否真的发出了合法状态。

### Windows 实际安装流程

1. 在 Windows 上构建 Mod，并指定 STS2 安装目录：

   ```powershell
   dotnet build .\mod\GameBuddyBridge\GameBuddyBridge.csproj -c Release `
     -p:Sts2Dir="E:\SteamLibrary\steamapps\common\Slay the Spire 2" `
     -p:CopyModAfterBuild=true
   ```

2. 确认以下文件位于游戏目录：

   ```text
   <STS2>\mods\GameBuddyBridge\GameBuddyBridge.json
   <STS2>\mods\GameBuddyBridge\gamebuddy_bridge.dll
   ```

3. 完整退出并重新启动游戏，在 Mod 设置中启用 `GameBuddy Bridge`。游戏只会在启动时加载 Mod。
4. 进入一局游戏后启动 GameBuddy：`npm start`。
5. 用以下命令确认真实快照：

   ```powershell
   npm run harness:inspect -- --once
   ```

   输出中的 `source=sts2-mod-bridge` 和 `LIVE` 表示数据来自真实游戏；没有启动游戏时不会自动填充虚拟对局。

## 本地 Harness 回放

不需要启动游戏即可回放一组实时对局状态：

```bash
npm run harness:validate
npm run harness:replay
# 另开终端
npm start
```

自动化首包检查：

```bash
npm run harness:smoke
```

Windows 真实联调后，可以用 `npm run harness:record` 保存一局状态，再把录制文件交给 Replay Bridge，避免 Agent 开发依赖正在运行的游戏。
录制器会把状态快照和事件分别保存，事件文件名默认在状态文件后追加 `.events.json`。

首次接入 Windows Mod 时，建议先使用 `npm run harness:inspect -- --once` 做无界面诊断，确认状态采集成功后再启动 Electron。

提交前的统一工程门禁：

```bash
npm run harness:validate-all
```

宠物在 Replay Bridge 推送攻击意图时进入警戒状态，在手牌变化时进入思考状态。未来只需让 STS2 Mod Bridge 遵循同一份数据契约，桌面端无需改动数据接入方式。

## Mac 开发，Windows 发布

本项目可以在 macOS 上开发，使用 GitHub Actions 的 `windows-latest` Runner 生成 Windows 安装包。手动触发或推送 `v*` 标签后，工作流会产出 `GameBuddy-Setup-*.exe` 构件。

本地也可以尝试打包：

```bash
npm run dist:win
```

在 macOS 上交叉构建 NSIS 安装包可能需要 Wine 和额外的 Windows 构建工具，因此团队协作时推荐使用仓库内的 Windows CI。最终的游戏 Mod Bridge、窗口行为和 DPI 适配仍需在 Windows 机器上验证。

Electron 启动后可以在三个决策工作台之间切换。启动时会尝试连接 `ws://127.0.0.1:27182`；没有 Mod Bridge 时显示 `WAIT`，`npm run demo` 明确使用回放数据，真实游戏状态则显示 `LIVE`。

## 后续接入

接入层约定见 [docs/data-contract.md](./docs/data-contract.md)。第一阶段建议先实现：

1. STS2 Mod Bridge：导出完整状态快照和关键事件。当前初版采集器位于 [mod/GameBuddyBridge](./mod/GameBuddyBridge)。
2. 桌面端状态适配器：校验 schema、断线重连、保留最近快照。
3. 决策引擎：先做规则 + 搜索，再逐步接入模型，保证建议可解释、可回放。

应用只提供建议，不自动点击或代替玩家操作；这使调试、回放和用户信任都更容易建立。

选牌建议会结合当前牌组、遗物、章节、近期精英/Boss 与 [Spire Codex](https://spire-codex.com) 的卡牌资料及社区对局统计。外部 API 不可用时会自动使用本地规则，并且始终允许把“跳过奖励”作为候选，避免牌组被低价值卡稀释。

项目内置一份可刷新的全量卡牌评价知识库：机器读取 `agent/knowledge/card-evaluations.json`，人工筛选使用 `docs/card-evaluations.csv`。每张卡都包含档位、原创中文评价、适用场景、避用场景和可用的专家视频时间点。知识库明确记录游戏版本和 stable/beta 渠道，综合同版本社区统计与带补丁版本的高手 Tier 证据，但只作为单卡基础先验；奖励 Agent 会把评价条件与完整牌组、遗物、生命、路线和敌人对照后再做最终推荐。数据结构和更新方式见 [docs/card-evaluations.md](./docs/card-evaluations.md)，平衡更新后执行 `npm run knowledge:cards` 即可重新生成。

## 工程边界

```text
STS2 Mod Bridge / Replay Bridge
        -> localhost WebSocket
        -> Electron main process bridge
        -> main panel + floating pet
        -> agent loop
```

主进程只负责连接、校验边界和广播状态。决策 Agent 在独立的 `agent/` 模块中，通过观察对象工作，避免把游戏读取、桌面展示和策略推理耦合在一起。

当前主进程已经通过 [harness/observation-store.js](./harness/observation-store.js) 整理最新状态、事件历史和 freshness。[agent/](./agent/) 消费这份观察对象，先做路线建议 `map_route`，进入休息处后再给 `rest_site`：回血还是升级哪一张牌。规则给可达路线和火堆选择打分；有密钥时再用模型解释。战斗出牌暂缓。

本地 `.env`（已 gitignore）会提供模型接口。启动时自动读取，默认：

- Base URL：`https://ai.gs88.shop`
- Model：`gpt-5.5`
- API：Codex `responses`
- Reasoning：`xhigh`

项目内 Codex CLI：

```bash
npm run codex
```

它使用 `.codex-cli/` 和同一套 `.env` 密钥，不会改掉 ChatGPT 桌面版那份 `~/.codex` 本地代理配置。

没有 API Key 时只用规则，桌面端仍然能给出下一步路点。

## Mod 构建边界

公开 GitHub Runner 没有《杀戮尖塔 2》私有程序集，因此不能在普通 CI 中编译 `GameBuddyBridge.dll`。仓库提供了一个需要自有 Windows Runner 的工作流：Runner 标签为 `self-hosted, windows, sts2`，机器上需要 Godot .NET 4.5.1、.NET 9 和本地 STS2 安装。普通 CI 会先验证 Mod 文件形状和协议标记，避免采集器悄悄漂移。

真实游戏联调按 [docs/windows-validation.md](./docs/windows-validation.md) 执行。推送 `v*` tag 后，Windows 工作流除了上传安装包构件，还会创建 GitHub Release 并附带 `.exe`。
