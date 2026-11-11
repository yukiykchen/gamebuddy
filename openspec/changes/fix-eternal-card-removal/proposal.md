# Why

永恒（Eternal）牌无法被任何删牌效果移除，但删牌建议完全不看这一点。商店的 `removeTarget` 只按"值不值得删"打分，而诅咒加 90 分：贪婪 `GREED` 拿到 20+90=110、被夹到 96，于是**永远是第一名**——偏偏它就是删不掉的那类牌。结果是建议花 75 金买删牌服务，进去之后发现无牌可删。

事件侧同样漏判：`event-rules.js` 对 `remove_cards` 固定 `score += value * 14`，牌组里一张可删的都没有时，这个选项照样拿满加分。

标识必须用 `keywords_key`（与本体 `MegaCrit.Sts2.Core.Entities.Cards.CardKeyword` 枚举一一对齐，含 `Eternal`），不能用 `keywords`：后者是本地化文案，这份 codex 里是中文"永恒"，用英文串 `Eternal` 匹配命中 0 个，换语言客户端就会静默失效。

# What Changes

- `removeTarget` 先过滤掉永恒牌再打分，索引保持原始位置不变。
- 没有任何可删目标时，删牌服务不进入合法购物组合（此前只是 `raw = 0`，仍可能被选为方案首项，而 `recommendationFor` 只看 `itemType === 'service'` 就定 `REMOVE_CARD`）。
- 事件的 `remove_cards` 按牌组实际可删张数给分：为 0 时转为负分并写入 cons；小于 offered 数量时按可删数量给分；牌组未知时保持原行为。
- 服务项 cons 文案区分两种情形：「牌组里的牌都是永恒牌，删牌服务删不掉它们」与原来的「没有找到明确值得删除的牌」。

# Non-goals

- 不改 `remove_random_card` 的打分——随机移除是否会排除永恒牌未经验证，不猜。
- 不改 `gamebuddy.state.v1` 协议字段，不让 mod 额外导出关键词。
- 不改事件文案解析规则本身。
