# Why

桌宠拖拽走的是只传坐标的 `setPosition`。Windows 在缩放比例不是 100% 时会对「位置 + 尺寸」做一次 DPI 往返取整，只给位置就等于每帧把窗口撑大约 1 DIP。实测 `scaleFactor=1.5` 下 400 帧来回拖拽，窗口从 570×522 涨到 **836×736**；真实用户会话里 567 帧拖拽涨到 **1003×1036**，而 `resizePetWindow` 允许的最大只有 570×520。

撑大之后，右锚定的角色（`.pet-button { right: 0 }`）和左上锚定的攻略面板（`.encounter-guide { left: 0; top: 0; bottom: 10px }`）以不同速度右移、面板同时向下拉伸，就是用户看到的「角色和对话框一起往右跑、多文本往下延伸」。100% 缩放不会触发，因为不存在零头。

同一句 `setPosition` 还暴露了第二个崩溃：`Math.round(-0.5)` 返回 **`-0`**，而 `setPosition` 的整数参数转换器拒绝 `-0`，直接抛 `TypeError: Error processing argument at index 0, conversion failure from`（见 design 附图，`main.js:733:13`）。非 100% 缩放下指针坐标带 `.5` 或 1/3 小数，位移差落进 `[-0.5, 0)` 就会命中；实测 6227 帧里命中 1 帧。

# What Changes

- 拖拽移动改为始终连同尺寸一起下发（`setBounds`），尺寸取当前模式的目标值，与 `resizePetWindow` 共用同一份定义。
- 取整结果做负零归一，避免任何只传坐标的调用重蹈 `-0`。
- 顺带把已被撑大的窗口在下一次拖拽时拉回目标尺寸（实测 836×736 输入下回到 570×520）。

# Non-goals

- 不改桌宠的锚定方式与 CSS 布局。
- 不改攻略面板 / 选牌卡片的显示逻辑与内容。
- 不动 `resizePetWindow` 的右下角锚定策略。
- 不引入自动出牌、鼠标控制或任何写游戏状态的能力。
