# Iteration 04: 归零恢复后的下一幕证据

日期：2026-11-09。执行04-plan第2项，仅修改`review/recap/facts.js`。未修改stories/tests/runner/tools，未调用远程模型或访问数据库。原始游戏日志只读，采用manifest.activeGeneration有效文件选择。

## Before and Current Effect

轮03恢复关系能证明同场0→37，但没有已验证的后续位置，不能将“后来走到第三幕”写入同张卡。本轮在严格来源连续条件下扩展同一条health_recovery，增加nextAct，原0→37字段与关系ID保持不变，不额外凑新卡。

四局只读结果仍为关系数3/1/0/0。只有长局得到nextAct=3；其他三局没有生成虚构恢复或幕数。用户文案是否更有趣、是否满足长度和事实范围，由root轮04实际评测负责，本报告不把字段增加当模型效果达标。

## Exact Source

runId：309ec1038c6a49749de3274851d738a1。事件前缀：`a4f659024e12401cb2c85096f95762f3:`。

- :3006 run.observed：act2/floor16/hp0。
- :3008 run.observed：act2/floor16/hp37。
- :3039 combat.ended：仅用作同场结束边界，不使用其默认victory=false推断胜负。
- :3054 run.observed：act2/floor17。
- :3056 run.observed：act3/floor0。

:3008至:3056的有效源事件逐条连续、同sourceSession，无重载/新局/提前run.ended、其他战斗或尝试。第二幕楼层向前，观察到第三幕时楼层重置被明确更大的act解释。

扩展结果：

```json
{
  "relationId": "health_recovery:a4f659024e12401cb2c85096f95762f3:3006",
  "kind": "health_recovery",
  "fields": {"hpBefore": 0, "hpAfter": 37, "act": 2, "floor": 16, "nextAct": 3},
  "evidenceIds": [
    "a4f659024e12401cb2c85096f95762f3:3006",
    "a4f659024e12401cb2c85096f95762f3:3008",
    "a4f659024e12401cb2c85096f95762f3:3056"
  ],
  "scope": "recorded"
}
```

字段仅证明已记录到的归零、恢复、进入更大幕。没有证明最终死亡、Boss获胜、药水触发来源或玩家操作正确。

## Implementation and Boundaries

新增局部nextActAfterRecovery，在原恢复关系成立后扫描后续有效事件：

- sourceSession必须相同，sourceSeq必须逐条+1；被淘汰文件造成缺号时停止附加nextAct。
- run.started/resumed/reload_observed/ended立即停止扩展。
- 出现别的combatId/attemptGeneration停止；同场结束后再出现combat.started也停止，避免把重开或后续另一场当同一转折。
- run.observed的act/floor须已知；同幕楼层只能非递减，act不能后退。只在明确观察到更大的act时返回其原事件。
- 未取得nextAct证明时，保留原0→37，证据仍为原两个端点。
- 原relationId仍由最初0血事件锚定，增加第三幕证据不换ID、不新建故事。

## Verification

- 四局只读真实核对：有效事件3223/467/229/93；长局nextAct=3，另三局无恢复关系；其余关系数量保持不变。
- `node --test review/recap/recap.test.js review/recap/regressions.test.js`：55项通过，0失败（执行时共享测试版本）。
- 纯内存边界检查：正常附加nextAct且ID稳定；新局、resumed、reload、提前结束、源缺号、会话变化、楼层后退、幕后退、下一幕未知、途中过渡位置未知、另一战斗、同场结束后重开共12类拒绝。每类均保留原hpAfter37与两个原始端点，不偷偷丢弃已支持恢复。
- `node --check review/recap/facts.js`及`git diff --check -- review/recap/facts.js`通过。
- 无本子任务远程模型调用，未测供应商usage或实际趣味变化。

## Next Iteration

1. root将正常/拒绝路径补入共享回归，验证缺少第三幕证据的recorded_relation候选不能写nextAct。
2. 同卡表述恢复和第三幕，让后续兑现增强转折，不单独增加“进入第三幕”流水账卡。
3. 仍不得将“后来进入第三幕”改写为“打赢双Boss”“瓶中精灵救命”或“最终生还”；这些分别需要结果与明确来源证据。
4. 在隐藏派生线索的评测中，检查模型能否自主沿恢复事件找到后续观察；已知关系的正确选择不等于自主发现。
