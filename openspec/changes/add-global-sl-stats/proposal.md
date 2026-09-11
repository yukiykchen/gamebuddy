## Why

杀戮尖塔玩家常把读档继续（SL）当成这局的一部分，但 GameBuddy 既不计数，桌宠也不会对此作出反应。玩家需要看到**这一局**进了几次进度，并在每次带着进度进游戏时被搭子点出来。

## What Changes

- 一局从起点开出时，本局 SL 记为 0。
- 之后每一次重新进入对局，若当前位置已经不在本局起点，本局 SL +1。
- 「进入对局」指从没有 live 对局（菜单、掉线、进程关掉）再次看到对局快照，不是每一帧比楼层。
- 只统计本局，不累计跨局生涯总数。主面板只展示本局 SL。
- GameBuddy 重启后，若还是这一局、尚未从起点重开，本局数字仍保留。
- 计数增加时桌宠按本局次数分档说话（1–2 温和、3–9 调侃、10+ 加重），不新增长期姿态。
- 回放 / demo 不得写入真实本局计数文件。

## Non-goals

- 不控制游戏、不代打、不改存档、不阻止玩家 SL。
- 不做生涯/账号总 SL。
- 不靠「楼层突然变低」推断读档，也不在同一段 live 会话里对每帧进度做回退扫描。
- 不统计其他习惯（弃牌、跳过奖励、投降），除非以后单独提案。
- 不新增第五种长期桌宠姿态，不引入 Codex 精灵表。
- 不把 SL 次数送进 LLM 选牌/路线提示。
- 不上传云端、不对账 Steam 成就。

## Capabilities

### New Capabilities

- `run-stats`: 在进入对局时判断是否在起点，只维护本局 SL，并在主面板展示。

### Modified Capabilities

- `pet-overlay`: 在本局 SL 增加时按档说话，姿态仍是 waiting / watching / thinking / advising。

## Impact

- `main.js`：进入对局边沿检测、本局计数、落盘、广播。
- `src/index.html` / `src/renderer.js`：侧边栏本局 SL。
- `src/pet.js`：SL 气泡，不改 `data-pose` 四态。
- 不改 Bridge 事件集；沿用现有 `run` / `map` 字段判断起点。
- 验证：`npm run test:syntax`、`npm run harness:validate-all`，用 Replay 模拟「先在起点开局、再从中途进入」。
