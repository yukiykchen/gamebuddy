# Iteration 03: Evaluation Statistics and Scope Review

日期：2026-11-09（Asia/Shanghai）。评审者：独立评测入口子agent。仅只读复核 `.runtime/recap-real/round-03-model.json`、当前实现与真实派生输入；未改业务/入口、未调用外部API、未写原始日志或数据库。本报告是agent工程复核，不是玩家盲评。

## Current Actual Effect

轮03使用 `recap-10`、`recap-tools-5`。4个开发样本全部经过系统评测，其中**3局实际调用远程模型，1局由本地提前弃答，远程调用为0**。不能将mode=model或summary.modelEvaluated=true解释为4局都发起模型请求。

最终4张卡，REGENT1张、长局3张；SILENT与2层短局0张。四张全部是canonical_known_relation，且selection.trace明确归入modelCards，fallbackCards为空。来源标记 `model_selected_known_lead:4` 正确：模型选中了初始已有的关系，由可信事实句渲染；**没有证据支持称为4个模型自主新发现**。

三主要关系端点/断言机械覆盖3/3，短局正确弃答1/1，16个固定指标保持null，hardCheckFailures为空。这些不是趣味或优秀率；agentSemanticConfirmed和interest仍为空，须由逐卡独立审查填写。

## Phase and Usage Reconciliation

逐项重算了15个modelCalls，检查每项usageCallbacks=1，total=input+output，逐局calls=modelCalls.length，逐局/全局token与report一致。

| 对局 | investigate | repair | validate | closing远程调用 | 全部逻辑调用 | provider总token |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| REGENT 7层 | 3 | 1 | 1 | 0 | 5 | 61,722 |
| IRONCLAD 39层 | 3 | 1 | 1 | 0 | 5 | 110,727 |
| SILENT 5层 | 3 | 1 | 1 | 0 | 5 | 69,383 |
| IRONCLAD 2层 | 0 | 0 | 0 | 0 | 0 | 未调用，usage为null |
| 合计 | 9 | 3 | 3 | 0 | 15 | 241,832 |

| phase | 逻辑输入UTF8字节（含system） | provider总token |
| --- | ---: | ---: |
| investigate | 550,817 | 196,698 |
| repair | 53,200 | 20,088 |
| validate | 70,124 | 25,046 |
| 合计 | 674,141 | 241,832 |

输入token234,387，输出7,445，相加241,832。缓存命中输入token109,952是输入子集，没有重复加到total。15/15个实际调用提供usage；短局0/0不应补为供应商报告了0。所有最终总结来自local_closing，没有远程closing调用。工具读取分别4、6、6、0，共16次。

报告budget.investigationRounds=5是默认最大响应数，代码maxRounds=4采用0..4；旧日志无快照且damage无阵营时自适应roundLimit=2，实际最多3次investigate响应。本轮3个模型局均为3次，最后mustFinalize=true。保留最大预算字段合理，但下一轮报告宜补 `adaptive=true`、各局实际roundLimit/实际调查次数，不能把5说成每局实际调用次数。

## Origin Classification Review

当前4个来源分类与selection.trace一致。canonical渲染后的签名可以匹配原模型候选，已知关系仍作为known lead；没有把改标题/改写文本当新关系。REGENT两份相同候选中一份获批、长局重复候选中三份获批，其余因重复被拒，当前最终来源没有被重复候选抬高。

入口存在后续需改的通用边界：evaluateExpectations的checked只看supported=true，而runner还检查issues为空和reason不含保留问题。若模型给supported=true但issues非空，runner拒绝该卡后本地同签名回填，当前入口可能误标模型接受。**本轮没发生这个误报**：所有发布卡都有通过门槛的判决和selection.modelCards佐证。建议下一轮优先用selection.trace确认最终model/fallback来源，而非在入口复制一部分语义门槛。

## Actual Correctness Issue for the Next Iteration

### P1: Free pattern can create an unsupported local closing

`review/recap/stories.js`的localClosing仅根据card.pattern选择“归零后恢复”等总结；groundedStory允许新候选自由填写pattern，pattern本身没有事实验证。storyPriority也直接使用该值。

已用SILENT真实事件 `d7617f5938604a5f806972d676faeb7b:156` 做只读最小复现：

```json
{
  "pattern": "health_recovery",
  "title": "暴露的记录",
  "bodyTemplate": "{{card}}出现在这次出牌记录里。",
  "evidenceIds": ["d7617f5938604a5f806972d676faeb7b:156"],
  "assertions": [{"type":"event_field","eventId":"d7617f5938604a5f806972d676faeb7b:156","field":"cardId","value":"EXPOSE"}],
  "bindings": {"card":{"claimIndex":0}}
}
```

groundedStory接受其正文“暴露出现在这次出牌记录里。”，但 `localClosing([card])` 返回“血条曾经归零，随后又重新亮起。”，与这局和所选事件完全不符。这个普通片段在当前语义复核应被拒；问题是**任何获批的新片段都可能使用同名自由pattern**，而总结回退不能依赖模型是否恰好选了合理标签。若closing请求失败/非法，错误本地总结可作为回退发布。已知优先级同样可被pattern冒用。

建议只从可信typed relation或已验证专用模板来源决定已知总结与优先级；自由pattern仅作标签。可直接将这条真实事件的最小输出变异加入回归，不需编造完整新对局。当前轮03四张卡均有真实typed relation，**此问题没有污染本轮最终输出**。

## Efficiency Improvement Grounded in This Run

repair把“原来已合法的候选”与“模型返回的完整修复集合”合并，导致validate收到重复canonical卡。REGENT为2张完全相同卡，长局为5张其中2张重复；模型耗用语义复核再判重复。

下一轮可在validate之前按渲染后title/body/排序evidenceIds精确签名去重，只去掉完全相同卡，保留不同故事候选竞争。不会丢失新事实，也不用压缩或隐藏原始证据。本轮validate合计25,046token，其中长局16,144；不能预先宣称节省多少，应实跑比较。

SILENT最终0卡仍用了69,383token，说明成本尚有优化空间；但不能简单以“没有现有三类关系”阻止模型调查新关系。优先减少重复支持包、无目标大窗口与格式修复，再观察是否仍浪费预算。

## Next Iteration Recommendations

1. 修复总结/优先级对自由pattern的信任，加入真实最小复现与合法typed relation正例。
2. validate前精确去重，减少修复合并产生的重复支持包，观察实际provider成本。
3. 入口来源确认以最终selection为准；补自适应预算与实际模型处理局数，保持当前报告不回写伪造。
4. 对4张最终卡和一句总结分别做独立事实/趣味审查，检查“63→8仍有药”与“65→21仍有药”的区别和是否足够本局特色；3/3机械覆盖不是全优秀。
5. 继续保持原始来源哈希、4局开发集/无独立留出集/无真实玩家盲评的界限。下一轮是否改善必须以实际运行和独立评审为证。
