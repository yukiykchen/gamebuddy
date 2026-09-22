# GameBuddy 启动与开发指南

这份文档覆盖三种源码使用方式：不连接游戏的 UI Demo、连接真实游戏的 Windows 模式，以及录制后离线开发 Agent。当前 Windows 安装包只包含桌面端，不包含游戏 Mod 或图形化 API Key 设置；第一次完整接入真实游戏建议按本文从源码运行。

## 1. 环境要求

只运行 Demo：

- Node.js 20+
- npm
- 支持 Electron 图形界面的 Windows、macOS 或 Linux 桌面环境

连接真实游戏还需要：

- Windows 10/11 x64
- Steam 版《杀戮尖塔 2》
- [.NET 9 SDK](https://dotnet.microsoft.com/download/dotnet/9.0)
- [MegaDot / Godot .NET 4.5.1](https://megadot.megacrit.com/)，用于还原 `Godot.NET.Sdk/4.5.1`
- 游戏目录中的 `data_sts2_windows_x86_64\sts2.dll` 和 `0Harmony.dll`

项目策略数据当前对应 stable `v0.107.1`。如果游戏版本不同，Bridge 可能仍能连接，但类名、字段、卡牌数值和遭遇机制都需要重新验证。

## 2. 安装依赖

先安装 Git，然后在 PowerShell 或终端执行：

```bash
git clone https://github.com/yukiykchen/gamebuddy.git
cd gamebuddy
npm ci
```

如果仓库已经存在，则在仓库根目录更新并安装依赖：

```bash
git pull --ff-only
npm ci
```

仓库包含 `package-lock.json`，开发和 CI 优先使用 `npm ci`。只有明确需要升级依赖或重写 lockfile 时才使用 `npm install`。

OpenSpec CLI 已作为项目本地开发依赖安装。开发可观察行为前先查看 active change：

```bash
npm run spec:list
```

规范文件完成后可对指定 change 做严格校验：

```bash
npm run spec:validate -- export-runtime-card-effects
```

CLI 由 `package-lock.json` 锁定，不需要再全局安装 `openspec`。

## 3. 不连接游戏启动 Demo

最短路径：

```bash
npm run demo
```

该命令会：

1. 在 `127.0.0.1:27182` 启动 Replay Bridge；
2. 循环读取 `harness/fixtures/combat-run.json`；
3. 以 `GAMEBUDDY_BRIDGE_MODE=replay` 启动 Electron；
4. Electron 退出时关闭 Replay Bridge。

界面显示 `回放 DEMO`，表示数据来自固定夹具而不是真实游戏。

也可以分两个终端启动，便于观察日志：

终端 1：

```bash
npm run harness:replay
```

终端 2：

```bash
npm start
```

如果 `27182` 已被游戏 Mod 或另一个 Replay Bridge 占用，先关闭已有进程，不要同时启动两个 Bridge。

## 4. 配置 LLM

LLM 只负责在规则生成的合法候选中复核和解释，不是应用运行的必需项。没有 API Key 时，卡牌、路线、休息处、事件和商店 Agent 自动使用规则模式。

macOS / Linux：

```bash
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

编辑 `.env`：

```dotenv
GAMEBUDDY_LLM_BASE_URL=https://api.deepseek.com/v1
GAMEBUDDY_LLM_API_KEY=your_api_key
GAMEBUDDY_LLM_MODEL=deepseek-v4-pro
GAMEBUDDY_LLM_WIRE_API=chat
GAMEBUDDY_LLM_REASONING_EFFORT=high
GAMEBUDDY_LLM_THINKING=enabled
```

配置说明：

- `GAMEBUDDY_LLM_API_KEY` 必须是该模型服务签发的 API Key，不是 GitHub PAT、Steam Token 或其他账号令牌。
- `GAMEBUDDY_LLM_BASE_URL` 可写服务根地址（如 `https://example.com`）或 `/v1` 地址；GameBuddy 会自动补齐且不会重复添加 `/v1`。
- 服务支持 OpenAI Responses API 时使用 `responses`；只兼容 `/v1/chat/completions` 时改为 `chat`。
- `GAMEBUDDY_LLM_MODEL` 必须填写该服务实际开放的模型 ID，默认值不代表所有服务都可用。
- 需要更快实时建议时设置 `GAMEBUDDY_LLM_THINKING=disabled`；Kimi K2 开启内部思考时路线/选牌可能超过 30 秒，禁用后通常约 3-5 秒。
- 当前实现只读取项目根目录 `.env` 或启动进程中的 `GAMEBUDDY_LLM_*` / `OPENAI_API_KEY`，不会自动读取 Codex CLI 的配置或鉴权文件。

密钥优先级为 `GAMEBUDDY_LLM_API_KEY`、`OPENAI_API_KEY`。`.env` 已被 Git 忽略，不要把密钥写入 `.env.example`、README、fixture、截图、日志或提交记录；如果密钥曾被公开，应立即在对应服务后台撤销并重新生成。

启动时查看终端日志：

```text
GameBuddy LLM: deepseek-v4-pro · chat · env
```

如果显示：

```text
GameBuddy LLM: rules only
```

说明没有取得可用密钥，但其余功能仍能启动。

确认配置是否真正可用：

1. 从仓库根目录运行 `npm start`，确认启动日志不是 `rules only`；
2. 进入卡牌奖励、地图分叉、休息处、事件选择或商店，让 Agent 发起一次真实复核；
3. 在终端或主面板 LLM 日志中确认出现“解析结果”，而不是 HTTP 错误。

常见 HTTP 错误：`401` 通常表示 Key 错误或失效；`403` 表示账号或模型无权限；`404` 通常表示 Base URL、模型 ID 或接口类型不匹配；`429` 表示额度或频率限制。Responses 接口返回 `404/405` 时程序会尝试回退 Chat Completions，但模型 ID 和服务权限仍需正确。

## 5. 连接真实游戏

### 5.1 构建并安装 Mod

先在 Steam 库中右键游戏，选择“管理 → 浏览本地文件”，确认实际游戏目录。然后在仓库根目录的 Windows PowerShell 中执行：

```powershell
$sts2 = "C:\Program Files (x86)\Steam\steamapps\common\Slay the Spire 2"
npm run mod:build -- -Sts2Dir $sts2
```

脚本会检查 `.NET 9`、游戏目录及必要程序集，然后构建并复制：

```text
<STS2>\mods\GameBuddyBridge\gamebuddy_bridge.dll
<STS2>\mods\GameBuddyBridge\GameBuddyBridge.json
```

文件夹名可以是 `GameBuddyBridge`，但其中 manifest 文件名、DLL 文件名和 manifest `id` 必须分别保持为 `GameBuddyBridge.json`、`gamebuddy_bridge.dll` 和 `gamebuddy_bridge`。本 Mod 的 manifest 没有第三方 Mod 依赖。

如只构建、不复制到游戏目录：

```powershell
.\mod\GameBuddyBridge\build.ps1 -Sts2Dir $sts2 -SkipCopy
```

也可以配置一次环境变量：

```powershell
$env:STS2_DIR = $sts2
npm run mod:build
```

### 5.2 加载 Mod

1. 完整退出《杀戮尖塔 2》，确认后台没有残留游戏进程。
2. 确认 `<STS2>\mods\GameBuddyBridge` 中同时存在 DLL 和 JSON manifest。
3. 重新启动游戏；首次检测到本地 Mod 时，按游戏提示选择启用 Mod。
4. 在主菜单或设置中的 `Mods` / `Modding` 页面确认 `GameBuddy Bridge` 已启用。Early Access 不同版本的入口名称可能不同；若没有入口，先确认游戏版本与 `mods` 目录位置。
5. 按游戏要求重启一次，然后开始或继续一局单人游戏。

游戏只在启动时加载 Mod，因此复制新 DLL 后必须重新启动游戏。

### 5.3 验证 Bridge

先不启动 Electron，读取一次状态：

```powershell
npm run harness:inspect -- --once
```

成功时应看到：

- 数据源为 `sts2-mod-bridge`；
- 当前角色、章节、楼层和生命；
- 战斗中可看到手牌和敌人意图；GameBuddy 不推算实际伤害。

如果探针无法取得合法状态，先排查 Mod；如果探针正常但 UI 不刷新，再排查 Electron。

### 5.4 启动桌面端

```powershell
npm start
```

状态应从 `WAIT` / `CONNECTING` 变为 `LIVE`。主面板关闭按钮默认隐藏窗口而不是退出进程；需要从系统托盘选择“退出”才能完整退出。

## 6. 桌宠操作

- 左键单击：打开 GameBuddy 主面板。
- 按住拖动：调整桌宠位置。
- 右键单击：打开原生菜单。
- 关闭桌宠：只隐藏宠物，不退出 GameBuddy。
- 系统托盘：打开主面板、显示或隐藏桌宠、退出应用。
- 遇到普通小怪、精英或 Boss：桌宠自动展开攻略；手动关闭后本场战斗不再重复弹出。

## 7. Bridge 状态含义

| 状态 | 含义 | 建议检查 |
| --- | --- | --- |
| `WAIT` | 没有连接到 Bridge | 游戏 Mod / Replay Bridge 是否已启动，地址是否正确 |
| `CONNECTING` | 正在建立 WebSocket | 等待连接；持续不变时检查端口和进程 |
| `LIVE` | 正在收到合法状态 | 正常工作 |
| `回放 DEMO` | 正在读取 Replay fixture | 正常的开发回放模式 |
| `数据停滞` | 已连接但超过 5 秒没有新状态 | 游戏是否暂停、Mod 是否仍在推送 |
| `数据异常` | 收到的消息未通过协议校验 | 查看终端错误并对照数据契约 |

桌面端每 2.5 秒尝试重连，断开游戏后不需要重启 Electron。

## 8. 自定义 Bridge 地址

桌面端默认连接 `ws://127.0.0.1:27182`。Bridge 变量必须在启动 Electron 前写入进程环境；当前不要把它们只写进项目 `.env`，因为 Bridge 配置的读取早于模型 `.env` 加载。

macOS / Linux：

```bash
GAMEBUDDY_BRIDGE_URL=ws://127.0.0.1:27182 GAMEBUDDY_BRIDGE_MODE=game npm start
```

Windows PowerShell：

```powershell
$env:GAMEBUDDY_BRIDGE_URL = "ws://127.0.0.1:27182"
$env:GAMEBUDDY_BRIDGE_MODE = "game"
npm start
```

Replay Bridge 还支持 `GAMEBUDDY_BRIDGE_PORT` 和 `GAMEBUDDY_REPLAY_INTERVAL`。正式游戏模式应保持回环地址，不要把只读 Mod Bridge 暴露到公网。

## 9. 录制并离线开发

真实 Mod 已运行时，可录制状态：

```powershell
$env:GAMEBUDDY_RECORD_OUTPUT = "harness/fixtures/my-run.json"
$env:GAMEBUDDY_RECORD_MS = "60000"
npm run harness:record
```

事件会默认保存为 `harness/fixtures/my-run.events.json`。录制后回放：

```powershell
$env:GAMEBUDDY_REPLAY_INTERVAL = "500"
npm run harness:replay -- harness/fixtures/my-run.json
```

录制文件可能包含牌组、遗物、路线等对局信息。提交前应检查内容，不要录入账号、密钥或无关个人信息。

## 10. 验证与打包

完整工程门禁：

```bash
npm run harness:validate-all
npm run harness:smoke
npm run harness:smoke:lifecycle
```

构建 Windows 安装包：

```bash
npm run dist:win
```

输出位于 `dist/GameBuddy-Setup-*.exe`。安装包只包含 Electron 应用；游戏 Mod 因依赖本地私有游戏程序集，需要在合法安装游戏的 Windows 环境中单独构建。

### 源码运行与安装包的区别

- 源码运行：支持仓库根目录 `.env`，也是当前文档完整覆盖和推荐的方式。
- Windows 安装包：只安装 GameBuddy 桌面端，不安装 Mod；当前也没有图形化 Key 设置页面。
- 安装包需要通过 Windows“编辑账户的环境变量”界面新增 `GAMEBUDDY_LLM_API_KEY`、`GAMEBUDDY_LLM_BASE_URL`、`GAMEBUDDY_LLM_MODEL` 和 `GAMEBUDDY_LLM_WIRE_API`。保存后完全退出 GameBuddy；如果桌面快捷方式仍读不到新值，注销并重新登录 Windows 后再启动。
- 无论使用哪种桌面端，真实游戏都必须单独安装并启用 `GameBuddy Bridge`。

## 11. 常见问题

### `npm run demo` 报地址已被占用

已有进程正在监听 `27182`。停止另一个 Replay Bridge 或退出已加载 Bridge 的游戏，再重试。

### `npm run mod:build` 找不到 `sts2.dll`

传入的 `Sts2Dir` 不是游戏根目录，或者游戏安装不完整。目标文件应位于：

```text
<Sts2Dir>\data_sts2_windows_x86_64\sts2.dll
```

### 游戏运行但一直 `WAIT`

按顺序检查：

1. `mods\GameBuddyBridge` 下两个文件是否存在；
2. 复制 DLL 后是否重启过游戏；
3. Mod 是否已启用；
4. `npm run harness:inspect -- --once` 是否能取得状态；
5. `GAMEBUDDY_BRIDGE_URL` 是否仍指向 `ws://127.0.0.1:27182`。

### 启动日志显示 `rules only`

确认 `.env` 位于仓库根目录而不是 `docs`、`src` 或 Mod 目录，并检查变量名是否为 `GAMEBUDDY_LLM_API_KEY`。修改 `.env` 后要完整退出并重新运行 `npm start`；程序不会在运行中热加载密钥。

### LLM 请求返回 `401` / `403` / `404` / `429`

- `401`：重新复制模型服务签发的 Key，检查首尾空格，并撤销已经泄露的旧 Key。
- `403`：确认账号有权访问所填模型。
- `404`：确认 Base URL 和模型 ID；兼容服务如果没有 Responses API，将 `GAMEBUDDY_LLM_WIRE_API` 改为 `chat`。
- `429`：检查余额、配额和服务端频率限制。
- 不要用 GitHub PAT、Steam Token 或其他服务的密钥替代模型 API Key。

### 有状态但没有建议

- 战斗出牌建议尚未实现，这是预期行为。
- 卡牌建议只在战斗奖励界面出现。
- 休息建议只在休息处出现。
- 商店建议只在读取到真实库存时出现；进店时一次给出完整购物清单，购买过程不重复调用模型，离开商店后自动清除。
- 路线建议需要完整地图节点或能从 children 关系恢复出的可达路线。
- 数据超过 5 秒未更新时不会用过期状态生成新建议。

### Spire Codex 不可用

卡牌与遭遇的完整资料会减少，选牌 Agent 自动退回 Bridge 数据和本地规则；不会因为外部 API 超时而阻塞主界面。
