# Iteration 01: Independent Evaluation Observation Plan

日期：2026-11-09（Asia/Shanghai）。角色：评测入口子agent。**本轮只设计，未修改实际入口或复盘业务，也未调用远程模型。** 需要主任务确认后实施。

## Current Effect and Problem

已阅读独立源审计 `independent-source-audit.md`、精确事件副本 `independent-source-evidence.json`、独立基线评审及 `.runtime/recap-real/00-baseline.json`。

原始实际模型基线4局仅发布1张卡，内容为“三幕战斗打出IMPERVIOUS获30格挡，随后进入消耗堆”，标题和总结将其称作“强化壁垒”。结构检查可能全过，但它混淆卡名，把相邻block.changed归因为该牌效果，还引用payload为空的card.exhausted证明特定牌进入消耗堆。三幕范围也没有直接被该卡断言核实。有效ID、数值相等和第二次模型批准不足以保证卡片真实。此卡应有明确语义问题标记，不能记为模型成功。

当前入口只有长度/存在/去重等结构指标，无法识别上述错误，也无法区分“模型发现了重要关系”与“程序本地卡回填成功”。因此下一轮先增加独立真值与可观测统计，不能以故事卡从0变3宣称达到优秀。

## Independent Dataset Truth

真值来自独立源审计，逐项绑定有效派生输入和来源hash，不从当前runner结果反推。为避免散落维护，建议在本入口中以一个只读 `REAL_EXPECTATIONS` 定义该四局的小型开发集标注，明确来源审计文件及版本/hash；不影响生产runner。未知或与输入hash不匹配的样本不沿用真值，报告not_applicable。

### Fixed Metrics

四局的独立期望均为 `[null, null, null, null]`，对应turn_damage、lethal_hit、absorbed、reloads，display均为“未记录”。禁止填0、用旧summary.maxTurnDamage、用entityId=0推玩家方向、用resumed计SL或以无fatal数据声称“无斩杀”。同时检查四项顺序、名称、值和显示，不能只检查固定槽位数。

这是真实旧数据的指标真值，不意味着新完整采集永远要返回null；已有富字段合成回归应继续保留。

### Correct Abstention

`ee6faa4a03e6494a9f86c032e9c91208`没有战斗、出牌、伤害、回合事实。硬期望：cards为空，closing为空或仅准确的资料不足提示，不发布未证实终局事件或战斗评价。其3个resumed和重复升级通知不是SL3或升级9次。正确弃答单列通过，不用有趣分0惩罚它；也不能因为它空白就认定模型处理失败。

### Important Relations

只将以下三个已核实关系列为必须尝试覆盖；可接受措辞不限，不强制固定pattern。机械覆盖是候选检出信号，最终是否真的讲出关系仍由独立语义审查确认。

| 关系ID | 对局 | 必要端点/证据 | 明确允许 | 明确禁止 |
| --- | --- | --- | --- | --- |
| zero_hp_recovery | 长局309ec… | a4…:3006 hp=0；:3008 hp=37，或:3007 currentHp=37；同combat/有效尝试/来源连续 | 生命归零后回到37；若提后续第三幕须再引用:3056 act=3 | 归因为某张牌/某一怪物命中；把空potion.used补成瓶中精灵；最终死亡或胜利 |
| rest_max_hp_growth | 长局309ec… | 六组before/action/after：359/363/364、770/774/775、1167/1187/1188、2095/2099/2100、2360/2364/2365、2730/2734/2735 | 记录内6次休息，各观察上限+5，合计30；单次关系也可单列部分覆盖 | 上限80→124的44全归因遗物；amount=0写成没回血；不限定记录范围却冒充整局 |
| ending_potions_low_hp | REGENT0da… | df…:319 hp63、药水2；末段:445或:466 hp8且同两瓶仍在；若写结束须:467 | 末段生命63→8，两瓶还在最后记录里；只说末段8血有药亦可部分覆盖 | 死时/宁死不喝/忘喝/全局从未喝/喝了必胜 |

附加可选关系：SILENT暴露在打击之后，必须对齐同一已记录阶段141–160，打击144/148、暴露156；不因顺序定罪。技能药水后免费岿然不动为可选，需药水3354与出牌3359，若只引用格挡3358不得宣称实际抗伤、救命或动作贡献。它们不能代替上表必找关系的漏选统计。

## Coverage Must Not Become Self-Reported Success

不要使用candidate.pattern或卡标题包含某关键词作为命中证据。建议每个关系输出：

1. `sourceAvailable`：标注端点均在当前有效输入中，字段值、顺序、会话/尝试与预期匹配。
2. `finalEvidenceCoverage`：最终卡确实引用必要端点/可验证聚合的完整证据；不只出现某一个关键ID。
3. `boundClaimCoverage`：卡的断言和绑定覆盖这些值/对象/范围；证据列表仅塞入所有ID而未在正文表达，不算语义通过。
4. `agentSemanticConfirmed`：独立评审确认正文真正表达该关系、没有超额因果；初值null，机械检查不得自动填true。
5. `interest1to5`：独立逐卡趣味分，未评初值null。

恢复关系需要0与37两个端点；如果另外写“走进第三幕”，必须查act=3。休息汇总需要六组端点，若正文只讲最后一次则算partial而非完整六休息覆盖。药水故事必须检查具体库存或数量来源，不能用空potion.used推断没喝过。

汇总同时报告可用关系数3、机械端点覆盖数、独立确认数、重要关系漏选数，以及可选片段数、正确弃答数。报告中不能把机械coverage叫“优秀率”或“趣味得分”。

