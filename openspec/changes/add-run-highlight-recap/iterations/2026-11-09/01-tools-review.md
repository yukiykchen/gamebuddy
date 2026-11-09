# Iteration 01: 查询工具改进与验证

日期：2026-11-09。归属：real_run_audit 子 agent。执行现有 add-run-highlight-recap 的9.3/9.4与01-plan，只修改tools.js及regressions.test.js明确标注的工具回归区域。原始游戏记录只读；未访问数据库或调用远程模型。独立源数据审计另见 independent-source-audit.md。

## Current Effect

原概览主要暴露战斗及40条未筛选事件，恢复阶段的牌组升级/奖励更新通知会挤占选择位置；没有run.observed状态分页与分幕状态极值。窗口/检索返回完整牌组描述，重复输入开销大，且质量未知字段未统一投影。

本轮概览可直接看到整局首末状态、每幕记录范围与生命/上限/金币/牌组大小的极值位置、三类已核实状态关系。状态页最多12条，使用observationCursor继续读取；不能只凭第一页无事件推断整局未发生。独立的战斗/选择分页仍保留。

## Changes

- `get_run_overview`新增observations/observationCount/observationNextCursor/observationsTruncated、observationSummary.first/last/byAct。摘要范围统一标scope=recorded，不把幕内跨重载的极值解释成连续回血或成长。
- 状态分页不重复整副牌牌面，只留牌组大小与精简遗物/药水名字。重要选择只留实际选择、休息动作、明确奖励结果、交易及具备身份的资源事件，不让deck.card_upgraded/reward.updated恢复通知挤占；原事件仍可find_events读取。
- 概览接入facts.observedRelations，最多12条全局关系，携带relationId/kind/fields/evidenceIds/scope/limitation。超出有明确计数及截断标记。
- 查询、窗口与概览全部通过observedPayload，未知字段不进入输出/对象匹配；旧AfterCombatEnd默认false不作为已知失败结果。原事件不变。
- find_events/read_event_window对run.observed使用queryPayload：deck保留原数组索引和id/name/upgraded/type/cost，删除重复description等牌面；遗物/药水保留id/name；响应标注compact_run_observed及机制查询提示。
- queryPayload正式导出供runner下一轮语义证据包压缩复用，避免另建一套投影逻辑。
- get_mechanic_facts增加本地potions.json，瓶中精灵可查，但仍status=reference_only，不能用机制知识证明实际药水触发。
- 明示loss不证明死亡、CARD.模型ID不等唯一牌实例、旧false不可靠、未绑定来源不能精确归因的边界。

## Real Data Check

只读按manifest.activeGeneration选择战斗文件，避免加载残留120事件。以下“字符”是JSON字符串长度，**不是供应商token/费用实测**。

| 对局 | 有效事实 | 观测数 | 紧凑重要选择数 | 新概览字符 | 首页原状态payload字符 | 压缩后payload字符 | 减少 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 长局309ec | 3223 | 223 | 85 | 23457 | 42539 | 13663 | 68% |
| 君主0da9 | 467 | 26 | 17 | 10907 | 40527 | 13089 | 68% |
| 猎手88ac | 229 | 9 | 3 | 7253 | 39387 | 12563 | 68% |
| 第二层ee6f | 93 | 14 | 1 | 7082 | 34780 | 11944 | 66% |

长局概览已出现health_recovery/rest_max_hp_growth/low_hp_inventory；君主出现low_hp_inventory；其他两局无强关系线索，没有为了填卡制造内容。

一次临时只读核对脚本假定所有run有combats子目录，遇第二层记录ENOENT；已改为直接读取该局根事件完成核对。未触发源目录创建/修改，不是业务测试失败。

## Verification

- `node --test --test-name-pattern='overview|lookup and windows|potion mechanics' review/recap/regressions.test.js`：首批5项定向通过。
- `node --test review/recap/recap.test.js review/recap/regressions.test.js`：44项通过，0失败，包含本轮6项新工具回归。
- `node --check review/recap/tools.js`：通过。
- `git diff --check -- review/recap/tools.js review/recap/regressions.test.js`：通过。
- 未在本子任务重新运行远程模型；模型结果由root的Iteration01评测负责，不能把查询压缩或单测通过当趣味达标。

本轮遵守CR-014，扩展现有工具/测试文件；事实投影复用observedPayload，不复制来源语义判断。9节任务整体完成状态由root在事实、模型、独立复评完成后统一登记，避免仅工具完成就错误勾选整项。

## Next Iteration

1. 观察模型是否沿关系线索查询原窗口并正确绑定，是否漏看后半程；特别避免把30格挡写成30实际抗伤。
2. 根据实际调用轨迹压缩supportPackets，复用queryPayload但保留断言所需数组索引与身份字段；记录供应商usage前后对比。
3. 长局概览仍约2.3万字符，可根据评测必要性进一步收敛选择页数量和观测摘要重复，但应保持全局覆盖与显式分页。
4. 若模型仍用event_field绕过关系语义限制，应在claims/runner配合修改；本工具子任务未擅自调整断言发布规则。
5. get_mechanic_facts遇未知anchorEventId目前仍沿原逻辑回退全局最后状态，后续应核对这个参数合同，防止将错误锚点视为当时状态；本轮未改动该行为。
