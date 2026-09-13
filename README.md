# GameBuddy

GameBuddy 是面向《杀戮尖塔 2》的 Windows AI 桌面搭子。它通过只读 Mod 获取当前对局状态，在主面板和悬浮桌宠中提供选牌、路线、休息处以及小怪 / 精英 / Boss 攻略建议；它不会替玩家点击、出牌或修改游戏状态。

当前策略资料锁定《杀戮尖塔 2》stable `v0.107.1`。项目仍处于 `0.1.0` 原型阶段：核心链路和离线 Replay Harness 已实现，真实游戏 Mod 仍需在安装了游戏的 Windows 机器上完成最终验收。

## 立即体验

开发环境需要 Node.js 20+。首次安装依赖后，可直接启动带固定回放数据的完整界面：

```bash
npm ci
npm run demo
```

`demo` 会同时启动 Replay Bridge 和 Electron，不读取真实游戏，也不需要 LLM API Key。关闭 Electron 后，Replay Bridge 会一起退出。

如果只启动桌面端：

```bash
npm start
```

桌面端默认连接 `ws://127.0.0.1:27182`。没有运行 Replay Bridge 或游戏 Mod 时显示 `WAIT`，这是正常状态。

完整的安装、模型配置、真实游戏接入和故障排查见 [启动与开发指南](./docs/getting-started.md)。

## 当前功能

| 功能 | 状态 | 当前实现 |
| --- | --- | --- |
| 主面板 | 已实现 | 展示战斗、卡牌奖励、地图路线、休息处和事件选择状态 |
| 悬浮桌宠 | 已实现 | 置顶、拖动、托盘控制、状态提醒、选牌理由卡片、LLM 思考动画及遭遇攻略弹窗 |
| 实时游戏状态 Bridge | 已实现，待真机验收 | 只读采集角色、生命、牌组、遗物、药水、地图、敌人和事件 |
| 卡牌奖励 Agent | 已实现 | 逐张分析优缺点、适用场景和 Boss / 精英适配；桌宠展示选择、理由、风险、来源与置信度，支持建议跳过 |
| 地图路线 Agent | 已实现 | 结合生命、金币、遗物、精英、商店和休息处为可达路线评分；桌宠区分左右同类型节点，同分时明确提示可任选 |
| 休息处 Agent | 已实现 | 用社区策略 Skill 比较回血与逐张升级收益，结合牌组、遗物、地图和近期强敌给出具体建议 |
| 问号事件 Agent | 已实现 | 接入 66 条 Spire Codex 事件和多页面决策树，逐项展示收益、代价与风险；致命或资源不足选项不可推荐 |
| 全遭遇攻略 | 已实现 | 覆盖 stable `v0.107.1` 的 63 个普通遭遇、12 个精英和 12 个 Boss；每场只弹一次 |
| LLM 复核 | 已实现，可选 | 在规则候选范围内复核；未配置密钥时自动退回规则模式 |
| Replay / 录制 / 协议校验 | 已实现 | 可离线回放、录制真实对局并验证协议与事件 |
| 战斗出牌 Agent | 未实现 | 当前只展示真实战斗状态，不推荐具体出牌顺序 |
| 自动操作游戏 | 不计划实现 | 产品边界是“只提供建议”，不会控制鼠标或调用选择接口 |

更细的完成度、验证状态和限制见 [功能实现状态](./docs/feature-status.md)。

## 核心工作方式

```text
Slay the Spire 2
  -> GameBuddyBridge（只读 Mod）
  -> localhost WebSocket / gamebuddy.state.v1
  -> Electron 主进程 + Observation Store
  -> 规则 Agent + 可选 LLM 复核
  -> 主面板 + 悬浮桌宠

开发时也可将第一、二层替换为 Replay Bridge，其余链路不变。
```

Agent 的设计原则是“规则先产生合法候选，模型只做受限复核”：

- 地图建议只能从真实可达路线中选择。
- 休息处建议只能在回血和真实可升级卡牌中选择。
- 卡牌奖励建议只能在真实候选牌和 `SKIP` 中选择。
- 只有 `exact=true` 的 Boss / 精英才能被模型视作已确定遭遇。
- 外部接口失败时保留本地规则结果，不阻塞 UI。

桌宠会在真实 LLM 请求开始时进入思考状态，并在请求完成或失败后结束动画。卡牌结果返回后，桌宠左侧会展开建议卡，展示推荐牌（或跳过）、结合当前局势的理由、主要优点、风险、决策来源和置信度；关闭建议卡不会影响游戏或 Agent 后续决策。

## 卡牌与遭遇知识

卡牌奖励 Agent 会综合：

- 当前完整牌组和升级状态；
- 游戏实机格式化卡面效果，以及普通能量/X 费、星/X 星费；实机字段缺失时才使用带来源标记的 Codex 回退；
- 遗物、药水、生命、能量和金币；
- 当前章节的完整地图和可达路线；
- 已确定 Boss、已知近期精英和当前区域可能遭遇；
- Spire Codex 卡牌与敌人机制数据；
- 本地全卡评价先验和社区对局证据。

全卡评价位于 `agent/knowledge/card-evaluations.json`，可筛选总表位于 `docs/card-evaluations.csv`，字段和更新方法见 [卡牌评价知识库](./docs/card-evaluations.md)。

遭遇机制覆盖 Spire Codex 在 stable `v0.107.1` 收录的 63 个普通遭遇、12 个精英和 12 个 Boss。Boss / 精英人工策略位于 `agent/knowledge/encounter-strategies.json`，记录牌组检查、危险窗口、目标优先级、应对方式、常见失误、来源和置信度；普通遭遇在没有人工档案时基于已确认怪物机制和实际敌人组合生成同结构建议，并明确标注“机制推导”，不冒充社区共识。

