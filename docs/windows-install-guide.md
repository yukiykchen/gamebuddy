# GameBuddy Windows 安装指南

GameBuddy Windows 版。安装包构建编号：v0.2.9。

## 准备

- Windows 10/11 x64，已安装 Steam 版《杀戮尖塔 2》。Mod 适配基线为 stable v0.107.1，其他游戏版本尚未确认。
- 下载 **GameBuddy-Setup-0.2.9.exe**（已内置 Bridge）。一般不需要再下 Bridge ZIP。
- 使用 AI 需自备支持 OpenAI 兼容接口的模型服务、API Key、Base URL、模型 ID 和可用额度。无需安装 Node.js、npm、.NET SDK 或自行编译。

## 1. 安装桌面端与 Bridge

1. 运行 Setup，按向导选择 GameBuddy 安装位置。
2. 桌面端复制完成后，安装程序会请你选择《杀戮尖塔 2》游戏根目录（在 Steam 库右键游戏 → 管理 → 浏览本地文件）。
3. 选对目录后，安装程序会把 Bridge 写入 `mods\GameBuddyBridge`。可取消跳过，之后再手动安装。
4. 完整退出游戏并重新启动，按提示启用 GameBuddy Bridge；如提示重启，请完整重启后再开单人局。

当前安装包未配置发行者代码签名证书，Windows 可能显示未知发布者。请确认来自本项目的发布页并核对 SHA256。

### 备用：手动安装 Bridge

若安装时跳过了目录选择，可任选其一：

- 把 GameBuddy 安装目录下的 `resources\bridge` 内两个文件复制到游戏 `mods\GameBuddyBridge`；或
- 下载 `GameBuddy-Bridge-0.2.9.zip`，解压后把其中的 `GameBuddyBridge` 文件夹复制到游戏 `mods`（避免重复嵌套）。

需同时有 `gamebuddy_bridge.dll` 和 `GameBuddyBridge.json`。

## 2. 配置 API Key

目前安装版通过 Windows 用户环境变量配置模型服务。

1. 在 Windows 开始菜单搜索“编辑账户的环境变量”，打开用户变量设置。
2. 在“用户变量”中逐项新建以下变量，前三项必须替换为自己的真实服务信息；不要把占位值照抄进去。

| 变量名 | 填写内容 |
| --- | --- |
| GAMEBUDDY_LLM_BASE_URL | 服务商提供的 API 地址，例如 https://api.example.com/v1（仅示例） |
| GAMEBUDDY_LLM_API_KEY | 你在同一家模型服务控制台创建的 Key |
| GAMEBUDDY_LLM_MODEL | 服务商实际开放的模型 ID |
| GAMEBUDDY_LLM_WIRE_API | 兼容 Chat Completions 填 chat；使用 Responses API 填 responses |
| GAMEBUDDY_LLM_THINKING | 支持 thinking 参数的服务可填 disabled 或 enabled；不支持则不添加此变量 |

3. 保存后，从系统托盘或桌宠菜单完整退出 GameBuddy。为保证桌面快捷方式读取新环境变量，建议注销并重新登录 Windows，再启动应用。
4. Key 可能产生模型调用费用，只在自己的电脑保存；不要放进仓库、反馈截图或安装包。

也可在桌宠右键菜单使用「配置密钥」。不开通模型也可用本地规则建议。配置模型后，关闭思考模式仍使用 AI：开启时分析更充分但较慢；关闭时更快。

## 3. 开始使用

1. 启动已启用 Mod 的游戏，开始或继续一局单人游戏。
2. 通过桌面快捷方式启动 GameBuddy，确认主面板显示 LIVE，角色、生命值、楼层与游戏一致。
3. 到卡牌奖励、地图分叉、篝火、事件或商店，等待建议；配置 AI 后在主面板 LLM 日志中确认一次成功的解析结果。
4. 点顶部建议气泡查看理由，点详情右上角 × 收起；战斗时可点“查看攻略”。

目前不提供战斗中逐张出牌建议，也不代替玩家操作游戏。

## 常见问题

- 下载无响应：在系统浏览器打开发布页，再点击 Assets 中的文件。
- 一直未连接：检查 Bridge 是否在 `mods\GameBuddyBridge`、游戏是否启用 Mod 并完整重启、是否进入单人局。
- 没有 AI：检查用户环境变量或桌宠「配置密钥」；在 LLM 日志查看实际请求结果。
- 401：Key 无效；403：模型权限不足；404：服务地址、模型或接口类型不匹配；429：额度或频率限制。
- 更新：运行新版 Setup；装 Bridge 时可再次选择游戏目录覆盖。退出 GameBuddy 请用桌宠「退出 GameBuddy」或系统托盘「退出」。
