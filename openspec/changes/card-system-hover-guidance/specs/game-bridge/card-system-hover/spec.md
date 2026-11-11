## Purpose

在游戏奖励、商店卡牌及桌面相应查看入口展示一致的紧凑构筑提示，异步分析必须绑定当前牌组和候选上下文，确保切换页面或角色后不会显示上一场景的内容。

## ADDED Requirements

### Requirement: Card-relative hover placement
游戏内提示 SHALL 优先紧贴可见卡牌上方，间隔18像素；上方空间不足时 SHALL 尝试侧边，并保持12像素屏幕安全边距。奖励与商店 MUST 使用同一定位规则。

#### Scenario: Hover a reward card below screen center
- **WHEN** 卡牌上方可以完整放下面板
- **THEN** 面板底部贴近卡牌顶部，不再固定在屏幕顶端，卡牌移动或提示高度改变时同步更新。

#### Scenario: Card near viewport edge
- **WHEN** 卡牌上方或左右空间不足
- **THEN** 尝试可用侧边，最终限制面板在屏幕安全区内，保留多体系滚动。

### Requirement: Quiet normal guides and clean AI hover
普通小怪攻略 SHALL 默认不自动展开或覆盖桌宠提示，仍可手动查看缓存攻略；精英和Boss保持现有自动提示。AI人格弹幕悬停 SHALL 仅显示弹幕原文，不得展示提示词、生成上下文、来源或触发解释；怪物技能等事实详情 SHALL 保留。

#### Scenario: Ordinary combat starts
- **WHEN** 普通小怪战斗开始且攻略准备完成
- **THEN** 缓存可供手动打开，攻略面板保持关闭，桌宠不主动喊“攻略来了”或切换成查看攻略提示。

#### Scenario: Hover an AI line
- **WHEN** 鼠标移到携带旧版详细解释的AI弹幕上
- **THEN** 仅展示该条原文，原始消息中的额外解释不渲染，技能弹幕仍展示真实行动信息。

### Requirement: Three-line hover replaces score presentation
当前悬停展示 SHALL 每体系依次显示定位、短板、建议三行。运行入口 MUST 停止显示旧构筑分数、进度条和评分跃迁；普通选牌购物推荐及关键组件通知 SHALL 继续独立工作。

#### Scenario: Reward and shop hover
- **WHEN** 任一职业在奖励或商店悬停有资料的卡牌
- **THEN** 显示该牌所有相关体系三行提示，无旧流派分数，普通推荐仍可使用。

### Requirement: Context-bound asynchronous updates
提示 SHALL 立即使用缓存或规则结果，AI 更新 MUST 仅用于当前局、当前奖励/商店与当前牌组候选签名。关闭页面、售出、换牌组或换局 SHALL 作废旧提示；未升级与升级候选 MUST 可区分。

#### Scenario: Late model response
- **WHEN** AI 返回时玩家已经进入下一奖励或商店库存改变
- **THEN** 旧结果不更新新提示且不阻塞新场景请求。

#### Scenario: No model credentials
- **WHEN** 未配置模型或请求失败
- **THEN** 三行规则提示仍可悬停查看。

#### Scenario: Reward holder has no interaction rectangle
- **WHEN** 奖励卡牌外层Holder尺寸为空或不覆盖可见牌面
- **THEN** 悬停与聚焦判断使用实际Hitbox及CardNode，不依赖外层容器尺寸，升级变体候选直接由奖励数据绑定。

#### Scenario: Reconnect during active reward
- **WHEN** GameBuddy在奖励选牌界面重启或断线重连
- **THEN** 最新状态快照携带当前候选及签名，无需重新打开页面即可恢复三行提示；关闭后的空奖励快照清理旧上下文，旧版无该字段时兼容原事件路径。

### Requirement: Compact visual hierarchy and silent empty guidance
桌面与游戏内面板 SHALL 使用一致的暗色铜金视觉层次：套路标题与作用标签、对齐的短板及建议、柔和冲突色、多体系分隔及受限滚动。空体系候选 MUST 立即隐藏旧提示，不得显示空面板。长文本 MUST 换行而非裁掉事实，正常推荐与游戏交互 SHALL 保持可用。

#### Scenario: Hover from a related card to an unrelated card
- **WHEN** 指针从有关联的牌移动到空体系候选
- **THEN** 原面板隐藏；其他有关联候选仍可显示，空项不导致整批协议被拒绝。

