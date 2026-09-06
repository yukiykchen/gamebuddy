# GameBuddy 数据契约

GameBuddy 将游戏接入层和 AI 决策层解耦。游戏 Mod Bridge 只负责把当前可观测状态和事件通过本地 WebSocket 推送给桌面应用，桌面应用负责展示、缓存和调用决策引擎。

## 当前状态消息

真实 Mod 的当前采集范围见 [mod/GameBuddyBridge/README.md](../mod/GameBuddyBridge/README.md)。由于 STS2 的内部程序集会随游戏更新变化，协议字段是稳定边界，Mod 内部类名不是稳定边界。

```json
{
  "schema": "gamebuddy.state.v1",
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
  "map": {
    "visited": ["0,2", "1,1"],
    "current": "1,1",
    "start": "0,2",
    "boss": "6,2",
    "secondBoss": null,
    "rows": 7,
    "cols": 5,
    "nodes": [
      { "id": "0,2", "row": 0, "col": 2, "type": "Monster", "children": ["1,1", "1,2"] },
      { "id": "1,1", "row": 1, "col": 1, "type": "Unknown", "children": ["2,1"] },
      { "id": "1,2", "row": 1, "col": 2, "type": "Elite", "children": ["2,2"] },
      { "id": "2,1", "row": 2, "col": 1, "type": "Shop", "children": ["3,1"] },
      { "id": "6,2", "row": 6, "col": 2, "type": "Boss", "children": [] }
    ],
    "routes": [
      ["1,1", "2,1", "3,1", "4,2", "5,2", "6,2"]
    ],
    "routesTruncated": false
  }
}
```

`combat` 在非战斗房间可以为 `null`；在战斗中必须包含手牌、三类牌堆和敌人数组。

`map.nodes` 是当前 Act 的完整 DAG。节点 `id` 为 `"row,col"`，`children` 是下一层可走节点。`type` 取值：`Monster`、`Elite`、`Unknown`、`Shop`、`Treasure`、`RestSite`、`Boss`、`Ancient`、`Unassigned`。`Unknown` 就是问号，走进去之前不会揭示具体事件。`map.routes` 是从 `current`（没有当前位置时从 `start`）沿 `children` 走到 Boss 的全部路径，最多 256 条；超出时 `routesTruncated` 为 `true`。后续路线推荐应消费这份图，而不是再去读游戏内存。

## 事件消息

事件采用统一的 WebSocket 消息格式：

```json
{ "type": "event", "name": "turn.started", "timestamp": 1723370000000, "data": { "turn": 7 } }
```

第一版覆盖：

- `combat.started`
- `turn.started`
- `map.opened`
- `rest.opened`
- `combat.ended`

`card.played` 和 `card.reward.opened` 会在 Mod 接入对应 STS2 生命周期 Hook 后加入；桌面端协议已经预留这些事件。

## Bridge 状态

桌面端把“连接成功”和“收到有效游戏状态”分开显示：

- `WAIT`：WebSocket 已连接，尚未收到有效状态
- `LIVE`：最近 5 秒内收到合法状态
- `STALE`：连接仍在，但超过 5 秒没有新状态
- `ERROR`：消息未通过协议校验
- `DEMO`：明确启动了 Replay Bridge，当前是回放数据
- `WAIT`：没有真实 Bridge，桌面端正在等待游戏 Mod

## Agent 观察对象

桌面主进程和未来 Agent 使用 `gamebuddy.observation.v1` 作为观察边界：

```json
{
  "schema": "gamebuddy.observation.v1",
  "sequence": 12,
  "receivedAt": 1723370000000,
  "ageMs": 38,
  "fresh": true,
  "state": { "schema": "gamebuddy.state.v1" },
  "recentEvents": []
}
```

`fresh=false` 时，Agent 不应基于该状态做新的实时决策。这个对象由 [harness/observation-store.js](../harness/observation-store.js) 维护，后续可以独立迁移到 `agent/` 包，而不用改游戏 Mod 协议。

事件只触发增量更新；桌面端每次收到事件后请求或等待一条完整状态快照，避免依赖旧状态拼接出错。

## Agent 建议

主进程里的 `agent/` 消费 `gamebuddy.observation.v1`，产出 `gamebuddy.recommendation.v1`。当前实现路线任务 `map_route` 和休息处任务 `rest_site`；战斗出牌 `combat_play` 暂缓。路线推荐采用简单、可解释的规则：优先选择可达路线上的**精英数量**，再比较**火堆数量**，完全相同时才用生命、金币和卡组等上下文分数处理平局。路线任务固定由规则引擎决定，不交给 LLM 改选。进入休息处后会单独建议 **回血还是升级哪一张牌**；事件则由独立的 `event_choice` 任务处理。

```json
{
  "schema": "gamebuddy.recommendation.v1",
  "task": "map_route",
  "timestamp": 1723370002000,
  "source": "rules",
  "confidence": 0.62,
  "reason": "金币还够用，下一步可以进商店调整卡组。",
  "primary": {
    "action": "TAKE_ROUTE",
    "targetId": "2,0",
    "label": "商店",
    "route": ["1,0", "2,0", "3,0"]
  },
  "alternatives": []
}
```

`fresh=false` 时不发新建议。应用只展示建议，不会替玩家点地图。

LLM 只读取项目 `.env` 中的环境变量：`GAMEBUDDY_LLM_BASE_URL`、`GAMEBUDDY_LLM_API_KEY`、`GAMEBUDDY_LLM_MODEL`、`GAMEBUDDY_LLM_WIRE_API` 和 `GAMEBUDDY_LLM_REASONING_EFFORT`。`GAMEBUDDY_LLM_WIRE_API=responses` 时请求 `/v1/responses`。

## 接入边界

```text
Slay the Spire 2 Mod / Harmony Hook
        -> localhost WebSocket : 27182
        -> desktop adapter
        -> state store
        -> recommendation engine (agent/)
        -> overlay / companion window
```

桌面端不应直接读取游戏进程内存。若 Mod Bridge 暂时不可用，应用可以切换到 OCR/截图适配器，但必须在界面中明确标出数据源和置信度。
