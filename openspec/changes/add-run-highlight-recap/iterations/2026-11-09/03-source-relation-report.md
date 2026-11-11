# Iteration 03: 末段携药关系的来源与铺垫

日期：2026-11-09。执行03-plan第3项，子agent仅修改`review/recap/facts.js`；stories/runner/tools/tests均未修改。只读四局原文件，按manifest.activeGeneration选择有效战斗数据。无远程模型、数据库或原始日志写入。

## Before and Current Effect

轮02的low_hp_inventory只证明某次低生命观察仍持有药水，容易被模型写成“未动/没用”；事实层原本没有前期生命或具体敌人，玩家文案辨识度有限。新字段增加同场的明确观察与敌人原名，但**不扩大为整场未使用、未动药水、忘用或导致失败**。

| 对局 | 原字段 | 本轮新增 | 结果 |
| --- | --- | --- | --- |
| 君主0da9 | hp8/maxHp75、2瓶及药水名 | hpEarlier63、enemyName立柱构造体 | 可叙述63→8的同场反差，末次仍持药 |
| 长局309ec | hp21/maxHp122、3瓶及药水名 | hpEarlier65、enemyName猫头鹰法官 | 可叙述65→21的同场反差，末次仍持药 |
| 猎手88ac | 无此关系 | 无 | 不造低血故事 |
| 第二层ee6f | 无此关系 | 无 | 继续正确弃答 |

这是事实线索扩充，实际玩家文案、排序、总结与模型质量由root的轮03评测负责；没有把“多了字段”作为趣味达标结论。

## Exact Proof and Stable Identity

君主来源前缀`df89d6aa28704e0c9a4d7bf4e03629be:`：

- :319 run.observed，act1/floor7/hp63。
- :322最早combat.started，combatId=e93e213780f7a9e886a8b30a，generation0。
- :323同场带enemies.name=立柱构造体。
- :466末次run.observed，hp8，背包两瓶。
- :467未通关结束。
- relationId仍为`low_hp_inventory:df89d6aa28704e0c9a4d7bf4e03629be:466`，没有因为追加早期证据而更换锚点。

长局来源前缀`a4f659024e12401cb2c85096f95762f3:`：

- :3497 run.observed，act3/floor6/hp65。
- :3499最早且带名称的combat.started，猫头鹰法官，combatId=23b75088fa0ec41dc813f2e8/generation0。
- :3702末次run.observed，hp21，背包三瓶。
- :3703未通关结束。
- relationId仍为`low_hp_inventory:a4f659024e12401cb2c85096f95762f3:3702`。

原字段hp/maxHp/potionCount/potionNames保留。完整evidenceIds增加早期观测、最早开始与必要的名称来源，断言检查仍需全部证据。add函数增加可选anchorEventId，其他关系原有默认锚定行为不变。

## Boundary Checks

新增铺垫要求：

1. 末次观测具有已记录战斗上下文；找到这场/这次尝试最早combat.started，之前最近的同会话、同act/floor观测必须不处于别场战斗上下文。
2. 早晚观察之间不能出现resumed/reload、combat.ended、其他combat.started或当前开始之后的别场/别尝试事件；不能换幕、换层或在开始后选路线/回地图。
3. 早期HP必须已知且高于末次HP，才提供hpEarlier；避免把相等/上涨写成下降。
4. 敌人名只取同场开始事件中完整已知的真实name，未知则不猜名称，不通过本地模型ID翻译捏造。
5. 不要求sourceSeq完全连续：两个正向观察仍可建立前后反差，但绝不以此证明完整战斗覆盖、药水零次使用或因果。
6. 额外关系不成立时保留原末次持有事实，不能因为早期证据不足把8血仍携药本身丢掉。

君主:321 power.changed携带旧场combatId，发生在新场最早开始:322之前。它是前置Hook的滞后归属，未出现新一场combat.started，不能误当实际别场穿插；代码仅允许开始之前的非边界Hook有这类旧归属。当前场开始后任何不同combat/attempt都拒绝扩展。真正另场开始/结束仍严格阻断。部分战斗文件被淘汰后，若仍有遗留root观测，也不能绕过位置与前置战斗上下文检查归入别场。

## Verification

- 真实四局只读检查：有效事件3223/467/229/93；总关系数3/1/0/0，本轮未增加虚构关系数量。
- 两局新增字段与精确证据如上，relationId保持原锚点。
- 临时纯内存断言覆盖：显式观测可跨缺号、ID稳定、resumed、reload、别场开始、位置切换、会话切换、前置残留战斗上下文、未知早期HP。全部通过，未写测试fixture或改共享测试文件。
- `node --test review/recap/recap.test.js review/recap/regressions.test.js`：51项通过、0失败。
- `node --check review/recap/facts.js`与`git diff --check -- review/recap/facts.js`：通过。

## Next Iteration

- root在共享回归中冻结新增字段、全部证明需求、ID稳定以及重载/别场反例；本子任务未代替root修改测试。
- 检查最终卡是否准确说“面对具体敌人，生命从63降到8，最后观察仍持药”，而非改写“全程未动/死亡时剩药”。
- 同一低血关系不能与其数字冠军拆成重复卡；长局仍优先归零恢复与六次休息积累。
- 后续若需要药水实际收益或误失斩杀，须补已确认来源/现场；本轮添加的前后观察仍不能提供这些结论。
