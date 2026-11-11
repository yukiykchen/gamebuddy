## Purpose

让 Windows 全屏游戏时，「发弹幕」按钮和输入面板能直接收到点击，而不依赖全屏弹幕层的点击穿透切换。

## ADDED Requirements

### Requirement: Composer window accepts clicks without a cursor probe

On Windows, the send-danmaku button and its input panel SHALL live in a window that does not ignore mouse events. A click on that button SHALL open the input panel without first sampling the cursor to disable click-through.

#### Scenario: Send button opens the composer

- **WHEN** the user clicks the send-danmaku button while danmaku is visible on Windows
- **THEN** the input panel opens and can receive text

#### Scenario: Flying danmaku stays click-through

- **WHEN** the cursor is over empty space of the flying danmaku layer and the composer is closed
- **THEN** that layer ignores the mouse event so the game still receives it

#### Scenario: Expanded panel stays inside the composer window
- **WHEN** the button window expands to show its input panel
- **THEN** the input, send and close controls SHALL remain inside that window's visible bounds and receive interaction

### Requirement: Ordinary interactive composer host
Windows发送窗口 SHALL 从创建时保持可聚焦和非穿透，收起后 MUST 保持可点击。发送窗 SHALL 位于飞行层之上，其点击不依赖光标轮询。普通弹幕到来 MUST NOT 主动夺取输入焦点。按钮和输入卡片外的窗口背景 SHALL 透明，MUST NOT 显示实色矩形或原生窗口阴影。

#### Scenario: Background around composer controls
- **WHEN** 发送按钮显示，或输入卡片展开
- **THEN** 按钮和输入卡片周围留白露出游戏画面，控件本身保持清晰可见、可点击和可输入

#### Scenario: First click and reopen
- **WHEN** 用户第一次点击发送按钮，或关闭输入框后再次点击
- **THEN** 输入框可见并可输入，收起过程不把窗口改成不可聚焦。

#### Scenario: Pointer above composer
- **WHEN** 指针位于发送窗口区域且飞行弹幕经过同一区域
- **THEN** 飞行层继续穿透，发送窗口保持可交互，不通过循环激活或抬升来实现点击。

### Requirement: Native Windows installed application validation
Windows安装构建 SHALL 对实际安装的GameBuddy.exe执行原生系统鼠标与键盘回归，MUST NOT 以Mac运行ASAR或DOM事件模拟当作Windows点击通过。

#### Scenario: Installed composer accepts native input
- **WHEN** 安装版连接本机战斗回放后，系统鼠标首次点击、关闭并重新点击发送按钮
- **THEN** 输入框可见且获得焦点，系统键盘可输入，点击发送后本机mock收到一次文本提交

#### Scenario: Missing native execution evidence
- **WHEN** 尚未取得原生Windows运行日志，或桌面不允许系统输入
- **THEN** 该验收保持待完成，构建检查不能把它记为通过，保留失败日志和可用截图
