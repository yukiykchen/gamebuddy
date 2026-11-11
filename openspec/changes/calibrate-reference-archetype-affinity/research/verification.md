# 本次验证记录

2026-10-18；规则 affinity-2.0.0。

| 检查 | 实际结果 |
|---|---|
| npm run test:syntax | 通过；新知识模块和 UI 已加入脚本，末次改动另行 node --check |
| npm run test:agent | 4/4 通过 |
| npm run test:archetypes | 53/53 通过 |
| npm run test:danmaku | 64/64 通过 |
| npm run harness:validate-all | 28 项通过，包含 82 个 agent 场景 |
| npm run test:archetypes-renderer | 奖励/商店实际 Electron 页面 + preload/IPC 回放通过，截图已目视核对 |
| dotnet run --project mod/GameBuddyBridge.Tests -- openspec/changes/calibrate-reference-archetype-affinity/research/replay-v2.json | C# codec、保存加载、事实队列、身份与实际 JS 选牌回放通过 |
| OpenSpec validate --strict | 通过 |
| 校准与候选变化 | 23 局、1104 项前后差值；保留数量打击路线未覆盖记录 |
| git diff --check | 通过 |

完整 Harness 最初在一个既有静态断言处失败：它仍要求已被替换的 `OrderByDescending(card => card.IsUpgraded)` 字符串。对照 HEAD 确认旧语句不在 exporter 内，更新为当前真实选牌确认入口 `RewardSelectionTracker.Observe(` 后，28 项完整通过，没有改动游戏选择行为。

截图位于 `.runtime/affinity-v2/reward.png` 和 `shop.png`，是本地构造的 UI 回放，不是游戏截图。初次截图存在旧帧，加入字体与绘制等待后重新捕获，最终两张均已目视核对。

C# 测试只编译纯协议及辅助类。Godot overlay 已更新显示与前后快照消费，但本机没有运行中的 STS2 游戏环境，未宣称完成游戏内实机验收。参照也未经独立人类玩家评审。


## 2.1 实测反馈复核（2026-10-18）

- 规则版本affinity-2.1.0；六条教学参照仍各自满足需求并输出100。旧23局原标签保留，十五张候选四方向共1380项真实差值检查。标准起手完美打击13→27、灰烬13→22、剑柄13→25、耸肩13→17、凶恶13→14。
- `npm run test:archetypes`：55/55；`npm run test:danmaku`：70/70；语法与agent 4/4通过。
- `npm run harness:validate-all`：28项通过（含82个agent场景）。C#实际JS回放通过。
- `npm run test:archetypes-renderer`：奖励/商店页面通过，截图重新生成。
- `npm run test:danmaku-renderer`：真实Electron窗口成功分别显示完美打击核心提醒与火焰屏障建议，重复IPC仍只一条。已目视核对，截图`.runtime/affinity-v2/core-alert.png`。此次实际渲染发现并修复reconfirm函数无法序列化的错误；此前仅队列断言无法发现该问题。
- 奖励事件→战斗退出快照→另一张牌推荐的顺序已回放；关闭奖励、新战斗撤销、去重保留。main统一采用应用会话ID，Mod runId只用于来源核验。
- OpenSpec两个变更严格校验与git diff --check通过。
- 校准保留问题：855165b02eb912b5自动29/力量34，仍需独立样本复核大牌组密度；2a1745e083755609数量打击路线未覆盖。未修改标签追求全通过。
- 这轮评分和提醒修复位于桌面JS，未新改游戏Mod采集协议；运行旧Godot DLL仍可能显示旧版标题文案。本机未连接真实游戏，完整Mod编译/部署和实机验收不在本次验证结果之内。
