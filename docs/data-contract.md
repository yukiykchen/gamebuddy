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
    "currentCoord": "3,2",
    "actId": "HIVE",
    "actName": "巢穴",
    "nextBossId": "KAISER_CRAB_BOSS",
    "nextBoss": "帝皇蟹",
    "secondBossId": null,
    "secondBoss": null
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
    "relics": [{ "id": "BURNING_BLOOD", "name": "燃烧之血" }],
    "potions": [{ "id": "FIRE_POTION", "name": "火焰药水" }]
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
        "id": "SNAKE_PLANT",
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
      { "id": "6,2", "row": 6, "col": 2, "type": "Boss", "children": [], "encounterId": "KAISER_CRAB_BOSS", "encounterName": "帝皇蟹" }
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

`run.actId` / `actName` 用来区分同一幕数下的不同区域，敌人候选池优先按 `actId` 筛选。`player.relics` 和 `player.potions` 由 Bridge 提供稳定 ID 与本地化名称，Agent 再从 Spire Codex 补全效果文本、稀有度和池。地图节点的 `encounterId` / `encounterName` 是可选字段：Boss 节点使用本局已经抽取的确定遭遇；其他节点只有当前游戏版本确实暴露遭遇身份时才填写。Boss 身份也写入 `run.nextBoss`。普通精英通常在进入节点前没有确定身份，因此候选精英必须标为“可能”，不能表述成已确定敌人。

卡牌奖励也可以临时出现在状态的可选 `reward` 字段中。常规 Mod 通过下方事件发送，状态字段主要供其他适配器和回放使用：

```json
{
  "reward": {
    "cards": [
      { "id": "ANGER", "name": "愤怒", "type": "Attack", "cost": 0, "upgraded": false }
    ],
    "canSkip": true,
    "source": "combat",
    "context": { "act": 1, "actId": "OVERGROWTH", "floor": 6, "defeatedType": "Elite", "defeatedEnemies": ["劫掠者"], "nextBossId": "CEREMONIAL_BEAST_BOSS", "nextBoss": "仪式兽" }
  }
}
```

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
- `card.reward.opened`
- `card.reward.closed`

`card.reward.opened` 在 `NCardRewardSelectionScreen` 打开或刷新时发送，`data.cards` 为当前可见候选牌；桌面端据此触发 `card_reward` Agent：

```json
{
  "type": "event",
  "name": "card.reward.opened",
  "timestamp": 1723370000000,
  "data": {
    "cards": [
      { "id": "ANGER", "name": "愤怒", "type": "Attack", "cost": 0, "upgraded": false },
      { "id": "IRON_WAVE", "name": "铁斩波", "type": "Attack", "cost": 1, "upgraded": false },
      { "id": "SHRUG_IT_OFF", "name": "耸肩无视", "type": "Skill", "cost": 1, "upgraded": false }
    ],
    "canSkip": true,
    "source": "combat",
    "context": { "act": 1, "actId": "OVERGROWTH", "floor": 6, "defeatedType": "Elite", "defeatedEnemies": ["劫掠者"], "nextBossId": "CEREMONIAL_BEAST_BOSS", "nextBoss": "仪式兽" }
  }
}
```

玩家选牌、跳过奖励或以其他方式关闭奖励层时，Mod 发送 `card.reward.closed`。桌面端收到后会立即取消尚未完成的卡牌 LLM 请求、停止思考动画并清除旧建议；后续只有新的 `card.reward.opened` 才能再次触发选牌 Agent。

`card.played` 仍待接入对应 STS2 生命周期 Hook。

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

主进程里的 `agent/` 消费 `gamebuddy.observation.v1`，产出 `gamebuddy.recommendation.v1`。当前实现卡牌奖励 `card_reward`、路线 `map_route` 和休息处 `rest_site`；战斗出牌 `combat_play` 暂缓。

