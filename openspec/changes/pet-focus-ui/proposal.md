## Why

桌宠当前在建议出现时直接展示理由、优点、风险、策略对照、来源和置信度。信息虽然完整，但玩家在选牌或地图分叉的短决策窗口里首先需要的是明确答案，过多内容会推迟识别，也让卡片显得拥挤。

## What Changes

- 选牌、路线、火堆和事件建议默认只显示一句可执行结论。
- 卡片提供“展开理由”按钮，详细依据、风险、备选和来源按需显示。
- 展开与收起会同步调整透明桌宠窗口高度，减少对游戏画面的遮挡和鼠标拦截区域。
- 建议卡和怪物攻略统一为低密度暗色视觉：单一珊瑚色强调、16px 卡片圆角、清晰文字层级和轻量分隔线。
- 保留关闭、拖动、桌宠姿态、思考动画、攻略重新打开和所有现有 Agent 数据。

## Non-goals

- 不改变任何 Agent 的评分、候选合法性或 LLM 提示词。
- 不删除详细分析，只改变默认展示层级。
- 不增加前端依赖或替换桌宠角色素材。
- 不改主面板 UI。

## Design Read

Reading this as: an in-game decision overlay for players under time and attention pressure, with a compact dark utility language, leaning toward native CSS and restrained state transitions.

- Redesign mode: preserve the existing GameBuddy character, behavior, content, and dark game identity while replacing the recommendation hierarchy and card styling.
- `DESIGN_VARIANCE: 5`
- `MOTION_INTENSITY: 3`
- `VISUAL_DENSITY: 3`

## Impact

- 窗口尺寸与 IPC：`main.js`、`preload.js`
- 桌宠结构与交互：`src/pet.html`、`src/pet.js`
- 视觉系统：`src/pet.css`
- 说明文档：`README.md`、`docs/feature-status.md`、`docs/技术汇报.md`