## Attribution, Scope and Repetition Checks

新增评测检查/风险标记，不用这些启发式替代独立评审：

- **确定真值硬检查**：上述16个固定指标、无战斗局弃答、所有发布证据存在且属于有效尝试、未知不得用0、未经证实死亡和反事实表述；这些任一失败都不能被均分抵消。
- **名称绑定**：出现卡/遗物/药水名时对照本局运行时名称或同版本本地目录。IMPERVIOUS应是“岿然不动”，“强化壁垒”必须标错；纯英文工程ID亦应暴露问题。名称审查需要附引用来源，不只凭记忆。
- **效果归因**：正文写某卡造成伤害/获得格挡/救命/消耗时，检查同一actionId/parentActionId或直接事件字段证明。仅相邻事件的值相同不充分。缺关联时标attribution_unproven，不能擅自补关联。
- **负面事实范围**：从未用/没抽到/直到终局一次未用，需完整范围、唯一身份和来源支持。单一库存时点只证明持有，不能证明从未使用。
- **时段范围**：三幕/第几层/整局/首次/最高/累计必须有对应位置和覆盖；章节floor不能当累计楼层；同样需检查title和closing，不只body。
- **默认值风险**：legacy AfterCombatEnd false不能证明defeat；rest.amount=0不能证明回血0。保留source_audit_flags给独立评审，禁止让quality.unknownFields=[]洗白这些字段。
- **重复**：在已有事件级重复外，增加关系级重叠提示。六休息总计卡与其中一次休息卡共享同一成长关系，不能占两个卡位；末段药水与末段金币多半是同一终局资源关系，应提示合并；不同片段共享run.ended作背景不应误判重复。
- **总结越界**：与最终卡进行人物/名称/数字/胜败/归因/动机逐项比较；结构合法的总结仍可能新增“提供30格挡”等关系，必须单独列评审项。

## Trace Origin: Local Fallback Versus Model Discovery

建议入口在buildRecap前计算当前localStories并记录摘要（标题/正文/证据/关系标签）；在llm包装器捕获初始localLeads摘要和各次原始candidate，再对最终卡比对。

每张卡的来源字段建议为：

- `local_fallback`：在本地卡集合中，且没有模型接受候选对应；
- `model_selected_known_lead`：模型原始候选表达的关系已在初始localLeads暴露，即使换了文案也只算选中/改写；
- `model_discovered_relation`：模型原始候选带新证据链，关系不在初始localLeads中，最终程序/独立语义通过；
- `unknown`：无法可靠还原，保持未知，不强归因给模型。

匹配不只用pattern；基于grounded后标题/正文/关键端点、关系标签及证据对照。冻结响应回放不计为新模型发现。完整记录“原候选→程序拒绝→语义拒绝/通过→最终发布”，避免trace里有精彩候选却实际被全部丢掉仍报模型质量好。无法区分时应报告unknown而非乐观估计。

此观察可在入口包装llm.completeRecapTurn实现，不必修改runner业务；候选拒绝的具体原因若runner未输出，入口可在同一timeline离线调用candidateDiagnostics，注明这是事后重算。

## Phase Input Size and Provider Usage

在入口包装实际llm.completeRecapTurn，每次生成独立logicalCallId，记录stage=investigate/validate/closing、mustFinalize、remainingReads、开始/结束/错误、JSON输入字符数/UTF8字节数、实际系统提示字符数/UTF8字节数。提示按调用时的PROMPT/CLOSING_PROMPT选择，不用函数开始时的旧版本常量。

包装options.onUsage，保留原回调同时把usage绑定logicalCallId和stage。不要再把runner.trace里的同一usage重复相加。兼容Chat Completions的prompt_tokens/completion_tokens/total_tokens与Responses的input_tokens/output_tokens/total_tokens；缓存命中字段单独保存，cached_tokens是input子集，不能额外加进total。未知usage保留null，单独计缺失调用数，不能当0。

每阶段汇总：逻辑调用数、成功/失败数、输入字节累计/最大值、provider输入/输出/总token、缓存命中、usage覆盖率、耗时。长局history累积导致同一事实反复发送，应同时报告uniqueEvidenceIds与logicalInputBytes总量，帮助判断压缩是否减少浪费。token是真实供应商用量；字符数只是本地输入尺寸，不能冒充token计量。

HTTP重试或Responses→Chat回退可能在一个逻辑调用内产生多个网络请求：现有客户端未全部暴露计费usage，所以报告logicalCalls而非实际HTTP次数，费用仍null。无需为此读任何密钥、打印配置或修改实时模型链路。

## Implementation and Acceptance After Approval

1. 仅修改独立入口，新增四局独立期望和报告结构，不改源日志/runner。
2. 将当前本地结果、原始错误模型卡和真实输出按新规则离线重算，证实原“结构通过”不再等于语义成功。
3. 临时测试验证错误伪0、短局伪卡、只引用一个恢复端点、重复休息关系、usage缺失/缓存重复计数都被正确区分；不构造新游戏对局充当真实样本。
4. 主任务实际模型复测时使用新入口，保存阶段尺寸/用量与来源字段；独立评审另行补语义/趣味，不自动写“人工通过”。
5. 每轮报告对比真实模型候选质量和本地回填质量，单列剩余旧日志天花板与下一轮改进，不以程序补卡伪装模型能力增长。

待主任务确认实施。当前阶段未改变实际入口，所有真实原始文件仍只读。
