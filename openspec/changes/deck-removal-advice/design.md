## Context

游戏本体（v0.107.1，反编译核对）里「从牌组里选牌」这个界面只有一个具体类 `NDeckCardSelectScreen`，它继承 `NCardGridSelectionScreen`，同层还有升级、异变、附魔、弃牌堆、简易网格五个兄弟类。全项目唯一实例化点是 `CardSelectCmd.FromDeckGeneric`。

删牌语义集中在上一层：`CardSelectCmd.FromDeckForRemoval` 是 16 个调用点唯一的入口，它做两件事——用 `CardModel.IsRemovable`（等价于「不含 Eternal 关键字」）过滤牌组、把诅咒排到最前，然后转交 `FromDeckGeneric` 打开界面。调用方覆盖 6 个事件、6 个遗物、休息点烹饪、删牌奖励、商店删牌服务（含联机一条）。

同一个入口之外，`FromDeckGeneric` 还被异变（`WoodCarvings`）与复制（`DollysMirror`）直接调用，弹的是同一个界面。因此「界面开了」不等于「这是删牌」。

## Goals / Non-Goals

- 目标：一次改动覆盖全部删牌来源；建议内容可验证；出错只降级不干扰游戏。
- 目标：区分删牌与异变/复制，不给后者发删牌建议。
- 目标：多张场景给出有序的前 N 张，而不是一张。
- 非目标：不覆盖异变/复制/升级/附魔自身的建议逻辑。
- 非目标：不承诺建议顺序与游戏界面显示顺序一致。

## Decisions

### 1. 打开信号挂在删牌入口，不挂在界面类

在 `CardSelectCmd.FromDeckForRemoval` 上加 Harmony prefix，从参数直接拿到 `player`、`prefs`（含 `MinSelect` / `MaxSelect` / `Cancelable`）与可选 `filter`，Bridge 用与游戏相同的判据自行算出候选集合后再决定是否上报。这样「这是删牌」由入口保证，不需要事后识别用途。

备选方案是挂界面类并用 `prefs.Prompt` 的 `LocTable` / `LocEntryKey` 判用途。该键与显示语言无关，符合本项目「用 `keywords_key` 而非本地化文本」的既有教训，作为 fallback 保留：删牌相关键至少有两个（`card_selection.TO_REMOVE` 与奖励路径的 `gameplay_ui.COMBAT_REWARD_CARD_REMOVAL.selectionScreenPrompt`），需要维护清单，因此不作为首选。

上报前复刻入口的两处提前返回（候选为空、角色已死亡），避免上报一个玩家根本看不到的界面。

### 2. 关闭信号挂在界面类

prefix 只能证明「即将打开」，关闭必须由界面自己报告。在 `NCardGridSelectionScreen.AfterOverlayClosed` 加 postfix，内部先判断实例是否为 `NDeckCardSelectScreen`、且当前存在未完成的删牌上报，才发 `card.removal.closed`。这样避免为异变/复制发出多余的 closed。

### 3. 候选集合由 Bridge 计算并随事件导出

导出的每张牌带运行时 id、名称、升级状态、关键字键、费用与类型，字段与 `gamebuddy.state.v1` 现有卡牌快照保持一致，Agent 侧不需要新的字段读取分支。

### 4. 建议张数取小

`N = min(prefs.MaxSelect, 候选数)`。候选数少于要求张数是真实可达状态（例如某遗物要选 5 张可升级的牌而牌组只剩 3 张），此时按候选数给全。

### 5. 一次性语义照抄卡牌奖励

同一候选集合与同一张数视为同一次选择，只发布一条最终建议；主进程收到 closed 时清除建议并取消未完成的模型请求。

### 6. 来源标签尽力而为

`source` 字段用于文案（「商店删牌」「事件：泉水」），不作为建议依据。第一版只区分「当前在商店」与「不在商店」两种，其余标 `UNKNOWN`，避免为了精确来源去 hook 十几个调用方。

## Risks / Trade-offs

- `FromDeckForRemoval` 方法体很小，存在被 JIT 内联导致 hook 不触发的风险。真机验证若发现不触发，切换到 Decision 1 的备选方案，改动局限在补丁文件本身。
- 早访问版本可能移动方法或字段名。沿用现有约定：反射读取失败时返回 null 并只降级不发事件，绝不向游戏抛异常。
- Bridge 自行计算的候选集合与游戏实际显示集合理论上可能不一致（例如 filter 委托内部又读了可变状态）。以「不一致时最多少给一张」为可接受偏差，不做二次校验。
- 多张建议会增加模型输入长度。第一版允许只出规则建议，模型复核保持可选。

## Migration Plan

先落地 Bridge 事件与 Agent 规则建议，模型复核保持现状不强制。旧 replay fixture 不含新事件，仍按现有逻辑跑通；新增一条 fixture 覆盖删牌场景。若真机验证失败，关闭补丁注册开关即可回到当前行为，Agent 侧新分支因找不到事件而不触发，无残留影响。

## Open Questions

- 异变与复制是否纳入同一个 change（当前判定为后续 change）。
- 牌组全是永恒牌时，是否要在事件层就提示「这次删不掉」，还是等界面出现后再说明。
