## Purpose

在不上传玩家数据的前提下，把最近对局整理为可解释的角色偏好、玩法倾向和单局复盘，让玩家看到自己长期怎样构筑、选路和使用资源，而不是得到无法验证的能力评级。

## ADDED Requirements

### Requirement: 对局历史仅保存在本地
系统 SHALL 在本机保存一个活动对局草稿和最近 100 局已完成摘要，MUST NOT 将复盘历史、角色画像或五星数据发送到共享弹幕服务、LLM 或其他远端。写入 SHALL 可从中断恢复且不得因半次写入破坏已有历史。

#### Scenario: 正常结束后归档
- **WHEN** 客户端收到有效的 `run.ended`
- **THEN** 系统 SHALL 把当前草稿归档为一条完成记录
- **AND** 同一 `runId` MUST NOT 出现重复记录

#### Scenario: 超过保留上限
- **WHEN** 第 101 条完成记录写入
- **THEN** 系统 SHALL 删除最旧的完成记录
- **AND** SHALL 保留最近 100 条

#### Scenario: 应用意外退出
- **WHEN** 应用在一局进行中退出并随后重新打开
- **THEN** 系统 SHALL 恢复同一 `runId` 的活动草稿
- **AND** 已完成历史 MUST 保持可读

### Requirement: 用户可以控制本地数据
复盘页面 SHALL 提供“导出 JSON”和“清空历史”操作，并明确显示“仅保存在本机”。清空 MUST 要求二次确认，导出 MUST 包含版本号和原始可追溯计数。

#### Scenario: 导出历史
- **WHEN** 玩家选择导出
- **THEN** 系统 SHALL 生成不含 API Key、客户端标识或共享弹幕内容的 JSON 文件

#### Scenario: 清空历史
- **WHEN** 玩家确认清空
- **THEN** 系统 SHALL 删除已完成历史和活动草稿
- **AND** 复盘页面 SHALL 回到无数据引导状态

### Requirement: 五星图表达玩法倾向
系统 SHALL 对全角色最近最多 50 局生成五个 0–100 的玩法倾向轴：进攻出牌、拿牌克制、精英挑战、商店消费和火堆升级。五星图 MUST 显示样本局数，并明确“越高表示越常这样玩，不代表水平更高”。

#### Scenario: 生成全角色五星图
- **WHEN** 所有角色合计至少有 3 局已结束历史
- **THEN** 系统 SHALL 使用全角色最近最多 50 局的有效原始计数生成五星图
- **AND** 每个轴 SHALL 能展开查看定义、分子、分母和未知样本数

#### Scenario: 样本不足
- **WHEN** 所有角色合计少于 3 局已结束历史
- **THEN** 系统 SHALL 显示“数据积累中”和实际样本数
- **AND** MUST NOT 用默认中间值伪造完整五星图

#### Scenario: 字段未知
- **WHEN** 某一轴的有效分母为零
- **THEN** 该轴 SHALL 显示为不可用
- **AND** MUST NOT 将未知绘制为 0 分

### Requirement: 页面遵循参考图的信息结构
复盘页面 SHALL 直接使用参考图的明亮街机数据卡结构：左上最近窗口胜局/局数，左侧单一主角色大图，右上蓝色网格与青色填充的五星图，右下最近统计条和可滚动的最近游戏记录。页面 MUST NOT 放置数据链路、计算说明卡或副角色区域；MUST 保持 GameBuddy 品牌和《杀戮尖塔 2》角色语义，不得捆绑参考图中的第三方角色或标志素材。

#### Scenario: 查看主角色
- **WHEN** 玩家打开复盘页且存在历史
- **THEN** 左侧 SHALL 展示最近 50 局使用次数最多的主角色
- **AND** 页面 MUST NOT 同时展示副角色缩略图

#### Scenario: 角色大图不可用
- **WHEN** 客户端无法合法获取角色大图
- **THEN** 页面 SHALL 使用对应 GameBuddy 桌宠图与角色名占位
- **AND** 布局 MUST 保持完整

