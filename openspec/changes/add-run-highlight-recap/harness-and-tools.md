# 模型复盘 Harness 与工具交互设计

日期：2026-10-26。状态：待实现。首版为单模型、受控只读工具循环；沿现有 Node.js LLM 客户端扩展独立复盘入口。

## 1. Harness 职责

绑定本次runId和factsRevision，构造全局概览，派发模型工具请求，维护预算，保存显式调用轨迹，检查故事证据并渲染短卡。模型负责找联系和选择片段，程序负责检索、计算、范围隔离和结构检查。

模型能主动查询日志，不限于给程序预选的纪录润色。原始日志与工具返回属于数据，不能变成执行指令；工具无写文件、联网搜索或操作游戏能力。

## 2. 统一工具响应

```json
{
  "requestId": "tool-12",
  "runId": "run-example",
  "factsRevision": "r7",
  "scope": {"combatId": "c9", "attemptGeneration": 2, "view": "effective"},
  "data": {},
  "evidenceIds": ["event-1", "snapshot-2"],
  "coverage": {"complete": false, "missing": ["card_identity"]},
  "truncated": false,
  "nextCursor": null
}
```

完整度按查询需要判断，不因一个无关字段缺失全局归零；缺失会影响哪个结论要写清。runId由主进程绑定，模型不能越界读取其他玩家或无关对局。视图默认effective；读取被替换尝试必须显式声明，最终纪录仍不计入旧尝试。

## 3. 工具契约

### 3.1 get_run_overview

- 参数：cursor、detail（compact/standard）；runId从会话绑定。
- 返回：结果、角色/版本、采集范围、全部战斗短概览、关键选择/构筑变化索引、固定纪录、SL和完整度。
- 完整概览索引覆盖所有战斗；长局分页并明确未读范围，不能只保留极值战斗。
- 不先替模型写好故事，不将“升级后遇敌”预判为失误。

### 3.2 find_events

- 参数：eventTypes、subjectIds、combatId、turnRange、sequenceRange、允许的字段条件、view、cursor、limit。
- 返回：按来源时序组织的匹配事件索引及统计范围。
- 支持精确ID与受控中文别名解析；同名歧义返回可选实例，不静默猜。
- 不执行模型提交的SQL、JavaScript、路径或任意表达式。

### 3.3 read_event_window

- 参数：anchorEventId、before/after数量或有界范围、includeSnapshots、visibilityMode、cursor。
- 返回：锚点前后连续事件、动作前后状态、回合/尝试边界及缺口。
- 默认压缩字段，保留关键数值与身份；展开请求可读取完整已记录快照。
- narrative视图可读后续真实结果；decision-time视图只返回该时点可见内容。后者不能泄露未来抽牌/隐藏顺序。

### 3.4 inspect_subject

- 参数：subjectId、subjectKind（card/potion/enemy）、combatId或range、view。
- 返回：对象获取/升级/变化/进入手牌/使用/退出的完整轨迹，准确次数、首次/末次位置、不可用原因分布和覆盖证明。
- 支持“本次升级实例是否在下一场打过”“药水是否一直持有未用”等查询。
- 零次统计与零次证明分开：count=0但coverage不完整时，不能返回neverOccurred=true。
- 自动使用也纳入实际使用计数；变形/复制/消耗等分支按真实身份处理。

### 3.5 get_mechanic_facts

- 参数：对象ID、游戏版本、所需机制主题。
- 返回：现有本地牌面与套路知识、来源、有效版本、适用范围和已知限制。
- 本局运行时牌面优先；稳定基线回退必须标明。过时知识或缺资料不能支持强归因。
- 不新增实时网络依赖；现有知识缺项如需刷新应作为独立维护任务。

### 3.6 check_claims

- 参数：结构化claims、引用、metric引用、候选片段范围。
- 可自动检查：事件存在、正确尝试/时段、顺序、对象身份、精确计数/极值/数值、负面事实覆盖、同一片段去重、机制版本匹配、是否需要反事实验证。
- 返回每项supported/contradicted/insufficient_evidence，以及证据和原因。
- code_supported只表示已实现谓词得到支持，不自动证明自由文本的全部语义、复杂因果或趣味；结果中明示检查范围。
- 无证据的自由因果解释不能被几个有效eventId“洗白”。

### 3.7 verify_action_sequence（后续受限工具）

- 参数：decisionSnapshotId、动作序列、要验证的局部目标。
- 纯函数计算已支持机制，不点击、不调用游戏执行接口，不修改真实状态。
- 返回：supportedMechanics、合法性、计算步骤摘要、结果、unknowns和proofId；存在未支持状态、随机依赖、触发或目标时返回unsupported。
- 首批仅验证确定的本回合斩杀/减伤及资源顺序，不能外推整场必胜、长期最优或另一条路线更好。
- 独立夹具验证计算器；首版故事发现不依赖该工具上线。未上线时模型得到明确不可用能力，不允许自行扮演验证器。

## 4. 模型交互状态机

```text
准备事实版本与概览
  → 发现候选
  → 工具读取证据（有界循环）
  → 提交结构化故事候选
  → 程序检查
  → 有可修复问题时一次定向补证/改写
  → 选择并渲染短回顾
```

每轮模型只可返回tool_calls或final。优先使用所选服务已验证的原生工具调用；若兼容服务不能稳定支持，则采用相同schema的JSON动作协议，由主进程执行白名单分发。两种路径共享工具与校验，不让兼容性差异改变事实规则。