问号事件使用 `agent/data/codex/events.json` 中的 39 个地区事件、18 个共享事件和 9 个远古事件。Agent 优先使用游戏实机显示的动态数值，再用稳定事件/页面/选项 ID 与 Codex 决策树交叉确认；随机奖励不会被展开成虚构的具体物品，资料不足时也不会默认推荐第一个按钮。

## 休息处策略 Skill

休息处 Agent 使用 [`rest-site-strategy`](./agent/skills/rest-site-strategy/SKILL.md)。它不再依赖少量硬编码卡名，而是逐张比较升级前后文本，并识别降费、抽牌/能量、保留/消耗变化、倍率成长、多目标与控制等升级信号。评分还会结合卡牌实际费用、牌组机制协同、Act、生命比例和未来三层内的精英/Boss；模型复核时会同时收到完整牌组、遗物、药水、地图和最多 10 个真实升级候选。

策略与权重锁定 stable `v0.107.1`，社区来源和内化边界见 [社区证据](./agent/skills/rest-site-strategy/references/community-evidence.md)。这些规则是可解释先验，不是“固定升级榜”：生命接近斩杀线时，回血可以压过高价值升级；版本更新后必须复核卡牌文本和权重。

## LLM 配置

LLM 是可选能力。复制示例环境变量并填写自己的 API Key：

```bash
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

默认配置：

```dotenv
GAMEBUDDY_LLM_BASE_URL=https://ai.gs88.shop
GAMEBUDDY_LLM_MODEL=gpt-5.5
GAMEBUDDY_LLM_WIRE_API=responses
GAMEBUDDY_LLM_REASONING_EFFORT=xhigh
GAMEBUDDY_LLM_API_KEY=
```

不要提交 `.env`。如果没有配置 Key，启动日志会显示 `GameBuddy LLM: rules only`，选牌、路线和休息处仍可使用规则建议。

## 接入真实游戏

真实 Mod 目前只支持 Windows 开发环境，需要：

- Windows 10/11 x64；
- Steam 版《杀戮尖塔 2》；
- Node.js 20+；
- .NET 9 SDK；
- 可用的 Godot .NET SDK 4.5.1；
- 游戏本地程序集 `sts2.dll` 和 `0Harmony.dll`。

构建并安装 Mod：

```powershell
npm run mod:build -- -Sts2Dir "C:\Program Files (x86)\Steam\steamapps\common\Slay the Spire 2"
```

重启游戏并启用 `GameBuddy Bridge`，进入一局后启动桌面端：

```powershell
npm start
```

先用以下命令确认 Mod 已发出合法快照：

```powershell
npm run harness:inspect -- --once
```

看到 `source=sts2-mod-bridge` 且桌面端变为 `LIVE`，说明实时链路已接通。逐项真机验收见 [Windows 联调验收](./docs/windows-validation.md)，Mod 自身说明见 [GameBuddyBridge](./mod/GameBuddyBridge/README.md)。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run demo` | 一键启动 Replay Bridge 与 Electron |
| `npm start` | 启动 Electron 并连接默认 Bridge |
| `npm run harness:replay` | 单独回放固定状态数据 |
| `npm run harness:inspect -- --once` | 读取一份 Bridge 状态并输出诊断 |
| `npm run harness:record` | 录制真实对局，供后续离线回放 |
| `npm run harness:validate-all` | 执行完整协议与 Harness 工程门禁 |
| `npm run harness:smoke` | 校验 Replay WebSocket 首包 |
| `npm run knowledge:cards` | 按指定 stable / beta 版本刷新全卡评价 |
| `npm run mod:build -- -Sts2Dir ...` | 在 Windows 构建并安装游戏 Mod |
| `npm run dist:win` | 构建 Windows NSIS 安装包 |
| `npm run codex` | 使用项目隔离配置启动 Codex CLI |

## 文档导航

- [启动与开发指南](./docs/getting-started.md)：从零启动、模型配置、真实游戏接入和排错。
- [功能实现状态](./docs/feature-status.md)：每项能力的完成度、实现位置、验证情况和限制。
- [数据契约](./docs/data-contract.md)：状态、事件、Observation 和 Recommendation schema。
- [卡牌评价知识库](./docs/card-evaluations.md)：版本范围、来源、评分字段和更新方法。
- [Windows 联调验收](./docs/windows-validation.md)：真实游戏端到端验收清单。
- [Harness 开发指南](./harness/README.md)：回放、录制、探针和固定夹具。
- [GameBuddyBridge](./mod/GameBuddyBridge/README.md)：Mod 采集内容、构建方式和协议边界。

## 发布与验证

仓库包含三条 GitHub Actions 工作流：

- Pull Request 或主干推送运行 Harness 校验和 Replay 冒烟测试；
- `windows-latest` 构建 `GameBuddy-Setup-*.exe`；
- 带有本地游戏安装的 `self-hosted, windows, sts2` Runner 构建 Mod。

公开 Runner 无法获得游戏私有程序集，因此不能构建 `gamebuddy_bridge.dll`。Windows 安装包也不包含能够绕过游戏安装要求的 Mod 二进制；Mod 必须在合法安装游戏的 Windows 环境中构建。

## 已知限制

- 当前不提供战斗出牌顺序建议。
- Mod 已编码实现，但尚未记录一轮完整的 Windows stable `v0.107.1` 真机验收结果。
- 游戏处于 Early Access；版本变化后需要刷新卡牌知识，并复核 Boss / 精英档案。
- Spire Codex 或模型服务不可用时，资料丰富度会下降，但规则模式仍可运行。
- 当前主要面向单人对局；多人模式的状态语义和策略尚未专项验证。
- 建议是辅助信息，不保证通关或避免战损。