卡牌奖励 Agent 会读取 Spire Codex 公共 API 的简体中文卡牌、遗物、药水、怪物和遭遇数据，并调用 `/api/runs/pick-coach` 取得当前牌组/遗物对应的流派、相似胜局支持度和 offer-conditioned 拿取率。送给模型的实时上下文包括：完整牌组与升级状态、每件遗物和药水的完整效果、金币/生命/能量、当前 Act 的全部地图节点与路线、已确定 Boss 的完整招式和机制，以及本章可能精英池。规则层也会针对多目标、多段攻击、成长、爆发和状态牌污染等机制加权。三张都不能改善牌组时可以建议 `SKIP`。API 超时或不可用时自动退回 Bridge 数据和本地规则，不阻塞选牌界面。

Spire Codex API 默认地址为 `https://spire-codex.com/api`，可用 `GAMEBUDDY_SPIRE_CODEX_URL` 覆盖。GameBuddy 不复制 Spire Codex 的源码或整库数据。

进入 `Elite` / `Boss` 房间且 `combat` 非空时，主进程还会生成独立的 `gamebuddy.encounter-guide.v1` 攻略消息并发送给桌面宠物。该消息不占用 recommendation 槽位，因此不会覆盖路线、休息处或卡牌奖励建议。攻略按楼层和地图坐标去重，每场只自动弹出一次，战斗结束后自动收起。

`strategy` 来自 `agent/knowledge/encounter-strategies.json`，以遭遇稳定 ID 匹配，覆盖 stable `v0.107.1` 的 12 个 Boss 和 12 个精英。字段包括 `summary`、`dangerWindows`、`deckChecks`、`priorityTargets`、`tips`、`avoid`、`confidence`、`reviewStatus` 和可追溯的 `sources`。社区攻略不覆盖 Spire Codex 的机制事实；如果版本或遭遇无法匹配，则不显示推测性打法。

同一份 `strategy` 也会挂到卡牌奖励 Agent 的 `threats.knownBoss`、`possibleElites` 和 `knownUpcomingElites` 上，并随完整遭遇上下文送入 LLM。这样模型评判奖励牌时能针对具体遭遇的牌组检查和常见失误，而不是只看到笼统的 Boss / Elite 标签。

路线任务在没有配置 LLM 时用规则打分：每个节点拆成**收益**和**风险**。精英按遗物缺口和生命评估；火堆同时计算回血和未升级牌的敲升级价值；商店按金币、卡组厚度和打击/防御数量计算删牌与购物。同一条路上精英后面有火堆时会加协同分。进入休息处后，`rest-site-strategy` Skill 会逐张比较升级前后效果，并结合完整牌组、遗物、药水、地图、生命安全线和近期强敌，单独建议 **回血还是升级哪一张牌**。有 OpenAI 兼容接口时，模型只在规则生成的真实候选中复核选择和解释。同一层出现多个同类型节点时，建议会携带 `targetId`、`target.row`、`target.col`、`direction` 和 `displayLabel`；最高分存在多个不同目标时，`tie.isTie=true`，客户端应展示为等价路线而非任意宣称其中一条更优。

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
    "displayLabel": "左侧商店",
    "direction": "左侧",
    "target": { "row": 2, "col": 0 },
    "route": ["1,0", "2,0", "3,0"]
  },
  "alternatives": [
    {
      "action": "TAKE_ROUTE",
      "targetId": "2,1",
      "label": "精英",
      "displayLabel": "右侧精英",
      "direction": "右侧",
      "target": { "row": 2, "col": 1 },
      "route": ["1,0", "2,1", "3,0"],
      "score": 7
    }
  ],
  "tie": null
}
```

`fresh=false` 时不发新建议。应用只展示建议，不会替玩家点地图。

LLM 默认读取本机 Codex CLI 配置（`~/.codex/config.toml`、`~/.codex/auth.json`）。环境变量 `GAMEBUDDY_LLM_BASE_URL`、`GAMEBUDDY_LLM_API_KEY`、`GAMEBUDDY_LLM_MODEL`、`GAMEBUDDY_LLM_WIRE_API` 可以覆盖。`wire_api = "responses"` 时请求 `/v1/responses`。

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
