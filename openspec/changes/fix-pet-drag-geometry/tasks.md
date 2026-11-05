# Tasks

- [x] 1. 抽出 `petWindowTargetSize(mode)` 作为尺寸单一来源，`resizePetWindow` 改为使用它。
- [x] 2. 新增 `movePetWindow(x, y)`，用 `setBounds` 同时下发坐标与当前模式尺寸，并对坐标做负零归一。
- [x] 3. `pet-drag-move` 改用 `movePetWindow`，不再调用只传坐标的 `setPosition`。
- [x] 4. 验证：模拟 400 帧来回拖拽，旧写法 570×522→836×736，新写法回到 570×520 且不累积；`node --check main.js`、`npm run test:syntax`、`npm run harness:validate-all`。
- [ ] 5. 实机：150% 缩放按住角色来回拖 30 秒，确认角色与面板不再互相拉开、面板不再向下伸长、无错误弹框。

## 验收实测（scaleFactor=1.5，400 帧来回拖拽）

| 写法 | 尺寸变化 | 抛错 |
| --- | --- | --- |
| 旧 `setPosition(Math.round(x), Math.round(y))` | 570×522 -> 836×736（+266/+214） | 0 |
| 新 `setBounds` 带模式尺寸 | 570×522 -> 570×520（Δ=0/-2，回到目标值） | 0 |

真实会话侧证据：567 帧纯 `setPosition` 拖拽中窗口从 570×521 涨到 1003×1036，相邻帧比值 1.0017；期间只有 1 次 `resize` 事件，证明增长来自移动本身而非尺寸切换。
