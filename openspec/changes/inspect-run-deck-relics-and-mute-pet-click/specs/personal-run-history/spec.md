## Purpose

让玩家从本机个人数据中选择任意历史对局，查看该局结束时实际记录的牌组与遗物，并清楚区分已记录的空集合和旧数据缺失。

## ADDED Requirements

### Requirement: Historical runs expose end-of-run builds
个人数据页面 SHALL 允许玩家选择任意历史对局记录，并在该记录下方展示该局结束时保存的完整牌组与遗物。展开内容 MUST 与所选记录的稳定对局标识关联，不得显示其他对局的终局数据。

#### Scenario: Expand a run with build data
- **WHEN** 玩家点击一条具有终局牌组与遗物数据的历史对局
- **THEN** 页面 SHALL 在该记录下方展开终局构筑详情
- **AND** SHALL 分别展示该局的全部卡牌和全部遗物

#### Scenario: Switch between historical runs
- **WHEN** 玩家在一条历史对局已展开时点击另一条历史对局
- **THEN** 页面 SHALL 展示新选择对局的终局牌组与遗物
- **AND** MUST NOT 沿用上一条对局的构筑内容

#### Scenario: Collapse the selected historical run
- **WHEN** 玩家再次点击当前已展开的历史对局
- **THEN** 页面 SHALL 收起该记录的终局构筑详情

#### Scenario: Inspect a historical run with the keyboard
- **WHEN** 键盘用户聚焦一条历史对局并执行其激活动作
- **THEN** 页面 SHALL 提供与点击相同的展开或收起行为
- **AND** 该记录 SHALL 暴露当前展开状态

### Requirement: End-of-run deck and relics reflect local records
个人数据页面 SHALL 按本地历史保存的顺序显示终局卡牌与遗物，并 SHALL 优先显示可用名称、升级状态和数量。系统 MUST NOT 调用 LLM、网络服务或当前游戏状态补猜历史构筑。

#### Scenario: Cards include upgrade state
- **WHEN** 所选对局的终局牌组中记录了升级卡牌
- **THEN** 页面 SHALL 以可辨识的升级标记展示这些卡牌
- **AND** 未升级卡牌 MUST NOT 被标记为升级

#### Scenario: A card has multiple copies
- **WHEN** 所选对局的终局牌组包含同一卡牌的多个副本
- **THEN** 页面 SHALL 保留其真实副本数量
- **AND** MUST NOT 因名称相同而丢失副本

#### Scenario: A run is known to have no relics
- **WHEN** 所选对局明确记录了空的终局遗物列表
- **THEN** 页面 SHALL 显示“本局没有记录到遗物”的已知空态

#### Scenario: Legacy history lacks end-of-run build data
- **WHEN** 所选对局没有终局牌组或遗物字段
- **THEN** 页面 SHALL 对缺失的类别显示“旧记录未包含此数据”
- **AND** MUST NOT 将缺失字段冒充为空牌组或空遗物列表

### Requirement: Personal Data opens only through explicit menus
系统 SHALL 保留桌宠右键菜单和系统托盘菜单中的“个人数据”操作。桌宠身体或气泡的普通点击 MUST NOT 打开、创建或聚焦个人数据窗口。

#### Scenario: Left-click the pet body
- **WHEN** 玩家普通点击桌宠身体且没有执行拖动
- **THEN** 系统 MUST NOT 打开、创建或聚焦个人数据窗口

#### Scenario: Left-click speech without a contextual action
- **WHEN** 玩家普通点击气泡且当前没有可重开攻略或可展开建议卡
- **THEN** 系统 MUST NOT 打开、创建或聚焦个人数据窗口

#### Scenario: Open from the pet context menu
- **WHEN** 玩家右键桌宠并选择“个人数据”
- **THEN** 系统 SHALL 创建或聚焦唯一的个人数据窗口

#### Scenario: Open from the system tray menu
- **WHEN** 玩家从系统托盘菜单选择“个人数据”
- **THEN** 系统 SHALL 创建或聚焦唯一的个人数据窗口
