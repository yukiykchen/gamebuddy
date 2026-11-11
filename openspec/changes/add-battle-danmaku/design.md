## Context

主进程已将 Mod `gamebuddy.state.v1` 放入 Observation Store，并生成 `gamebuddy.observation.v1`。当前弹幕模块只能消费这一只读事实流和可选的已生成建议；它不选择卡牌、不点击游戏，也不从弹幕或胜负反推战术。本变更把渲染端从桌宠拆出，并把可检索语料从少量人工审核记录升级为自动处理后的全量候选。

## Goals / Non-Goals

**Goals:**

- 在游戏主显示器工作区显示独立、鼠标穿透的全屏弹幕，不改变桌宠现有交互。
- 任何 Mod 提供的敌人名称、攻击意图、血量与回合都能形成可验证的事实台词；事实台词不等待上游 Agent。
- 处理全量原始 JSONL，使用可解释规则清洗、去重、标注并批量写入独立 Chroma collection。
- 使用 Ollama embedding 和 Chroma 语义检索提供场景兼容的 B 站氛围表达，记录可诊断的成功、失败与回退日志。

**Non-Goals:**

- 不自动出牌、不控制游戏、不预测伤害、格挡或胜率，也不由弹幕推断游戏机制或玩家性格。
- 不修改 Mod 协议，不把 Hy-Memory 或玩家记忆库用作弹幕库。
- 不调用 LLM 生成实时战斗策略；Ollama 仅用于 embedding。

## Decisions

### 1. 主进程调度，独立覆盖窗口只渲染

`DanmakuBridgeAdapter` 接收 observation、已接受事件和可选上游建议，交给 `DanmakuDirector` 排队。主进程把到期消息通过 `bridge-danmaku` 仅发送到 `danmakuWindow`。`danmakuWindow` 使用透明无边框 `BrowserWindow`、`showInactive()`、`setIgnoreMouseEvents(true, { forward: true })`、`setVisibleOnAllWorkspaces(true)` 与 `setAlwaysOnTop(true, 'screen-saver')`，初始边界为主显示器 bounds。Mod 断开、状态过期、游戏场景退出或窗口销毁时发送 `bridge-danmaku-clear` 并隐藏窗口。

### 2. 纯事实场景提取

新增 `scene-context.js`。它只规范化 Mod 显式字段：`player.hp/maxHp/energy/block`、`combat.turn`、在场敌人名称和 `intent`、以及事件中的卡名。它产出 `scene`、`trigger`、`keywords`、`enemyNames`、`intentKinds`、`hpBand` 等数据，不产生任何策略字段。战斗进入只显示敌人精确名称；攻击、低血量和掉血时显示名称加规范化事实标签，例如“{enemyName} · 攻击意图”或“生命偏低”。不生成“进入战斗”“出场了”“围观席就位”等泛化入场句。

### 3. 波次、失效与可选建议

每个事实触发至少安排一条事实台词，随后最多两条 B 站检索结果和一条原创氛围文案；战斗进入例外：只保留敌人名称和已存在的攻击意图等事实关键词，不查询或发送入场氛围表达。全部消息绑定 `runId`、`sceneId`、`stateRevision`、`generation` 和过期时间。场景或版本变化会清空旧队列。上游建议只在已收到、同场景且结构化时生成语言层面的可选回应，不能成为触发事实弹幕的条件。

### 4. 全量自动语料管线

准备脚本读取原始 JSONL，清理控制字符、空白、重复项和明显超长项，保留 `bvid`、时间戳和原始文本。基于明确关键词给每条记录添加 `scene`、一个或多个 `triggers` 与 `tone`，无法匹配时标记 `general`。自动排除策略、操控、伤害预测和明显不适合展示的文本，以避免 B 站表达突破产品边界；不建立人工审核队列。索引脚本为每个弹幕生成一次 embedding，并用原始 ID 加可追踪的 trigger 后缀写入 Chroma。由于 Chroma 的标量 metadata 过滤限制，按 trigger 展开索引记录但保持 `sourceId` 可关联，并在运行时按文本去重。

### 5. 独立向量检索与日志

运行时以 `safe=true`、`scene` 和 `trigger` 过滤 `gamebuddy_danmaku_v1`，以场景关键词作为 embedding 查询。`DanmakuRetriever` 在 350ms 内完成或回退；它对每次 embedding 成功/失败、Chroma 查询成功/失败、检索数量和回退原因写入可识别日志。失败不会阻塞事实台词，也不会影响推荐生成。

## Risks / Trade-offs

- 普通窗口覆盖层不能保证高优先级独占全屏游戏可见；Windows 独占全屏、Wine/CrossOver 和多显示器需要实机验证。本期先可靠覆盖主显示器。
- 自动标签是可解释的关键词规则，无法理解复杂语境；`general` 仍被场景过滤和文本去重约束。
- 连续状态变化会取消待播旧波次，宁可少说也不展示旧战斗内容。

## Migration Plan

不变更 Mod 协议。关闭或移除独立弹幕窗口即可回退，不影响桌宠、建议或 Mod Bridge。Ollama/Chroma 缺失时保持事实台词和原创氛围文案可用。
