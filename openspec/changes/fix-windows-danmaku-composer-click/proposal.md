## Why

Windows 上「发弹幕」看得见，但点击没有反应。弹幕层默认整窗点击穿透，只有主进程光标探测命中按钮后才临时取消穿透。全屏游戏下这次探测经常对不齐，点击会穿进游戏。

## What Changes

- 把「发弹幕」按钮和输入面板放到单独的小窗口，该窗口不点击穿透。
- 飞行弹幕仍留在全屏透明层，空白区域继续把鼠标交给游戏。
- Windows 光标探测不再负责让发送按钮收到点击。

## Non-goals

- 不代替玩家点击游戏，不改变游戏状态。
- 不改共享弹幕服务、AI 弹幕生成或密钥配置。
- 不把飞行弹幕改成始终拦截鼠标。

## Capabilities

### New Capabilities

- `windows-danmaku-composer`: Windows 上发送弹幕的按钮和输入面板由独立可点击窗口承载。

### Modified Capabilities

## Impact

桌面端弹幕窗口拆分：`main.js`、`src/danmaku.html`、`src/danmaku.js`。需要新的 Windows 安装包后才能在真机验证。
