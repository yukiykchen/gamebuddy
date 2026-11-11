## 1. 意图分类

- [x] 1.1 把敌人 Intent 按单条类型拆成 `attack/defend/heal/buff/debuff/status`，`HealIntent | DefendIntent` 的可见类别必须是回血，并用 Node 测试验证
- [x] 1.2 旧快照没有 `intentKinds` 时从原始类型名拆分，结果与新字段一致，并用 fixture 测试验证

## 2. 弹幕正文与悬停

- [x] 2.1 入场每个独特怪物名一条弹幕，同名合并，悬停短简介且不含“档案/标签/资料”，并用 Node 测试覆盖小啃兽
- [x] 2.2 有 Codex 招式则出 `{name} · {move}：{effect}`，悬停补其余循环/招式且不复述正文；否则出类别句；同一招不重复；未知招式不猜测，并用 Node 测试验证
- [x] 2.3 入场正文不再使用“会使用 A、B、C”或 UI 可见生命/格挡/回合句，并用现有弹幕测试夹具回归

## 3. 氛围与空闲

- [x] 3.1 名字或招式事实后检索最多 2 条 B 站弹幕，query 带怪物名或类别；失败 350ms 内回退且不挡事实，运行 `npm run test:danmaku-retrieval`
- [x] 3.2 事实后异步追加职业兼容的本地短句与最多 2 条 LLM 氛围，战士不得出机宝口吻，并用 mock 测试验证
- [x] 3.3 同一战斗约 20 秒没有新事实时只补一波 LLM 氛围，不得编造新招式，第二次空闲不再发，并用 Node 测试验证

## 4. Mod 与验收

- [x] 4.1 敌人快照新增 `intentKinds`，回血伴随防御也必须导出 `heal`，并更新协议/Mod 说明
- [x] 4.2 在 Mac 上编译 GameBuddyBridge 并复制到应用宝游戏目录
- [x] 4.3 运行 `npm run test:danmaku`、`npm run test:syntax` 与 `npm run harness:validate-all`，确认建议与桌宠交互不受影响
