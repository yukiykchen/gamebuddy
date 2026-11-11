## Why

GameBuddy 启动后没有产品埋点，无法确认桌面端是否被打开。需要在大同登记一个应用，并在启动时上报一次。

## What Changes

- 启动完成后向大同上报 `app_start`，参数只有 `surface=desktop`。
- 上报失败不影响桌宠、建议和规则模式。
- 不上传 API Key、牌组、遗物或对局状态。

## Capabilities

### New Capabilities
- `desktop-ui/datong-app-start`: 应用启动时上报一次大同事件。

### Modified Capabilities
无。

## Impact

只增加一次启动后的 HTTPS 上报。缺少网络时静默失败。

## Non-goals

不自动出牌、不点击、不修改游戏状态。不上传密钥和对局内容。不建立看板。
