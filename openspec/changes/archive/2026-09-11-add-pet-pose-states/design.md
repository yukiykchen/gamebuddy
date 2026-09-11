## Context

See proposal.md Why。当前桌宠是 CSS 角色，思考时只加装饰，没有对局语义状态机。主进程已广播连接状态、LLM thinking、建议、卡牌卡和遭遇攻略，足够在桌宠窗口内推导四种姿态。

## Goals / Non-Goals

**Goals:**
- 姿态只覆盖搭子真正要表达的四件事：等开局、旁观、分析、给建议。
- 同一只 CSS 角色，四种姿势可一眼区分。

**Non-Goals:**
- 不模仿 Codex 姿态名或精灵表。
- 不增加挥手、跑步、警戒专属造型。
- 不改 Agent 与主面板。

## Decisions

1. **四种对局姿态。**  
   `waiting` / `watching` / `thinking` / `advising`。曾列入 `caution`，已去掉：攻击意图用现有气泡即可，不必换身体造型。

2. **单一 `data-pose`。**  
   `#pet-stage` 写入上述四个值之一。CSS 按属性切换造型；气泡不再改身体 class。数据异常用状态点颜色，姿态走 `waiting`。

3. **优先级：advising > thinking > waiting > watching。**  
   建议卡或攻略一旦出现就给建议姿态，即使后台 LLM 仍在复核。没建议时的分析才用 thinking。没 live 时用 waiting。旁观是默认 live 态。

4. **不设挥手问候。**  
   连上游戏直接 watching，或进入更高优先级。

5. **造型方向（CSS，非精灵表）。**  
   - waiting：沿用修改前的原版圆身体 + 轻微漂浮  
   - watching：轻微呼吸，眼神平视  
   - thinking：前倾 + 思考云  
   - advising：转向建议卡一侧  

6. **推导留在 `pet.js`，不改协议。**

## Risks / Trade-offs

- [四态仍可能不够像换造型] → 每态改轮廓（耳、围巾、倾角、眼形），demo 逐态核对。
- [Replay 可能很快出建议，watching 一闪而过] → 可接受；无建议的旁观仍用 watching。

## Migration Plan

无数据迁移。回滚即还原 `src/pet.*`。