### Requirement: 个人数据按需打开且桌宠常驻
应用 SHALL 保留桌宠、弹幕、Bridge 与本地复盘采集，但启动时 MUST NOT 创建原有主客户端窗口。桌宠和系统托盘的右键菜单 SHALL 提供“个人数据”，选择后按需创建只承载复盘页面的独立窗口；窗口关闭后 SHALL 销毁而不是隐藏。

#### Scenario: 启动 GameBuddy
- **WHEN** 应用完成启动
- **THEN** 桌宠 SHALL 正常显示并继续跟随当前角色
- **AND** 原有决策工作台主客户端 MUST NOT 自动出现

#### Scenario: 从桌宠打开个人数据
- **WHEN** 玩家右键桌宠并选择“个人数据”
- **THEN** 应用 SHALL 创建或聚焦唯一的个人数据窗口
- **AND** 窗口 SHALL 直接显示复盘页面，不显示原工作台侧栏或 LLM 日志

#### Scenario: 关闭个人数据
- **WHEN** 玩家关闭个人数据窗口
- **THEN** 应用 SHALL 销毁该窗口并释放对应 renderer
- **AND** 桌宠、弹幕、Bridge 和本地记录 MUST 继续运行

### Requirement: 页面展示确定性统计与最近游戏记录
页面 SHALL 展示全角色最近50局窗口的通关率、平均进度、精英挑战率和最多连胜次数；同时 SHALL 以列表展示最近游戏记录，每条固定包含角色、是否通关、关底 Boss、最终楼层和最高单回合伤害。所有百分比 MUST 同时提供分子、分母或样本数。

#### Scenario: 查看最近游戏记录
- **WHEN** 本地存在已完成或中断的历史
- **THEN** 页面 SHALL 按结束时间从新到旧展示最近记录
- **AND** 每条 SHALL 显示角色、通关状态、Boss、楼层和最高单回合伤害

#### Scenario: 最近记录字段缺失
- **WHEN** 旧版 Bridge 未提供 Boss 或单回合伤害
- **THEN** 对应字段 SHALL 显示“未知”
- **AND** MUST NOT 显示为零伤害或无 Boss

#### Scenario: 铁甲流派复盘可用
- **WHEN** 最近一局角色为铁甲战士且流派评分成功
- **THEN** 页面 SHALL 显示最终最高流派、最终分数、首次启动楼层和最接近但未闭合的流派

#### Scenario: 角色没有流派评分器
- **WHEN** 最近一局角色没有可用的流派评分器
- **THEN** 页面 SHALL 省略流派结论
- **AND** MUST NOT 套用铁甲流派或生成猜测标签


### Requirement: Universal window and explicit results
最近50局 SHALL 先按结束时间取窗口，跨角色汇总玩法图与统计；主角色 SHALL 按该窗口使用次数决定，并列时最近使用优先，角色大小写 MUST 统一。主角色局数与全角色样本数 SHALL 分别显示。历史结果 SHALL 明确区分通关、未通关、放弃，主动放弃 MUST NOT 进入胜率分母；旧摘要仅可用原始明确事实修复，不得猜测放弃。

#### Scenario: Three runs across characters
- **WHEN** 近50局有铁甲2局和静默1局且五轴均有数据
- **THEN** 以全体3局生成图，主角色仍为铁甲并显示2局；更旧的第51局不影响主角色或图。

#### Scenario: Explicit abandonment
- **WHEN** 结束事实明确reason为abandoned
- **THEN** 摘要和页面显示放弃，保留对局可观测行为，不把它当失败或计入胜率分母。

### Requirement: Four recent outcome statistics
近期统计 SHALL 仅展示通关率、平均进度、精英挑战和最多连胜，MUST NOT 再展示20张内牌组或火堆升级统计条。最多连胜 SHALL 按同一最近50局窗口的时间顺序计算，loss、abandoned或未知结局中断连胜；该项 MUST 显示次数而不是百分比或能力进度条。

#### Scenario: Win streak interrupted by abandoning
- **WHEN** 已结束对局按时间依次为win、win、abandoned、win
- **THEN** 最多连胜为2，放弃不进入通关率分母但会中断连胜。
