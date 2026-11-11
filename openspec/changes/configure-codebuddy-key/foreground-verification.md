# Foreground window verification

2026-10-20，按用户要求让配置密钥每次打开都在前台；沿用此前“先不打包”的要求，仅修改源码。

## Implementation

- src/gateway-setup-window.js提取实际生产窗口工厂，alwaysOnTop=true，focusable=true，首次就绪时抬升并聚焦。
- 原生层级使用screen-saver，与桌宠、弹幕保持对应层级；启用visibleOnFullScreen及全工作区可见。
- 每次用户主动打开已有窗口时restore（如需）、show、moveTop、focus及WebContents.focus；隐藏后重新显示，重复打开复用原窗口。
- 保留迟到ready回调的销毁及当前引用检查，不使用定时器维持焦点。

## Results

- 真实Mac Electron工厂smoke通过：首次显示、isAlwaysOnTop、实际isFocused、隐藏后3次重新打开、重复打开不新增窗口、销毁后安全返回、关闭后新建再显示/置顶/聚焦。
- 原有密钥表单、链接、空白提交和虚构测试密钥保存通过，使用独立临时用户目录，未读取或更改用户真实密钥。
- 9项网关测试、3项生命周期测试及8轮真实Electron关闭回归通过。
- 语法、5项agent、29项harness及OpenSpec严格校验通过。
- 窗口截图：.runtime/gateway-setup/foreground.png，仅含虚构测试配置。

## Limits

本轮未构建安装包、未替换正在运行的应用。原生Windows与Mac应用宝的全屏游戏现场层级尚未实测；不把原生窗口属性断言等同于所有系统场景下的绝对置顶保证。

## Native menu bar removal

用户截图中的白条为File/Edit原生菜单，原autoHideMenuBar仍可由Alt唤出（本机Electron37类型文档明确说明）。在Windows/Linux窗口创建后调用removeMenu，Mac不移除系统应用菜单；未增加键盘拦截或读取剪贴板。

9项网关测试、真实Mac Electron配置表单/置顶/重开/重建回归及窗口生命周期回归通过，语法与OpenSpec严格校验通过。Windows分支新增Alt键后菜单仍不可见的断言，当前未在原生Windows运行，不能将Mac结果等同于Windows粘贴实测。仅源码修改，未构建安装包。
