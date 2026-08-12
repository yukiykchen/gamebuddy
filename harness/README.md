# Runmate Harness

Harness 是 Runmate 的开发边界：桌面端只依赖 `runmate.state.v1` 和事件消息，不直接依赖某个游戏版本的内部类名。

## 回放实时状态

也可以一键启动回放桥和 Electron：

```bash
npm run demo
```

终端 1：

```bash
npm run harness:validate
npm run harness:replay
```

终端 2：

```bash
npm start
```

CI 使用 `npm run harness:smoke` 在临时端口启动回放桥，完成 WebSocket 握手并校验第一份状态快照。

协议边界测试：

```bash
npm run harness:validate-protocol
```

完整 Harness 门禁：

```bash
npm run harness:validate-all
```

它会一次检查桌面端脚本语法、协议案例、全部固定 fixture、录制 fixture 和 Mod 文件结构。Agent 后续提交新的回放夹具时，先让这条命令通过。

## Agent 观察接口

[observation-store.js](./observation-store.js) 是未来 Agent 的最小输入边界。它把状态和事件整理成：

```js
{
  schema: 'runmate.observation.v1',
  sequence: 12,
  receivedAt: 1723370000000,
  ageMs: 38,
  fresh: true,
  state: { /* runmate.state.v1 */ },
  recentEvents: [ /* runmate event messages */ ]
}
```

桌面端主进程已经使用同一个 store 管理实时数据。Agent 后续可以复用这层，而不需要再次连接游戏或依赖 Electron 窗口。

Replay Bridge 会在 `127.0.0.1:27182` 以 WebSocket 推送固定局面的连续快照。桌面宠物和主面板会共用同一条主进程连接，看到状态更新后分别改变内容和动作。

## 录制真实对局

当 Windows 上的 STS2 Mod Bridge 已经运行时，可以把真实状态录制成以后可回放的 fixture：

```powershell
$env:RUNMATE_RECORD_OUTPUT = "harness/fixtures/my-run.json"
$env:RUNMATE_RECORD_MS = "60000"
npm run harness:record
```

不设置 `RUNMATE_RECORD_MS` 时，按 `Ctrl+C` 结束录制。录制器会丢弃协议不合法的消息，只保存 `runmate.state.v1` 状态快照。录制完成后可以直接回放：

```bash
RUNMATE_REPLAY_INTERVAL=500 npm run harness:replay -- harness/fixtures/my-run.json
```

这条路径是 Agent 开发的固定入口：先在真实游戏里录制，再离线开发决策循环和回归测试。

事件会同时保存到旁路文件，例如：

```text
harness/fixtures/my-run.json
harness/fixtures/my-run.events.json
```

也可以显式指定事件文件：

```powershell
$env:RUNMATE_RECORD_EVENTS_OUTPUT = "harness/fixtures/my-run.events.json"
```

## 直接观测 Bridge

Windows 联调时，可以不启动 Electron，直接观察 Mod Bridge：

```powershell
npm run harness:inspect -- --once
```

持续观察并每 30 秒退出：

```powershell
npm run harness:inspect -- --duration=30000
```

它会输出连接状态、角色、楼层、生命、能量、手牌数量、敌人意图和预计伤害。若这里没有合法状态，问题在 Mod 或 WebSocket；若这里正常而桌面端不更新，再查 Electron 层。

Replay Bridge 会根据连续快照自动发出 `combat.started`、`turn.started`、`combat.ended` 和 `map.opened` 事件。可以用生命周期夹具验证：

```bash
RUNMATE_REPLAY_INTERVAL=300 npm run harness:replay -- harness/fixtures/lifecycle.json
```

CI 会用 `npm run harness:smoke:lifecycle` 验证这组快照实际产生四类生命周期事件。

## 接入真实游戏

未来的 STS2 Mod Bridge 只需要连接同一个地址并发送：

```json
{ "type": "state", "data": { "schema": "runmate.state.v1", "...": "..." } }
```

事件可以发送：

```json
{ "type": "event", "name": "card.reward.opened", "timestamp": 1723370000000, "data": {} }
```

Harness 不负责推断游戏内部数据，也不应该模拟鼠标点击。它负责状态协议、回放、重连、可观测性和测试夹具。
