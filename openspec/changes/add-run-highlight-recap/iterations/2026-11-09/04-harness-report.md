# Iteration 04: Selection Provenance and Actual Budget

日期：2026-11-09（Asia/Shanghai）。评测入口子agent依据先行04-plan和主任务明确授权实施。仅修改 `harness/eval-real-recap.js`；没有修改业务、原始日志、数据库或模型配置，没有调用远程模型。

## Current Result

`node harness/eval-real-recap.js --mode=local --output=.runtime/recap-real/round-04-local.json`：4个真实开发样本、4张卡、全部local_fallback；主要关系机械覆盖3/3、无战斗局正确弃答1/1、16个固定指标均null；hardCheckFailures为空，37个源文件哈希前后不变。modelEvaluated=false、actualModelInvokedRuns=0、provider token=null。

local模式在runner的无模型分支返回，因此earlyAbstainedRuns=0，而正确弃答真值仍1/1；二者不能混为“发生了模型提前弃答”。轮04实际远程结果由主任务后续执行。

## Changes

### Final Selection Controls Origin

优先读取最后一个recap.trace.selection，将最终卡按标题和完整排序证据集合匹配到实际modelCards/fallbackCards。fallback和模型候选canonical签名相同时，实际selection决定来源。冲突或无法匹配保留unknown。

原始候选渲染签名、localLeads与validate结果只作辅助，validate的supported=true不足以认定获批，还需issues为空、reason没有待修改/证据不足。没有selection时，无法可靠区分已获批候选与同签名本地回填则保持unknown，不乐观归因。是否已知线索仍与初始localLeads和独立端点比较，不因canonical改写声称新发现。

每卡补充originEvidence、runnerSelectedModel和runnerSelectedFallback，便于排查来源分类。modelSemanticallyApproved只记录模型复核判决，不冒充独立agent/玩家审查。

### Actual Model Work and Adaptive Budget

budget保留默认最大5个investigation响应，同时标adaptive=true，并补actualPerCase：每局实际模型调用与逻辑调用数、investigate/repair/validate/closing次数、mustFinalize出现在哪些调用、工具读取数。actualPerCase全部从这次捕获的modelCalls/trace观测，不推断某局必然消耗最大预算。

summary.actualModelInvokedRuns明确实际有请求的局数，earlyAbstainedRuns来自真实early_abstention轨迹。mode=model仅说明评测模式，不再需要读者猜“4局是否都请求了模型”。

### Player Text Risk Locations

标题、正文、总结均增加工程解释和库存未用暗示提示，例如“证据/字段/工具/来源未知”与“药没动/未喝/原封不动/舍不得”。每卡riskLocations区分title/body，closingReview单列总结风险与待评语义字段。未知死亡、工程ID、动机/负面事实和范围提示也复用这一入口。

这些是风险信号，可能有误报/漏报，不自动等于语义通过。agentReview和closingReview.semanticConfirmed继续null；机械关系覆盖3/3仍不能叫“全部优秀”。

## Verification

- `node --check harness/eval-real-recap.js`通过。
- local4局重跑通过；原始来源哈希不变。
- 将轮03报告只读重算来源：4张仍全部model_selected_known_lead，与实际selection一致；未重写旧报告。
- 最小输出变异：validate给supported=true但issues含“需要收窄”、reason为“建议改正文”，且真实selection使用本地回填时，最终正确标local_fallback；不再因存在同签名模型候选而误报。
- 没有selection且同签名本地卡、严格复核不通过时，仍正确记本地来源。
- 标题“证据不足，药未用”、正文“背包里的药没动”、总结“工具显示药水原封不动”分别触发对应位置风险；semanticConfirmed仍null。

上述变异只验证评测入口判断，没有生成新游戏对局，也没有把固定响应当实际模型效果。

## Next Iteration

主任务以当前入口跑轮04实际模型结果。检查实际来源、独立故事评分、成本和自适应预算，继续对比已知线索选择与模型真正新发现。若canonical恢复卡新增第三幕后续，需独立审计新的nextAct端点；原机械恢复覆盖只验证0→37，不能自动宣称后续第三幕也已被独立标注。

仍需玩家盲评和更多完整真实对局；当前4局全部为反复使用的开发样本。入口风险正则不能替代自由文本事实验证或独立语义复核。
