## 1. 叠卡轴节奏

- [x] 1.1 在 `agent/tests/ironclad-archetypes.test.js` 加上规格区间：起手第一张剑柄打击 +6 到 +10、第二张至少 +4 且更小、地狱狂徒至少 +18 且大于剑柄、第二张地狱狂徒不超过 +6、已有地狱狂徒时剑柄增量小于 22 且大于起手剑柄、随后劫掠至少 +8；燃烧契约、焚烧、铜墙铁壁的第二份至少达到第一份的 45%，第二张无惧疼痛、点燃和壁垒不超过第一张的 40%。运行 `node --test agent/tests/ironclad-archetypes.test.js` 确认新断言先失败。
- [x] 1.2 在 `agent/knowledge/ironclad-archetypes.js` 为 `auto_loop`、`exhaust_outlet`、`exhaust_event`、`strength_multihit`、`block_source` 使用饱和系数 0.45，并把含这些轴的 setup 与 synergy 乘以 `min(1, 累计权重 / 2)`。单卡槽保持 1.35。运行 `node --test agent/tests/ironclad-archetypes.test.js agent/tests/auto-strike.test.js` 直到通过。

## 2. 铜铁流派面板

- [x] 2.1 更新 `agent/tests/archetype-ui.test.js`，要求总览含铜铁面板标记、四套分数和「流派度≠胜率」，候选行显示 `42%` 与 `+3` 或 `18%` 与 `-2`，且不把前后分相加。运行 `node --test agent/tests/archetype-ui.test.js` 确认先失败。
- [x] 2.2 改 `src/archetype-ui.js` 与 `src/styles.css`：深铁底 `#241c16`、铜边 `#6e4b2a`、标题铜线 `#c47a3a`，条形 4px，领先填充 `#e0a15a`；候选格式为名称、`beforeScore` 百分比和带符号的 `deltaPoints`。不加入动画、图标或新字体。运行 `node --test agent/tests/archetype-ui.test.js` 直到通过。

## 3. 验证

- [x] 3.1 运行 `npm run test:syntax` 与 `node --test agent/tests/ironclad-archetypes.test.js agent/tests/auto-strike.test.js agent/tests/archetype-ui.test.js`，并打开选牌界面确认流派框为静态铜铁面板、候选同时显示当前百分比和变化。

## 4. 游戏内流派框

- [x] 4.1 把 `beforeScore` 放进 `draft_impact`，游戏内四行改为「名称 当前% 变化」，面板改成铜铁边。运行 `node --test agent/tests/auto-strike.test.js` 与 `dotnet run --project mod/GameBuddyBridge.Tests`，并把新的 `gamebuddy_bridge.dll` 装进本地游戏。
- [x] 4.2 游戏内只在牌列正中上方放一块铜铁面板。未指向卡牌时只显示当前分；指向某张牌时，同一行把增量写成 `42+14` 或 `18-2`，增量使用另一种颜色。运行 codec 测试并重新安装 DLL。
