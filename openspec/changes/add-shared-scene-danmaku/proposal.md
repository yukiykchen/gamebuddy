## Why

本地观战弹幕只能由 GameBuddy 生成，玩家不能给进入相似战斗场景的其他玩家留下弹幕。需要在不暴露牌组、生命、存档或游戏控制权的前提下，让玩家直接在游戏覆盖层为当前场景提交短留言。

## What Changes

- 使用已部署的低频 HTTP + D1 场景留言服务，按游戏版本、角色、怪物组合和 `combat/death` 时机保存与读取短文本。
- 游戏画面右侧提供常驻小按钮，点击后展开输入栏；`Enter` 提交、`Shift+Enter` 换行。
- 日志主面板不承担共享弹幕输入。成功提交后延迟约 3 秒在发送者自己的游戏覆盖层回显。
- 本地 Mod 事实弹幕和玩家留言保持不同来源；服务不可用时本地弹幕功能继续运行。

## Non-goals

- 不自动出牌、点击游戏、修改游戏状态或用玩家弹幕推导策略、机制、胜率或人格。
- 不实现账户体系、好友关系、历史聊天记录、跨场景回放或公开搜索。
- 不把完整游戏状态、LLM 建议、玩家记忆或 API Key 发送到共享服务。

## Capabilities

### New Capabilities

- `shared-scene-danmaku`: 用隐私最小化的场景房间匹配、发送、接收和审核规则提供可选共享玩家弹幕。

### Modified Capabilities

- 无。

## Impact

- 已部署 Cloudflare Pages Worker + D1，并通过环境变量配置服务地址。
- `main.js`、`preload.js`、`src/danmaku.*` 增加游戏覆盖层输入、提交状态和延迟本地回显。
- 删除 `src/index.html` / `src/renderer.js` 的日志面板输入功能。
- `agent/danmaku/shared-scene.js` 继续生成隐私最小化场景签名；不改变 Mod 协议。
