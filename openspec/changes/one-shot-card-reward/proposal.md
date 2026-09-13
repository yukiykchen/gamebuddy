## Why

同一张卡牌奖励会被多次触发 Agent（窗口重载、`card.reward.opened` 的 `force`、重复快照）。每次 LLM 复核都可能给出不同下标，桌宠和主面板会先展示一个建议，再换成另一个。玩家只需要看到这一次奖励的最终建议，不需要看到中途被覆盖的结论。

## What Changes

- 同一张奖励（相同选牌签名）最多完成一次推荐计算，并只发布一次 `gamebuddy.recommendation.v1`。
- 思考过程可以显示，但在最终建议出现前不得先展示一个会被替换的选择。
- 窗口重载、重复 `card.reward.opened`、后续同签名快照不得再问模型，也不得把已展示的建议改成另一张牌或跳过。
- 奖励关闭或进入战斗后，下一次新的奖励可以重新建议。
- 主面板手动刷新仍可强制重算（玩家主动要求时例外）。

## Non-goals

- 不控制游戏、不代打、不替玩家选牌或点击奖励。
- 不改变合法候选集合，也不禁止模型选择 `SKIP`；`SKIP` 只要是这一次的最终结果就可以展示。
- 不保证模型每次都选规则最高分，也不为单卡写死「必须拿眼部攻击」。
- 不改 Bridge 协议字段，不新增第五种桌宠姿态。
- 不把选牌次数或中间推理过程送进下一轮 prompt 作为记忆。

## Capabilities

### New Capabilities

- `agent-decisions`: 同一选牌场景只产出并展示一次最终 recommendation。

### Modified Capabilities

- `pet-overlay`: 建议卡出现后，同一张奖励不得再换成另一条建议。

## Impact

- `agent/orchestrator.js`：同签名去重，忽略自动 `force` 重入。
- `main.js`：窗口加载与 `card.reward.opened` 不再覆盖已有同签名建议。
- `src/pet.js` / `src/renderer.js`：只展示已发布的最终建议。
- 验证：`npm run test:syntax`、`npm run harness:validate-agent`；Replay 或 Demo 覆盖「同奖励多次 consider 只发布一次」。
