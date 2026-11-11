## 1. 对局读档事实

- [ ] 1.1 确认读档在对局身份已存在时写入 `run.reloaded`，身份未就绪时暂存，并只在随后建立的继续对局上补发一次；新开局不领取这笔暂存。用 `dotnet run --project mod/GameBuddyBridge.Tests/GameBuddyBridge.Tests.csproj -c Release` 验证两次读档、补发不串局，以及断线不产生读档事实。
- [ ] 1.2 结束事实带上本局 `reloadCount`，0 次也写出。同一测试命令验证两次读档结束后次数为 2，没有读档时为 0。

## 2. 个人数据摘要

- [ ] 2.1 摘要写入 `playtimeSeconds`：各段从开始或继续到该段最后一条事实的秒数相加，两次会话之间的关机时间不计；没有会话起点时为未知。`npm run test:review` 中的事实摘要用例验证 10 分钟加 5 分钟等于 15 分钟。
- [ ] 2.2 摘要在结束事实带有 `reloadCount` 时采用该数字；没有该字段时，有 `run.reloaded` 用其条数，否则保持未知。同一命令验证 0、2 和旧记录未知三种结果。
- [ ] 2.3 按结束时间重算每局 `winStreak` 并写入历史：连续通关累加，未通关和放弃为 0。仪表盘给出全历史当前连胜，以及最近 50 局中已知读档次数的平均值，没有已知次数时为未知。`npm run test:review` 验证三连胜、最新一局失败后当前连胜为 0、1 次和 3 次的平均为 2。

## 3. 个人数据展示

- [ ] 3.1 页头显示当前连胜和平均读档，每局显示进阶、用时和读档次数，未知显示「未知」。终局牌组展开保持可读。`npm run test:review` 的界面用例验证这些文字；`npm run test:review-renderer` 用真实 Electron 页面核对可见内容。

## 4. 安装与回归

- [ ] 4.1 用本机 STS2 程序集执行 `dotnet build mod/GameBuddyBridge/GameBuddyBridge.csproj -c Release -p:Sts2Dir="/Users/houwenhao/Applications/steam/steamapps/common/Slay the Spire 2"`，备份并替换游戏 `mods/GameBuddyBridge/gamebuddy_bridge.dll`。构建成功且新 DLL 含读档事实字段后，本项完成；游戏需完全退出再启动才会加载。
- [ ] 4.2 运行 `npm run test:review` 与 `npm run test:syntax`，确认读档、用时、连胜和展示回归通过。
