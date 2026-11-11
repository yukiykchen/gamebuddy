## 1. Project end-of-run builds

- [x] 1.1 修改 `review/service.js`，在 `buildDashboard().recentRuns` 中按原顺序投影每局 `finalState.deck` 与 `finalState.relics` 的最小显示字段，保留重复卡牌，并用 `null`/`[]` 区分旧记录缺失与已知空集合；运行 `node review/service.test.js` 验证 dashboard 输出。
- [x] 1.2 扩展 `review/service.test.js`，覆盖对象卡牌、升级标记、重复卡、字符串/对象遗物、空数组、缺失 `finalState` 以及不同 `runId` 不串数据；运行 `node review/service.test.js`。

## 2. Build the run-history accordion

- [x] 2.1 修改 `src/review-ui.js`，把每条历史记录渲染为带稳定 `runId`、`aria-expanded`、`aria-controls` 的可聚焦控件，并在选中行下渲染“终局牌组/终局遗物”、升级标记、真实副本数和缺失/已知空态；扩展 `review/ui.test.js` 并运行 `node review/ui.test.js` 验证 HTML 转义、关联关系和所有数据状态。
- [x] 2.2 修改 `src/review-renderer.js`，保存单一 `expandedRunId`，通过事件委托支持点击、Enter 和 Space 的展开/切换/收起，并在 `review:changed` 后仅当该 `runId` 仍存在时保留状态；新增 `review/renderer-interactions.test.js` 验证两局切换、重复激活收起、键盘等价行为和记录消失后的状态清理。
- [x] 2.3 修改 `src/styles.css`，为历史行 focus-visible/展开态和响应式卡牌、遗物详情网格添加样式，在 900px 以下保持可读，并遵守 `prefers-reduced-motion`；使用 Electron 打开 `src/review.html`，在 1280×860、1120×720 和窄屏布局检查滚动、焦点、长牌组与缺失空态。
- [x] 2.4 修改 `package.json` 的 `test:review`，纳入 `review/renderer-interactions.test.js`；运行 `npm run test:review` 确认服务、纯 UI、renderer 交互和窗口生命周期测试全部通过。

## 3. Mute ordinary pet clicks

- [x] 3.1 修改 `src/pet.js`，删除气泡无上下文动作和桌宠身体未拖动 pointer-up 对 `windowControls.openMain()` 的调用，同时保留攻略重开、建议卡展开、拖动、pointer capture 释放与右键 `showPetMenu()`；新增 `review/pet-interactions.test.js` 并运行该测试验证各分支。
- [x] 3.2 扩展 `review/window-lifecycle.test.js`，断言 `main.js` 中桌宠右键菜单和托盘菜单仍包含“个人数据”并调用 `showPersonalData()`，重复打开仍复用唯一窗口；运行 `node review/window-lifecycle.test.js`。
- [x] 3.3 将 `review/pet-interactions.test.js` 纳入 `package.json` 的 `test:review`，运行 `npm run test:review`，并在 Electron 中手动验证身体单击/气泡空白单击不打开窗口、气泡上下文动作仍工作、右键和托盘入口仍可打开个人数据。

## 4. Verify regressions

- [x] 4.1 运行 `npm run test:syntax`、`npm run test:review`、`npm run test:agent` 和 `npm run harness:validate-all`，修复本变更引入的语法、复盘、Agent 或 Replay 回归。
- [x] 4.2 使用至少两条带不同牌组/遗物的本地测试历史完成 Electron 端到端复核：逐条展开不串局、再次点击收起、键盘可操作、升级与重复卡正确、旧记录和空集合文案不同，并记录验证结果。

## 5. Build and deploy GameBuddyBridge

- [x] 5.1 在不修改 Mod 业务代码的前提下运行 `dotnet run --project mod/GameBuddyBridge.Tests`，确认 C# codec、事实队列和桥接辅助测试通过。
- [x] 5.2 确认《杀戮尖塔 2》已完全退出，然后运行 `dotnet build mod/GameBuddyBridge/GameBuddyBridge.csproj -c Release -p:Sts2Dir="/Users/houwenhao/Applications/steam/steamapps/common/Slay the Spire 2"`；验证 `mod/GameBuddyBridge/bin/Release/net9.0/gamebuddy_bridge.dll` 存在且构建命令成功。
- [x] 5.3 备份目标 DLL，创建 `/Users/houwenhao/Applications/steam/steamapps/common/Slay the Spire 2/mods/GameBuddyBridge/`（如缺失），再把 Release `gamebuddy_bridge.dll` 原子覆盖到该目录；使用 `shasum -a 256` 或 `cmp` 确认源产物与部署文件完全一致。
- [ ] 5.4 重新启动游戏并确认 GameBuddy Bridge Mod 正常加载、`ws://127.0.0.1:27182` 可连接且个人数据仍能接收本地状态；若加载失败，恢复 5.3 的备份并保留构建与 Mod 日志。

## 6. Deliver the change

- [x] 6.1 检查 `git diff`，只暂存本变更实际修改的 OpenSpec、复盘 UI/服务/测试和测试脚本文件，不暂存工作区既有修改；以符合 Conventional Commits 的信息创建本地提交，并用 `git status --short` 验证未混入无关文件。
