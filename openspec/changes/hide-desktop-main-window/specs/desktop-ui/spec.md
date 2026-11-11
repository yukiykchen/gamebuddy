## Purpose

定义 GameBuddy 在不显示独立主面板时仍能作为后台桌宠与游戏覆盖层运行，并让玩家保留必要的显隐和退出控制。

## ADDED Requirements

### Requirement: Application runs without a main window
GameBuddy 启动后 SHALL NOT 创建或显示独立主面板。应用被再次激活、桌宠被点击或托盘被操作时 MUST NOT 打开主面板。

#### Scenario: Normal startup has no main panel
- **WHEN** 玩家启动 GameBuddy
- **THEN** 系统不显示独立主面板
- **AND** 桌宠、弹幕和后台对局分析仍可启动

#### Scenario: Re-activating the application does not open a panel
- **WHEN** 玩家在应用已运行时再次激活 GameBuddy
- **THEN** 系统不创建或显示独立主面板
- **AND** 已有桌宠与后台能力继续运行

### Requirement: Tray retains essential controls
无主面板运行时，系统托盘 SHALL 继续提供桌宠显隐和退出应用的控制，并 MUST NOT 提供会打开已停用主面板的入口。

#### Scenario: Player controls the headless companion from the tray
- **WHEN** 玩家打开 GameBuddy 的系统托盘菜单
- **THEN** 玩家可以显示或隐藏桌宠并退出应用
- **AND** 菜单中不存在打开主面板的可执行入口
