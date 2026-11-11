# Verification

## Installed baseline

2026-10-20，本机存在应用宝 GameBuddy.exe 进程。实际安装 ASAR：

`~/Library/Application Support/com.tencent.yybmac.wine.engine/wine/drive_c/users/tencentyyb/AppData/Local/Programs/GameBuddy/resources/app.asar`

其中 package.json 版本为 0.2.10；main.js、src/danmaku-composer-window.js、src/danmaku.js 与修改前工作区逐字节一致。main.js SHA256 为 `e3a5dcce35ee33e5da13b95a1ff4dab720cc0427c852ea8f3b754751b379889d`。

确认的代码问题：每批消息重复 showInactive 和发送窗 moveTop，桌宠定时重复设置置顶/显示，发送窗范围内每40ms重复设置飞行层穿透；Windows 飞行层同时接收原生 pointerleave/mousemove 和主进程采样，存在暂停状态相互撤销的路径。这些是待排除的原因，尚未证明它们是应用宝现场闪烁的全部根因。

## Changes

- 原生窗口只在隐藏到可见时显示；发送窗仅初次显示、重新显示、用户主动展开时抬升。
- 鼠标穿透按窗口实例缓存；只有状态变化才调用原生API。清理及重新加载同步到穿透状态，新窗口独立初始化。
- 避免无变化的窗口 bounds 和桌宠置顶设置。
- Windows overlay 以光标采样作为唯一悬停来源；进入独立发送窗时发空命中探测，解除过期暂停状态。Mac 原生窗口沿用鼠标事件。
- 保留透明发送窗、可聚焦输入、悬停详情和空白区域穿透。

## Automated results

- `node --test agent/tests/danmaku-window-state.test.js`：3项通过。验证100批消息期间不重复显示/抬升/聚焦，隐藏后能重新显示；250次相同光标采样只设置一次穿透，模式变化/销毁/重建正确；展开、关闭、再次展开仍可聚焦。
- `npm run test:danmaku`：94项通过，已包含新增窗口状态测试。
- `npm run test:syntax`：通过；新增窗口模块另行 node --check 通过。
- `npm run test:agent`：5项通过。
- `npm run harness:validate-all`：29项检查通过。
- `electron harness/danmaku-renderer-smoke.js`：通过；新增真实 renderer/preload IPC 回归验证重复采样及模拟原生离开事件不撤销静止悬停；离开恢复滚动，交互状态仅 true→false。
- `electron harness/danmaku-composer-smoke.js`：通过；展开、输入、本地假提交、关闭、重新展开及透明像素检查通过。
- `openspec validate fix-yyb-danmaku-flicker --strict`：通过。

## Acceptance limits

独立候选包：`dist/danmaku-flicker/GameBuddy-Setup-0.2.11.exe`，102,538,348 bytes，SHA256 `93978edf064f1ada143504558410fbf1a78e277ae87dc00665d8ed8a17775cee`，旁有 SHA256SUMS.txt。

包内版本0.2.11；main.js、两个窗口模块、src/danmaku.js、preload.js 与本次工作区逐字节一致。以包内ASAR作为 `GAMEBUDDY_TEST_APP_ROOT` 再运行发送框 smoke，通过展开、输入、本地假提交、关闭、重新展开及透明像素检查。网页下载仍保留用户已确认的0.2.10，没有替换已提交的网页下载，也没有上传候选包。

上述 Electron 检查运行于 Mac 原生 Electron；模拟原生鼠标事件的回归不是应用宝视觉验收，也不是原生 Windows 系统点击验收。

尝试读取应用宝 GameBuddy 窗口时，计算机操作工具超时；独立调用应用宝 wineloader --help 异常退出（139），不能据此猜测其启动参数。未替换正在运行的安装目录或用户数据，未对游戏执行操作，未向线上发送测试弹幕。

安装版版本/代码已核对，但持续滚动、新消息、悬停三个场景尚未获得应用宝前后视觉对照，1.1维持未完成。候选包与ASAR验证不能替代应用宝至少60秒及真实点击验收，3.2维持未完成，不能标记整个修复已验收。

## Late callback regression

用户随后截图报错路径是本机`dist/gateway-stream-fix/win-unpacked/resources/app.asar/main.js:1094:15`，对应0.2.12桌宠did-finish-load回调中未检查销毁状态的`petWindow.webContents.send`。该路径属于本机隔离配置验证使用的包，不是应用宝C盘安装路径。

修复对桌宠、弹幕、主面板、个人数据和配置窗口的加载/就绪回调加原窗口与原WebContents检查，退出或替换引用时跳过；closed回调只清理本窗口对应的当前引用。未使用全局uncaughtException吞错。

- Node3项行为测试通过：直接执行生产createPetWindow函数，覆盖正常初始化、销毁窗口后迟到加载/就绪事件、WebContents单独销毁、窗口替换及退出；实际业务异常仍会抛出。
- 真实Mac Electron smoke通过：正常页面加载回调执行，连续8次在加载期间销毁窗口并模拟迟到事件，无非法IPC或显示操作。
- 语法、5项agent、29项harness及全部review检查通过。新增`npm run test:window-lifecycle`用于持续回归。
- 生成`dist/window-lifecycle-fix/GameBuddy-Setup-0.2.13.exe`，包内主进程、生命周期模块和网关兼容修复与源码一致。以0.2.13包内代码重跑此前全应用隔离配置验证，首次空白、合成配置回填及退出均通过，未捕获异常。未替换应用宝运行安装目录或用户配置。
- 0.2.13 EXE解压至临时目录扫描安装器与内层负载，未命中本机已知真实密钥，未包含.env、.secrets或llm-gateway.json。校验值随包保存在SHA256SUMS.txt。

本项处理用户截图中的窗口销毁错误，不代表前述应用宝闪烁现场验收已完成。
