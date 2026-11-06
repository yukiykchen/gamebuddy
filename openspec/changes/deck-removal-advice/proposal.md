## Why

商店里的「删除一张牌」能告诉玩家删哪一张，但商店外的删牌给不出具体建议。触发场景包括删牌事件、"拾取时移除 N 张牌"的遗物、休息点的烹饪选项、战斗结束的删牌奖励，也包括商店买完删牌服务之后真正弹出的那个选牌界面。

原因是 Bridge 从未上报过这个界面。它能感知界面的途径只有两条：卡牌奖励界面挂了专门的 Harmony 补丁，其余（战斗、地图、商店、事件、休息处）靠快照轮询 diff 推断。牌组选牌界面两条都不沾，于是 `selectTask` 的优先级阶梯在 `event.closed` 之后直接落到 `map_route`，桌宠显示的是路线建议。`docs/data-contract.md` 承认的 12 个事件里没有任何一条与删牌界面有关，`docs/feature-status.md` 也没记录这个缺口。

游戏本体侧的事实（v0.107.1 反编译核对）：所有需要玩家手动挑牌的删牌共 16 个调用点，全部经过 `CardSelectCmd.FromDeckForRemoval`，最终都实例化同一个界面类 `NDeckCardSelectScreen`。因此一次监听即可覆盖全部来源，不需要逐事件适配。

## What Changes

- Bridge 新增删牌选牌界面的生命周期上报：`card.removal.opened`（候选牌集合、需选张数、是否可取消、触发来源）与 `card.removal.closed`。
- 新增 Agent 任务 `card_removal`：复用商店已有的删牌打分（`removeTarget`），输出**前 N 张**建议，N 取 `min(maxSelect, 候选数)`。
- `selectTask` 阶梯在 `findShop` **之前**插入 `card_removal`，使商店内购买后的选牌步骤也走新建议。
- 主进程沿用 `card_reward` 的一次性语义：同一次删牌只发布一条最终建议，`card.removal.closed` 时清除建议并取消未完成的 LLM 请求。
- 同一个界面也被「异变」与「多利之镜复制一张牌」复用。本 change 只在删牌入口发事件，不给这两类场景发删牌建议。

## Non-goals

- 不控制游戏、不代玩家点选、不替玩家确认删除。
- 不为异变、复制、升级、附魔、战斗内弃牌等其它选牌界面提供建议（留给后续 change）。
- 不改变随机删牌（无选择界面，如滑脚木桥、战争史官）的建议语义，它们继续只在事件层说明。
- 不新增桌宠姿态，不改现有建议卡的视觉结构。
- 不把删牌次数或中间推理送进后续 prompt 作为记忆。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `game-bridge`：上报删牌选牌界面的生命周期与候选集合，且只在删牌用途上报。
- `agent-decisions`：删牌界面出现时给出前 N 张具体建议，同一次选择只发布一次。

## Impact

- `mod/GameBuddyBridge/Scripts/`：新增删牌选牌界面的 Harmony 补丁；`GameBuddyExporter.cs` 新增事件发布与候选牌快照。
- `docs/data-contract.md`：事件清单补两条，并修正「删牌只作为 shop.updated 触发条件」的旧表述。
- `agent/tasks/card-removal.js`：新任务；`agent/tasks/shop.js` 的 `removeTarget` 改为可返回前 N 张并保留原调用点行为。
- `agent/orchestrator.js`：`selectTask` 新分支 + `signatureFor` 新签名。
- `main.js`：事件名清单（清除、force、复用）三处接线。
- `harness/validate-mod.js`、`harness/validate-protocol.js`、`package.json` 的 `test:syntax` 文件清单。
- 验证：`openspec validate deck-removal-advice --strict`、`npm run test:syntax`、`npm run harness:validate-agent`、`npm run harness:validate-protocol`、`npm run mod:build`，以及真机跑一局覆盖商店、事件、多张遗物三类。
