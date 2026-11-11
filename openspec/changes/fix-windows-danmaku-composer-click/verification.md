# Windows弹幕恢复验证（2026-10-19）

## 2026-10-20 透明底框与0.2.10

- 用户确认0.2.9可用，要求发送入口周围底框透明。原生发送窗口改为transparent:true、backgroundColor:#00000000、hasShadow:false；页面根背景透明。保留可聚焦、非穿透、owner和展开流程，按钮及输入卡片保留自身底色。
- Mac Electron分别运行源码和0.2.10包内资源检查通过：根背景透明，截图留白像素alpha为0，控件边界、输入、mock提交、关闭与重开均通过；截图已查看。以上仍不是原生Windows运行结果。
- 新包dist/danmaku-fix/GameBuddy-Setup-0.2.10.exe，SHA256为012089f0578daa35db45d7c91656433261b760d4ef0bdaf3584c30b849edb7f9；同目录SHA256SUMS-0.2.10.txt。包内main/preload/发送窗模块/CSS/渲染代码与冻结输入匹配，无根目录.env或.secrets。已在访达定位，旧版保留。
- 获用户明确授权后，测试分支codex/windows-composer-native-20261020已推送。当前界面改动提交da7900e，原生Windows工作流https://github.com/xxjmz/gamebuddy/actions/runs/39285403685 已触发，截至本次记录仍queued、没有运行步骤，不记录为通过。任务6.3保持待完成；用户的0.2.9确认不代替新版Windows自动验收。

## 2026-10-20 原生Windows验收待执行

- 用户明确要求原生Windows验证。新增`scripts/windows-composer-smoke.js`和`windows-native-input.ps1`：启动安装目录的实际EXE，通过本机回放触发生产场景和窗口显示；由Win32 SendInput点击/输入，调试协议仅观察状态与截图，发送接口为本机mock。
- Windows构建工作流在安装检查后强制运行该测试，收集截图、result.json、failure.txt和运行日志；原生输入失败会阻止后续产物上传/发布。源代码中没有增加测试入口或替换生产窗口。
- 目前仅完成JS语法、工作流YAML解析、OpenSpec strict、diff空白检查，以及macOS执行必须失败的环境守卫检查。**PowerShell与Win32执行均未验证；没有原生Windows通过日志。**任务6.1/6.2仅表示测试工具和工作流已添加，6.3保持未完成。
- 本机无已连接的原生Windows执行环境。GitHub Windows runner需先提交当前未提交修复至测试分支；项目配置禁止未获用户要求时提交，已请求该授权。未提交、未推送、未触发CI。0.2.9保持候选包身份。

## 2026-10-20 普通可交互发送窗口

- Windows发送窗由 `src/danmaku-composer-window.js` 创建：不透明、可聚焦、非穿透，飞行层为owner以维持层级。收起不再setFocusable(false)，普通弹幕到来不主动聚焦；指针处于发送窗时只让飞行层穿透，不循环抬升发送窗。Mac原有源码入口保留。
- `harness/danmaku-composer-smoke.js` 现在直接使用生产窗口工厂和展开/收起生命周期，并创建透明不可聚焦的owner模拟实际窗口关系。源码与包内ASAR的自动检查通过，验证面板/控件边界、输入/假发送、收起后可再次打开以及AI只在飞行层绘制。
- 使用系统鼠标入口实际操作源码窗口，以及0.2.9包内ASAR窗口：点击展开→关闭→再次展开→输入中文测试文本→点击发送。两次均收到NATIVE_VERIFIED，并在实际界面观察到“已发送”。发送由本地mock接口接收，未向其他玩家发送真实消息。这次未使用document.click代替这组系统鼠标验证。
- 本机平台为macOS，上述系统鼠标验证并不等于原生Windows输入验证；用户明确将在Windows测试。Windows专用窗口工厂与包内代码逐字节一致，构造标志及收起后焦点能力均核实。
- syntax、Agent5项、Harness29项、OpenSpec strict及diff空白检查通过。未修改AI生成/人格/去重、Mod或共享接口。
- 新包 `dist/danmaku-fix/GameBuddy-Setup-0.2.9.exe`；SHA256 `5badd96e2a6f7340dc5d8d3757a39be5e5768b38124cdc2d115145c011636efd`，校验文件 `SHA256SUMS-0.2.9.txt`。冻结输入构建，旧包保留，包内新窗口模块/主进程/CSS/渲染代码及Bridge均与预期字节匹配，无根目录.env或.secrets。

- 真实Electron复现composer页面点击后hidden=false，但面板x=-230.4/right=-12，完全在520像素宽窗口之外。修复独立窗口的panel定位后x=36/right=396/width=360；输入、发送和关闭控件均在520×280窗口内。
- `harness/danmaku-composer-smoke.js` 检查打开、获取场景、可输入、假提交成功、关闭缩回，以及overlay仍绘制AI但composer不重复绘制。源码与0.2.8包内ASAR两套检查均通过。截图 `.runtime/danmaku-composer/expanded.png` 已查看。
- 0.2.8安装包：`dist/danmaku-fix/GameBuddy-Setup-0.2.8.exe`。SHA256 `c7d3507f7be3065484308dcb9c9ba28cc6a4e8c9aa035bcd63927da543864c1a`，校验文件同目录。已有产物保留；本轮冻结构建输入，不改根package.json版本或覆盖其他安装包。
- AI生成修改与测试详见 expressive-danmaku-companion 的本轮记录。没有取得远端Windows现场AI原始失败日志，不将回放或少量试生成称为现场自动弹幕原因已彻底证明。
- 当前检查使用Mac上的Electron与Windows包内资源，未在用户远端Windows完成原生鼠标点击或安装。新包需要用户覆盖安装并重启GameBuddy，已有游戏连接可继续使用。
