## Purpose

让 GameBuddy 在应用宝运行 Windows 版本时持续显示可读的透明飞行弹幕，在新消息到达和鼠标交互期间保持已有弹幕稳定，同时保留发送输入及游戏操作穿透能力。

## ADDED Requirements

### Requirement: Stable overlay presentation in YYB
应用宝运行环境中，系统 SHALL 在连续滚动、新消息到达和悬停期间保持已有弹幕可见，不能因重复窗口显示或交互状态切换而反复消失重现。

#### Scenario: New messages preserve existing flyers
- **WHEN** 已有弹幕正在飞行且新消息到达
- **THEN** 原有弹幕 SHALL 连续显示并继续移动，游戏输入焦点保持不变

#### Scenario: Hover remains stable
- **WHEN** 鼠标进入弹幕并保持静止，再离开弹幕
- **THEN** 弹幕 SHALL 稳定暂停并显示详情，离开后恢复移动，空白区域操作继续穿透

#### Scenario: Composer remains usable
- **WHEN** 新消息连续到达，用户展开、关闭并再次展开发送面板
- **THEN** 发送控件 SHALL 可点击、可输入，窗口周边保持透明，未主动打开面板时不能抢走游戏焦点

### Requirement: Late window callbacks are inert
主进程 SHALL 在窗口或其WebContents销毁、退出中或窗口被替换时，跳过该窗口迟到的加载与就绪回调。正常窗口 SHALL 继续初始化和显示，不能用全局吞错替代生命周期检查。

#### Scenario: Close during page loading
- **WHEN** 桌宠或弹幕等窗口页面仍在加载，窗口关闭后加载/就绪回调才到达
- **THEN** 回调 SHALL 不再发送IPC或显示窗口，不出现Object has been destroyed异常
