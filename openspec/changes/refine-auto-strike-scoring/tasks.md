## 1. 计分

- [x] 1.1 更新 `agent/knowledge/auto-strike.js`：辅助白名单（S/A/B）、打击包弹药、移出 UNMOVABLE/BASH；保留 setup 稀释。
- [x] 1.2 加入软反 / 硬毒罚分表，并在 `autoStrikeImpact` 上附带可选 `reason` 标签。
- [x] 1.3 选牌 UI 用 title 或旁注展示 reason（不改主数字口径）。

## 2. 验证

- [x] 2.1 扩展 `agent/tests/auto-strike.test.js`：耸肩为正、硬毒大负、无关牌仅稀释、剑柄递减仍成立。
- [x] 2.2 运行相关测试与 `npm run test:syntax`（或项目既有 agent 测试命令）。
