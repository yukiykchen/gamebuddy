## Purpose

让 GameBuddy 每次启动后向大同上报一次应用打开事件，上报失败不打断桌宠和对局建议。

## ADDED Requirements

### Requirement: App start reports one Datong event
应用完成启动后 MUST 向大同上报一次 `app_start`。事件参数 MUST 只包含 `surface=desktop`。上报内容 MUST NOT 包含模型 API Key、牌组、遗物或对局状态。上报失败 MUST NOT 阻断桌宠、建议或规则模式。

#### Scenario: Startup sends app_start
- **WHEN** 应用启动完成
- **THEN** 发出一次 `app_start` 上报，参数为桌面端

#### Scenario: Upload failure stays silent
- **WHEN** 大同上报请求失败
- **THEN** 桌宠和其余功能继续可用
