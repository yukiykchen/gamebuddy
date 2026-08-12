# Runmate 数据契约

Runmate 将游戏接入层和 AI 决策层解耦。游戏 Mod Bridge 只负责把当前可观测状态和事件通过本地 WebSocket 推送给桌面应用，桌面应用负责展示、缓存和调用决策引擎。

## 当前状态消息

真实 Mod 的当前采集范围见 [mod/RunmateBridge/README.md](../mod/RunmateBridge/README.md)。由于 STS2 的内部程序集会随游戏更新变化，协议字段是稳定边界，Mod 内部类名不是稳定边界。

```json
{
  "schema": "runmate.state.v1",
  "timestamp": 1723370000000,
  "source": "sts2-mod-bridge",
  "run": {
    "act": 2,
    "floor": 18,
    "room": "combat",
    "character": "ironclad",
    "totalFloor": 52,
    "currentNode": "Monster",
    "currentCoord": "3,2"
  },
  "player": {
    "hp": 43,
    "maxHp": 67,
    "block": 12,
    "gold": 184,
    "energy": 2,
    "maxEnergy": 3,
    "cards": [
      { "id": "Strike_R", "name": "打击", "type": "Attack", "cost": 1, "upgraded": false }
    ],
    "relics": [],
    "potions": []
  },
  "combat": {
    "turn": 7,
    "hand": [
      { "id": "Strike_R", "name": "打击", "type": "Attack", "cost": 1, "upgraded": false }
    ],
    "drawPile": [],
    "discardPile": [],
    "exhaustPile": [],
    "enemies": [
      {
        "name": "蛇花",
        "hp": 78,
        "maxHp": 96,
        "block": 0,
        "intent": "AttackIntent",
        "damage": 18,
        "alive": true
      }
    ]
  },
  "map": { "visited": ["1,0", "2,1"] }
}
```

`combat` 在非战斗房间可以为 `null`；在战斗中必须包含手牌、三类牌堆和敌人数组。

## 事件消息

事件采用统一的 WebSocket 消息格式：

```json
{ "type": "event", "name": "turn.started", "timestamp": 1723370000000, "data": { "turn": 7 } }
```

第一版覆盖：

- `combat.started`
- `turn.started`
- `map.opened`
- `combat.ended`

`card.played` 和 `card.reward.opened` 会在 Mod 接入对应 STS2 生命周期 Hook 后加入；桌面端协议已经预留这些事件。

## Bridge 状态

桌面端把“连接成功”和“收到有效游戏状态”分开显示：

- `WAIT`：WebSocket 已连接，尚未收到有效状态
- `LIVE`：最近 5 秒内收到合法状态
- `STALE`：连接仍在，但超过 5 秒没有新状态
- `ERROR`：消息未通过协议校验
- `DEMO`：没有真实 Bridge，当前使用模拟/回放数据

## Agent 观察对象

桌面主进程和未来 Agent 使用 `runmate.observation.v1` 作为观察边界：

```json
{
  "schema": "runmate.observation.v1",
  "sequence": 12,
  "receivedAt": 1723370000000,
  "ageMs": 38,
  "fresh": true,
  "state": { "schema": "runmate.state.v1" },
  "recentEvents": []
}
```

`fresh=false` 时，Agent 不应基于该状态做新的实时决策。这个对象由 [harness/observation-store.js](../harness/observation-store.js) 维护，后续可以独立迁移到 `agent/` 包，而不用改游戏 Mod 协议。

事件只触发增量更新；桌面端每次收到事件后请求或等待一条完整状态快照，避免依赖旧状态拼接出错。

## 接入边界

```text
Slay the Spire 2 Mod / Harmony Hook
        -> localhost WebSocket : 27182
        -> desktop adapter
        -> state store
        -> recommendation engine
        -> overlay / companion window
```

桌面端不应直接读取游戏进程内存。若 Mod Bridge 暂时不可用，应用可以切换到 OCR/截图适配器，但必须在界面中明确标出数据源和置信度。
