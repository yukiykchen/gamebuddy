# Iteration 01: 真实基线与旧日志状态线索

## Current Effect

独立只读基线：4把明确结束的loss均0卡，固定四项均未记录。只有1把run.started完整，其他中途接入。旧card.drawn为空、damage来源与fatal缺失、combat.ended默认false，不能伪补。

## Hypothesis and Changes

1. 先运行原版实际模型基线并保留响应，再改业务。
2. get_run_overview增加紧凑状态/分幕摘要和有界正向线索，暴露run.observed、休息前后上限成长、0血后恢复、低血仍携药等关系。不是把整副牌每次重复塞入输入。
3. 旧Hook victory:false且details.hook=AfterCombatEnd、缺明确outcome时标为不可靠，不得作为defeat证据；不更改源事件。
4. 本地支持可核实的状态反差短卡；长度、不同事件去重、具体总结；证据不足不出卡。记录0血后恢复不能写死亡，药水持有不证明全程未使用。
5. 记录来源顺序与有效尝试；关系不跨sourceSession/重载，避免把读档回血当治疗。

## Acceptance

保留原日志SHA256；4局结果可复现；模型与离线分开；至少找回可证的长局生命恢复转折和君主末段资源反差，短局不凑；全部固定指标仍未知而非假零；不输出死亡/必胜/误斩杀；既有回归通过；子agent独立评分并给下一轮计划。

## Next

根据模型基线和本轮复评进一步改取证、去重、选材与错误解释，不以卡片数量增加冒充质量提升。
