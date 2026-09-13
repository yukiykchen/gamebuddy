## 1. 检测与落盘

- [x] 1.1 新增纯函数模块（如 `harness/sl-stats.js`）：无 live run → 有 live run 为一次进入；在 Act 1 且 `map.current === map.start`（或 visited 只有 start）则本局 SL = 0；否则本局 +1；同一 live 会话不重复加。用 `node harness/validate-sl-stats.js` 覆盖开局、中途进入、会话内多帧、再开新局
- [x] 1.2 主进程只对 live 调用该模块并写入 `userData/sl-stats.json`（只含 `thisRun`，不含生涯）。replay/demo 只更新内存。测试断言 replay 不改落盘文件，重启后本局次数仍在

## 2. 主面板与桌宠

- [x] 2.1 侧边栏「本局概览」只增加本局 SL，经 preload 订阅广播；`npm run test:syntax` 通过，数字在计数广播后更新
- [x] 2.2 桌宠订阅同一广播：按增量后本局次数分档说中文（1–2 温和、3–9 调侃、10+ 加重），不改 `data-pose`；thinking/advising 时排队，回到 watching/waiting 再说
- [x] 2.3 桌宠状态栏常驻显示本局 SL 数字（含 0）；主面板「本局概览」用两列布局，避免第四项被挤出可视区域

## 3. 验证

- [x] 3.1 运行 `npm run test:syntax` 与 `npm run harness:validate-all` 并通过
- [x] 3.2 用 Replay 先给一份 Act 1 起点快照（本局 0），再模拟断开后从中途进入（本局 +1）；replay 模式不改落盘文件；桌宠气泡分档正确且姿态仍是四态之一
