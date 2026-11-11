# Iteration 02: Real Evaluation Instrumentation

日期：2026-11-09（Asia/Shanghai）。由评测入口子agent实施。按主任务确认的 `01-harness-next-plan.md` 和先行 `02-plan.md` 执行，实际只修改 `harness/eval-real-recap.js`，不改复盘业务、原始日志、数据库或模型配置。未调用远程模型。

## Current Local Result

命令：`node harness/eval-real-recap.js --mode=local --output=.runtime/recap-real/round-02-local.json`。

| 项目 | 本轮结果 | 解释 |
| --- | --- | --- |
| 真实局数 | 4 | 原始4把已结束loss，没有合成新对局 |
| 最终故事卡 | 4 | 全部为local_fallback，不能算模型发现 |
| 独立标签匹配 | 4/4 | 以冻结的原始派生inputHash绑定，不只认runId |
| 固定指标真值 | 16/16保持null/未记录 | 不把未知填0，不用旧摘要亮指标 |
| 三个主要关系源证据可用 | 3/3 | 恢复、六次休息成长、君主低血携药 |
| 最终端点与断言覆盖 | 3/3 | 机械观察，不表示正文语义或趣味已达标 |
| 无战斗短局正确弃答 | 1/1 | 0卡、无虚构总结 |
| 真实模型调用及token | 无；token=null | 本轮只运行local，不伪记0 token为模型成功 |
| 硬检查失败 | 0 | 与独立语义评审分开 |
| 原始文件前后hash | 完全不变 | 37个源文件保持只读 |

当前4张本地卡来自主任务轮01故事改进，不是本入口创造的提升。新增入口使其被准确归因为本地回填，并可检验主要关系覆盖；它本身没有改善生产模型选材。

## What Changed

### Independent Truth and Coverage

四局固定指标独立期望均为null，检查值、顺序、名称与显示。无战斗2层局要求弃答。标签绑定轮00冻结的4份输入SHA256，输入改变时不自动沿用；未知数据标签返回not_applicable/null。

三个主要关系按独立源审计的精确事件端点校验，不采信模型pattern或标题自称。恢复需0与37两个端点；六休息需18个before/action/after端点以及6/5/30断言；君主末段携药需8血库存与结束边界。每项单列sourceAvailable、endpointCoverage、assertionCoverage、agentSemanticConfirmed=null，缺点不会被“有趣”的平均分掩盖。

已增加相同主要关系重复占卡提示与检查。错译IMPERVIOUS为强化壁垒、工程ID进入玩家正文作为确定错误；卡牌与效果仅相邻的归因、未知死亡、缺覆盖的未用/动机、全局/幕层范围等保留风险标记供独立语义审查。它们不是通用自由文本事实验证器，仍可能漏检或误报；正文和总结的所有语义需要独立评审。

### Provenance and Candidate Diagnostics

包装每次实际completeRecapTurn，捕获初始localLeads、原候选、程序diagnostics、渲染候选签名与validate输入/判决。最终卡匹配为local_fallback、model_selected_known_lead、model_discovered_relation或unknown。换文案选中已知关系不计新发现；未能还原时不乐观归因。

原候选diagnostics为同一时间线的事后只读重算；若诊断失败，仅记diagnosticError，不让观测改变业务结果。所有模型阶段按实际input.stage记录，包含repair，不只计investigate。原runner.trace继续原样保存。

### Actual Usage and Input Size

每次逻辑调用记录stage、mustFinalize、remainingReads、system/payload字符数及UTF8字节、耗时、错误、原供应商usage和归一化token。Chat prompt/completion与Responses input/output均支持，缓存字段作为input子集保留，不能重复加到total。用量缺失保持null，报告usage覆盖率。

phase汇总分别呈现逻辑调用数、成功/失败、累计/最大输入字节和供应商token。runner.trace中的同一usage不重复汇总。HTTP重试、温度重试和Responses→Chat回退仍可能有未暴露的计费；因此调用数明确为logicalCalls，费用保持null，字符尺寸不伪装token估算。

本轮增加相关实施文件hash，便于定位提示版本之外的实际代码版本。

补充：cases.calls最终改用modelCalls.length，确保修复阶段也计入总调用。主任务轮02远程进程启动后才完成这一计数字段修正，已启动进程仍使用其加载版本；不事后篡改该次报告，下一轮使用修正版。modelObservation.logicalCalls和逐phase计数始终来自包装器，可用于核对。

## Verification

- `node --check harness/eval-real-recap.js`通过。
- local四局重跑通过，完整结果见 `.runtime/recap-real/round-02-local.json`。
- 对真实结果作最小输出变异检查：未知指标伪0会失败；无战斗局伪造故事会失败；恢复仅引用一个端点不算覆盖；重复休息关系检查失败。没有生成新的游戏对局。
- 原轮00真实错误模型卡离线复查：IMPERVIOUS错名与工程ID检查失败，同时标记attribution_unproven，不再把结构通过当语义成功。
- 缓存token测试：prompt80/output20/total100/cache40仍总计100，不是140；缺usage阶段保持null；Responses输入字段正确映射。
- 模型包装器临时固定响应检查：repair阶段、diagnostics、输入字节与validate签名被捕获；选中已知本地卡归因model_selected_known_lead；每次调用usage只计一次。
- inputHash不匹配时不套用四局指标/弃答真值。

以上固定响应用于验证入口观测行为，不冒充真实模型效果。

## Next Iteration

主任务用新入口执行轮02实际模型评测，再由独立子agent对最终卡和总结逐项审查。优先比较模型合法选中率、三主要关系的模型/本地来源、修复是否对症、输入膨胀与真实provider token；不要只比较最终卡总数。

当前边界：关系断言机械检查不是自由文本语义证明；来源分类依赖被捕获的候选/validate，unknown需保留；四局反复开发不构成留出集泛化验证，趣味和玩家价值仍待独立评审，真实玩家盲评未做。短局弃答是正确行为，不能为追求卡数迫使其生成。
