# Round 00: Real Source Import and Local Baseline

日期：2026-11-09（Asia/Shanghai）。本报告由独立入口实施子agent记录；不是玩家盲评，也没有实际模型评分。

## Plan Before Implementation

对应tasks 9.1、9.2、9.6。先建立真实4局的只读、可重现入口，记录当前系统效果，不改变故事逻辑。仅使用本地历史result=loss且原始事件具有run.ended、cleared=false、reason非abandoned的对局，排除放弃、未结束及replay。

问题：直接递归合并所有JSONL可能重新纳入已经失效的战斗尝试；调用factStore getter可能触发文件恢复/删除。假设：模拟生产重启时的manifest选择，直接用fs只读读取，可以在不改原始日志的情况下得到正确有效视图。

验收：恰好4局；原始文件前后sha256不变；无写入源目录或数据库；model模式显式启用，默认local；原始种子/密钥不进入派生输入；保留版本、事件证据与后续独评字段。

## Changes

新增独立入口 `harness/eval-real-recap.js`。默认数据源为本机Application Support/gamebuddy；只写仓库 `.runtime/recap-real/`，拒绝输出路径中的符号链接。支持 `--mode=local|model`、`--output=...`、`--cases=runId1,runId2` 和 `--source=...`。

对无combatId的主事件流和manifest选中的combat activeGeneration读取，按manifest.eventIds检查已提交事件并按eventId去重。pendingGeneration存在时，按生产重启语义：已有active则保持active，无active且pending文件非空则保留未完成尝试。只在派生coverage中记录恢复选择，不改原始文件。没有有效代数指针的残留combat文件不读取。解析/文件缺失在审计中显式记录，影响完整度。

派生输入经现有sanitize去除seed/seedHash/apiKey/token/secret等字段，原始文件只保存相对路径、大小与sha256。模型仍使用既有配置和runner；本次子agent未调用任何远程API。

## Current Result

| 对局 | 角色 | 历史结束层 | 有效事件 | 复盘卡 | 固定四项 |
| --- | --- | ---: | ---: | ---: | --- |
| 0da9bfa177a841a7bbf1091c61af0334 | REGENT | 7 | 467 | 0 | 全部未记录 |
| 309ec1038c6a49749de3274851d738a1 | IRONCLAD | 39 | 3223 | 0 | 全部未记录 |
| 88ac80b42b3349e995acd36ddde04b67 | SILENT | 5 | 229 | 0 | 全部未记录 |
| ee6faa4a03e6494a9f86c032e9c91208 | IRONCLAD | 2 | 93 | 0 | 全部未记录 |

总计4012条有效事件。此前粗读长局3343条，其中120条属于manifest没有activeGeneration的残留战斗文件，不应参与当前有效战绩。不能把这些原始文件事件重新混入有效复盘。

4局均明确结束、均归档loss，但run.ended只记录 `game_ended_not_cleared`，不能直接说死亡。四个固定指标仍保持未知，自动检查未把未知填0。当前local模式0卡，说明仍需利用已知正向事实发现故事；不是证明真实游戏没有高光。

运行输出：`.runtime/recap-real/round-00-local.json`。每局派生输入在 `.runtime/recap-real/inputs/{runId}.json`，来源manifest在同目录manifest.json。

## Verification

- `node --check harness/eval-real-recap.js` 通过。
- `node harness/eval-real-recap.js --mode=local --output=.runtime/recap-real/round-00-local.json`：4局、0卡、hardCheckFailures为空、modelEvaluated=false、humanReviewed=false。
- 37个原始文件前后sha256逐项完全相同，sourceUnchanged=true。文件集合哈希：`f8f7cdf45d20316ce3ec01c4e5fe4c601ecb0b82c4968221036488d133f512ce`。
- 临时目录独立检查：active0/pending1保留active0；无active保留非空pending1；未提交eventId排除；源文件字节未变。全部通过。
- 派生输入检索seed/apiKey/password/secret/token字段无匹配。

这些检查只说明导入与结构行为通过，不证明选材或文案质量。模型评测及子agent对实际输出的复评由主任务继续执行。

## Next Iteration

1. 主任务在修改runner/tools/stories之前，运行同一4局实际模型基线，保存独立结果。
2. 以有效派生输入复核独立审计发现，避免引用被淘汰的120条残留战斗事件。
3. 优先改善旧日志中仍能证明的正向片段与全局线索；保持零次、死亡、伤害方向、因果和精确全局指标的证据标准。
4. 在每轮独评中分别记录趣味、重要关系命中、事实支持、错误归因、重复与漏选，不用卡片数量等同效果提升。
