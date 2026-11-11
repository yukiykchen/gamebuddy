## ADDED Requirements

### Requirement: Responsive live game and danmaku controls

活跃对局中的事件处理 MUST NOT 重读整局以更新历史摘要。对局结束后，历史摘要 SHALL 随有效事件更新。macOS 弹幕发送入口 SHALL 使用独立窗口接收点击。桥接状态 SHALL 区分数据校验、存储和连接错误。

#### Scenario: Frequent combat events are received
- **WHEN** 对局进行中收到一批战斗事件
- **THEN** 每条事件仍 SHALL 按原有规则持久化和确认，历史摘要不参与活跃对局的事件处理

#### Scenario: The player opens the macOS composer
- **WHEN** 玩家点击发弹幕按钮
- **THEN** 发送面板 SHALL 接收点击并在可留言场景获取输入焦点

#### Scenario: The app is launched from Finder
- **WHEN** Finder 启动应用并收到游戏状态
- **THEN** 应用 SHALL 在自己的数据目录中写入决策日志。决策日志写入失败时，应用 SHALL 继续处理和发布该游戏状态。
