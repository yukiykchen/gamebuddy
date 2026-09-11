## 1. 姿态状态机

- [x] 1.1 在 `src/pet.js` 集中保存连接状态、LLM thinking 和建议/攻略可见性，按 advising > thinking > waiting > watching 写入 `#pet-stage` 的 `data-pose`，建议卡出现后不再停留思考态，并确认 `say()` 不再用 class 覆盖身体姿态
- [x] 1.2 确认未 live 时为 waiting、live 旁观（含战斗无建议）为 watching，不存在 caution / waving / running 等多余姿态名

## 2. 四种对局形象

- [x] 2.1 按需微调 `src/pet.html` 肢体节点，使四种姿势能改变轮廓，并确认仍是同一只角色
- [x] 2.2 在 `src/pet.css` 用 `[data-pose='...']` 实现 waiting 原版漂浮、watching 侧身旁观、thinking 前倾+思考云、advising 伸爪指向；静态轮廓互不相同，循环动画只做微调，`prefers-reduced-motion` 会关掉循环但保留轮廓

## 3. 验证

- [x] 3.1 运行 `npm run test:syntax` 并通过
- [x] 3.2 用 `npm run demo` 核对：未同步→waiting，LIVE 且无建议→watching，LLM 思考→thinking，卡牌卡或攻略→advising；拖动、点击打开主面板、关闭建议卡在所有姿态下仍可用
