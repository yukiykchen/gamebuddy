## Context

目前 `scene-context.js` 已从 observation 提取敌人名称、意图、玩家生命区间和回合，但曾丢弃 Mod 的敌人 ID，未连接现有 Codex。检索只按 `scene + trigger` 过滤，catalog 也是一组宽泛短句；准备脚本仅产生 `trigger`、`tone` 和来源 metadata。因此结果即使正确，也缺少职业辨识度、怪物机制事实和梗的分布控制。

## Goals / Non-Goals

**Goals:**

- 保持 Mod 事实优先，用职业与场景共同驱动氛围表达。
- 让网感短句成为可解释、可溯源、可下线的语言素材，而不是任意实时生成的文本。
- 让每场战斗的短句在来源、梗类别和文字上保持多样。

**Non-Goals:**

- 不为职业建立出牌流派、打法、强弱或性格画像。
- 不依据语料猜测 Mod 未提供的敌人机制，也不把职业名传给玩家记忆库。
- 不改变入场波次仅显示 Mod 敌人关键词的现有约束。

## Decisions

### 1. 使用场景语言档案，而非“职业策略档案”

从 `run.character` 规范化为 character key，并与 `room`、敌人名称/意图、生命状态、回合和事件组成语言档案。职业只选择语气和短句包，例如偏热血、冷静或围观的表达；它不能改变事实或触发策略。未知职业回退至 generic。

### 1.1 保留怪物 ID 并自然化 Codex 信息

Mod 的 `enemy.id` 优先传入已有 `lookupMonster` 查询。实时意图始终优先于 Codex 静态资料：例如当前攻击意图呈现为“蛇花试图攻击你。”。Codex 只补充已明确的行动/固有机制，并转写为自然中文，例如“它的攻击可能连续命中。”；渲染文本不显示“档案”“标签”“资料”等来源词。消息 metadata 保留 `source=mod` 或 `source=codex` 以便调试。

### 2. 特色短句包与 B 站检索分层

新增版本化本地短句包。每条记录包含 `text`、`characterKeys`、`sceneTags`、`tones`、`memeFamily`、`source` 和可选退役版本。它承载短、稳定、可维护的特色/流行表达。B 站 Chroma 仍用于氛围补充，离线管线用关键词规则写入 `tone` 与 `memeCategory`，不强行把所有 B 站语料绑定职业。

### 3. 场景标签比文本相似度优先

运行时先依据 Mod 事实确定 `sceneTags`，例如 `attack-intent`、`low-hp`、`hp-drop`、`enemy-spawn`、`enemy-revive`、`phase-change`、`victory`。候选先通过 trigger/tone/安全过滤，再按职业兼容、近期未用和向量相似度排序。入场由独立 `factOnly` 路径处理，不参与候选选择。

### 4. 为一场波次设置来源与重复配额

普通显著触发波次为 6–8 条，间隔 350–600ms：事实关键词、最多一个特色短句、最多两条 B 站短句、最多三条 LLM 氛围短句和必要的原创句。近期窗口同时记录 exact text、`memeFamily` 和 source ID；同一战斗中优先未用类别。入场仍保持 fact-only。普通波次冷却缩短至约三秒，但状态版本变化仍会清空旧内容。

### 5. LLM 只异步补充受限的氛围短句

语料准备阶段仍使用透明的关键词规则清洗/分类，embedding 只用于语义排序。已配置的 `GAMEBUDDY_LLM_*` 客户端新增专用短句请求：仅传递角色 key、场景标签、语气和已显示的事实关键词，要求返回 JSON 短句列表。请求异步启动、按场景档案缓存并设置短超时；事实层不等待它。响应在本地通过长度、控制字符、策略/操控词、重复和场景 generation 校验后才能入队，并带 `source=llm_atmosphere`。

## Risks / Trade-offs

- [职业短句落入刻板印象或过时梗] → 每条带版本/类别，可独立停用；首期只使用中性、非策略表达。
- [规则标签覆盖不足] → 落入 generic，不用语义模型臆造标签。
- [B 站文本仍可能泛化] → 候选配额与类别去重优先，素材不足时省略氛围句。
- [重建 collection 成本] → metadata schema 变更时提供明确的 prepare/index 重建命令与记录计数验证。
- [LLM 延迟、费用或越界文本] → 异步短超时、缓存、严格 JSON/本地安全校验和本地/语料回退；不把完整状态或策略数据发送给模型。

## Migration Plan

1. 先加入语言档案、短句包和纯 Node 测试，保留 generic fallback。
2. 扩展准备/索引 metadata 后重建专用 danmaku collection。
3. 灰度启用角色兼容排序；若素材质量下降，可禁用短句包或回退现有 generic metadata，不影响 Mod 事实层。