现有completeJson不能直接当已具备多轮工具调用；拟新增独立completeRecapTurn/等价适配，保留实时选牌与弹幕请求的配置及调度。

初始试行预算：最多4轮取证、最多10次读取调用、1轮校验修复；总用时初始90秒并可配置。预算按真实样本测量后调整，非已验证性能承诺。达到预算时提交已支持候选，超时保留本地纪录，不重复播放猜测结论。

允许同轮执行独立读取，依赖前一结果的查询按序进行。按对象/战斗缓存，避免反复读取同一窗口。上下文不足时压缩已查片段并保留证据索引，不能丢掉缺口标记。

## 5. 候选与最终输出

故事候选包含：

- candidateId、pattern、location、subjectIds。
- title、bodyTemplate、metricBindings、evidenceIds。
- assertions：事实经过、零次事实、机制联系或反事实。
- claimStrength：observed/interpretation/verified_local_counterfactual。
- 未解决问题及是否可发布，不输出完整思考流。

模型自由写短文案，数值与对象通过metric/entity绑定渲染，并非固定台词库。渲染后再校验篇幅；序列号/ID不展示给玩家。

合成候选示例：

```json
{
  "candidateId": "story-1",
  "pattern": "upgrade_not_realized",
  "title": "升级了，没用上",
  "bodyTemplate": "{{hp}}血时升级的{{card}}，下一场精英战结束时，一次也没打出。",
  "metricBindings": {"hp": "rest-8.hpBefore", "card": "deck-card-17.name"},
  "evidenceIds": ["rest-8", "combat-9.end", "subject-proof-17"],
  "assertions": [
    {"type": "occurred", "eventId": "rest-8"},
    {"type": "combat_outcome", "combatId": "combat-9", "value": "death"},
    {"type": "zero_plays", "subjectId": "deck-card-17", "proofId": "subject-proof-17"}
  ],
  "claimStrength": "observed"
}
```

实际模板应表达死亡结果或其反差，同时满足正文长度；示例主要展示数据结构。不得把“未使用”改写为“因为升级才死亡”。

最终结果：fixedMetrics（固定四项及顺序：最高回合实际爆发、最高斩杀、实际抗伤、SL次数）、cards（从本局记录选择三个不同的重要片段，可含失误或高光；记录不足时可少于三个）、closing（基于所选片段最后生成一句总结）、coverageNote。固定指标缺失保留项目，显示未记录；完整记录确认无致死命中显示无斩杀，不替换成其他指标。内部另存runId、factsRevision、model/config/prompt/tool/knowledge版本与生成来源。

## 6. 一次完整查询示例

1. 概览显示第8层火堆升级、第9层精英死亡。
2. 模型通过find_events取得升级实例和该场战斗。
3. inspect_subject返回整场入手/使用轨迹和完整度。
4. read_event_window核对火堆前生命、真实升级与明确死亡。
5. 若从未上手，候选写“到倒下也没上手”；若上手时能量不足，读取当时窗口再写“来时没能量”；如有缺口则降级或放弃。
6. check_claims核对实例、次数、范围、结果，避免同名副本及旧SL尝试干扰。
7. 模型与其他候选比较，选择三个重要且无重复的片段，可以是失误、遗憾或高光，不强制好坏配比；随后根据三个片段写一句总结。

“火堆后24血，精英后4血”可作为定位背景，但没有进一步转折时不应仅为凑卡片而上屏。

## 7. 缓存、恢复与诊断

生成任务绑定runId+factsRevision+模型/配置+promptVersion+toolVersion+knowledgeVersion。打开页面不重复请求；迟到事实、SL替换、清空、版本变化均使旧结果失效。生成异步运行，不阻塞游戏与实时建议。

记录显式请求、工具参数/结果、输出、校验、重试、耗时和用量（服务提供时）。不要保存或要求完整隐式思考流。请求与工具结果可作为离线fixtures，重放检索与校验；重新调用模型另算效果评测。

模型只收到当前任务必要片段，原始日志留本地。既有“仅保存在本机”文案需准确区分本地存储与模型处理；不额外发送其他局、种子、密钥和共享留言。

## 8. 推荐实现位置（拟新增）

| 模块 | 职责 |
| --- | --- |
| review/recap/timeline.js | 日志/快照组装、有效尝试与查询索引 |
| review/recap/metrics.js | 固定纪录、对象轨迹与覆盖证明 |
| review/recap/tools.js | 六个只读工具及参数schema |
| review/recap/runner.js | 模型循环、预算、取消、修复 |
| review/recap/claims.js | 结构化断言与发布门槛 |
| review/recap/store.js | 版本化高光投影和缓存 |
| agent/llm/openai.js | 独立复盘交互适配，兼容已验证服务 |
| facts/ 与 harness/ | 事实/快照扩展、查询与回归fixtures |

模块名可在实现时微调，职责、只读边界和验收行为保持不变。

## 9. 技术依据

- 采用少量、边界明确、返回有效上下文的工具：[Writing effective tools for AI agents](https://www.anthropic.com/research/writing-tools-for-agents)。
- 客观检查与模型/人工评审分工：[Demystifying evals for AI agents](https://www.anthropic.com/research/demystifying-evals-for-ai-agents)。
