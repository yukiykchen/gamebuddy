# Windows 发送弹幕点击验收

用户已确认 0.2.9 发送功能可用；0.2.10 将按钮和输入卡片周围的底框改为透明。新版原生 Windows 自动检查已触发，尚在排队，没有通过日志。Mac 运行源码、Mac 运行包内 ASAR、应用宝转译运行 EXE 都不能替代原生 Windows 验收。

## Automated check

在可交互的 Windows 桌面中，先安装待验收的安装包，然后在本项目已执行 `npm ci --include=dev` 的目录中运行：

```powershell
node scripts/windows-composer-smoke.js 'C:\实际安装目录\GameBuddy.exe'
```

测试会操作鼠标和键盘，运行期间不要切换应用或锁屏。不要提权；测试脚本和应用须处于相同权限。脚本检查输入目标归属测试进程，指向其他应用时立即失败。

该检查启动实际安装的 EXE，使用临时用户数据目录、本机战斗回放和本机共享弹幕接口。只读调试接口用于观察控件位置、焦点、文本、状态及截图；实际点击和键盘输入使用 Win32 `SendInput`，不使用 DOM click、设置 input.value 或 CDP Input 代替系统输入。

依次检查：首次点击展开、输入焦点、关闭、再次展开、系统键盘输入、点击发送、生产 IPC 提交正确场景和文本、发送成功后重新打开。测试消息只发往本机 mock，不发往线上共享服务。成功输出 PASS，截图与 result.json 保存在 `windows-composer-artifacts/`；失败退出码非零并保存可用截图、failure.txt 与 runtime.log。临时目录和进程在测试后清理。

`.github/workflows/build-windows.yml` 已在静默安装和启动检查之后接入此项；失败阻止后续安装包发布。CI 桌面不支持原生输入也按失败处理，不允许跳过并报通过。

## Acceptance boundary

自动检查通过只能证明对应 Windows 环境里安装版的完整发送入口可交互。仍需在原生 Windows 游戏现场检查无边框全屏/实际使用的显示模式、缩放比例及中文输入法。未运行上述检查时不得称为 Windows 已通过。

系统输入实现参考：[Microsoft SendInput 文档](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput)。
