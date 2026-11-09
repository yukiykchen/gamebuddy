## Purpose

为玩家提供每把已结束对局的独立本地档案，在本局复盘下方查看基础信息、分幕路线、终局收藏和逐层选择。详情以实际留存事实为准，兼容旧记录的字段缺失，不要求模型生成或联网加载。

## ADDED Requirements

### Requirement: Independent run details
系统 SHALL 在展开历史对局后于本局复盘下方显示独立单局详情，保留现有历史列表；详情 SHALL 不依赖复盘生成结果。

#### Scenario: Recap still generating
- **WHEN** 玩家展开一把已结束对局且复盘仍在生成
- **THEN** 单局详情能够独立加载，复盘完成不重置已展开的楼层

### Requirement: Factual summary and collections
系统 SHALL 展示已记录的角色、难度、结果、层数、时长范围、生命、金币、遗物和最终牌组。牌组 SHALL 区分升级和其他变体并合并相同卡牌数量；未知信息 SHALL 标为未记录，不把未通关等同明确死亡。

#### Scenario: Legacy incomplete run
- **WHEN** 旧局只有未通关和最后遭遇信息
- **THEN** 页面显示未通关及最后遭遇，不推断死因，不把缺失统计显示为零

### Requirement: Act route and selected floor
系统 SHALL 按幕与楼层展示实际记录的路线，默认不展示完整逐层履历列表。点击节点后 SHALL 在路线下方仅显示该层的简要信息；点击其他节点 SHALL 替换当前信息，再次点击同节点 SHALL 收起。信息包含已知遭遇、选择和资源变化，不提供逐回合回放。重复通知 SHALL 合并，SL淘汰战斗 SHALL 不重复计算，缺失楼层 SHALL 不补造。

#### Scenario: Select and collapse a floor
- **WHEN** 玩家依次点击两个不同路线节点后再次点击第二个节点
- **THEN** 单层信息先替换为第二层，再收起；页面始终没有完整楼层列表

#### Scenario: Repeated reward resolution
- **WHEN** 同一奖励选择多次上报且后续通知补充选中卡牌
- **THEN** 该层只展示一个选择并使用明确结果

### Requirement: Local accessible presentation
系统 SHALL 使用本地保存的游戏图标、深色详情面板和可键盘操作的路线节点，节点 SHALL 提供选中展开状态，操作后焦点保留在节点。缺失图片 SHALL 以名称或通用图标降级；详情 SHALL 不展示工具或内部证据标识。

#### Scenario: Offline viewing
- **WHEN** 玩家离线重新打开已保存对局
- **THEN** 已打包的图片和详情正常显示，未知资源仍有可读名称

### Requirement: Read-only lifecycle
系统 SHALL 仅接受历史中存在的对局标识读取详情，切换对局或清空历史后 SHALL 忽略旧请求结果，不改原始事实日志、不访问数据库、不上传对局。

#### Scenario: Stale response
- **WHEN** 详情请求返回前历史已被清空
- **THEN** 旧响应不重新显示被清空的对局

### Requirement: Real card thumbnails
系统 SHALL 在终局牌组中优先展示本地真实小卡面，按普通／升级状态匹配图片，保留名称、数量和变体分组。缺失完整图时 SHALL 降级到插画或通用图标。系统 SHALL 不增加悬停大卡面、点击放大或路线上的事件选项标注。

#### Scenario: Upgraded card displayed offline
- **WHEN** 玩家离线查看已升级卡牌
- **THEN** 显示本地升级卡面缩略图及升级名称，页面没有放大卡面交互

#### Scenario: Missing card face
- **WHEN** 某张卡没有可用的完整卡面
- **THEN** 使用插画或通用图标并保留可读名称和数量，不出现破图
