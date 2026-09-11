## Why

悬浮桌宠目前只有一种 CSS 形象。思考时只加气泡和轻微晃动，等待游戏、旁观对局和给出建议几乎看不出差别。玩家需要一眼认出搭子是在等开局、看着这局、正在分析，还是已经有建议。

## What Changes

- 按 GameBuddy 对局场景定义桌宠姿态，不套用 Codex 姿态名。
- 引入四种互斥姿态：`waiting`（等游戏）、`watching`（旁观对局）、`thinking`（分析中）、`advising`（给出建议/攻略）。
- 用显式状态机从 Bridge 连接、LLM 思考和建议/攻略展示推导当前姿态。
- 为每种姿态设计可区分的 CSS 形象（同一只角色，姿势不同）。
- 敌人攻击意图仍可用气泡提示，不单独占一种身体姿态。

## Non-goals

- 不控制游戏、不代打、不改变建议内容。
- 不对齐 Codex 精灵表或 Codex 姿态命名。
- 不做挥手问候、跑步、警戒专属造型、看向四周等多余表演姿态。
- 不更换角色物种或最终像素美术；本轮仍是现有 CSS 桌宠。
- 不改主面板布局，不改 Agent 决策协议。

## Capabilities

### New Capabilities

- `pet-overlay`: 对局场景下的桌宠姿态状态机与每种姿态的可观察形象。

### Modified Capabilities

- （无。`openspec/specs/` 尚无已归档能力。）

## Impact

- `src/pet.html`、`src/pet.css`、`src/pet.js`：姿态 DOM、样式与推导。
- 不改 Bridge 协议；继续消费现有 thinking / recommendation / status 信号。
- 用 `npm run demo` 验证四种姿态切换。
