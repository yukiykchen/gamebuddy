# 数据依据

本体枚举 `MegaCrit.Sts2.Core.Entities.Cards.CardKeyword`：`None, Exhaust, Ethereal, Innate, Unplayable, Retain, Sly, Eternal`。codex 每条卡的 `keywords_key` 就是这份枚举名，`keywords` 是本地化文案。

| 判定方式 | 命中卡数 |
| --- | --- |
| `keywords_key` 含 `Eternal` | 7 |
| `keywords` 含中文「永恒」 | 7（与上一行集合完全相同） |
| `keywords` 含英文 `Eternal` | 0 |

7 张永恒牌：`GREED 贪婪`、`FOLLY 愚蠢`、`ENTHRALLED`、`FORBIDDEN_GRIMOIRE`、`ASCENDERS_BANE`、`CURSE_OF_THE_BELL`、`BAD_LUCK`。

# 为什么可以按 id 查 codex

真实快照（`ws://127.0.0.1:27182` 抓的一局铁甲战士）里 25 张牌的 `id` 全部能在 `cards.json` 命中，0 个查不到；已升级卡仍用基础 id（codex 用 `upgrade` 子对象表达升级），所以按 id 查不会漏。

商店路径用 `knowledge.deckCards`（`spire-codex.js` 的 `resolveItem` 是 `{...catalog, ...raw}`，`keywords_key` 会保留）；事件路径只拿得到 `state`，所以 `event-rules.js` 自己 require `cards.json` 建 id 集合，和该模块已有的 events/relics/potions 依赖一致。

# 未知情况怎么处理

- 牌组字段缺失或不是数组：`removableCardCount` 返回 null，事件打分保持原样，不改变既有行为。
- 卡 id 不在 codex 里（新卡）：按可删处理，避免误伤正常建议。
- `keywords_key` 缺失：同上。
