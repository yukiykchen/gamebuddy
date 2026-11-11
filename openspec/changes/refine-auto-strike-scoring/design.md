## 评分目标

`score ∈ [0,100]` = 自动打击「完整度 / 稳定度」，不是胜率。  
`deltaPoints = round(score(deck+card) - score(deck))`。

## 组成

```text
score = clamp(0.9 * (structure - antiPenalty - poisonPenalty) + 10 * setup)
```

- **structure**：启动 / 循环 / 输出 / 辅助 / 弹药 / 遗物 / 启动×循环协同（与首版同形，权重可调）
- **setup**：前若干抽摸到启动+循环的概率（牌组变厚自然稀释）
- **antiPenalty**：软反表，约 5–9 分/有效张（饱和）
- **poisonPenalty**：硬毒表，约 12–18 分/有效张（饱和，单张上限不过 20）

未进白/黑名单的牌：**不挂身份分**，只交 setup 稀释税。

## 白名单

| 槽位 | 牌 |
| --- | --- |
| 启动 | HELLRAISER |
| 循环 | POMMEL_STRIKE, PILLAGE |
| 输出 | PERFECTED_STRIKE |
| 弹药（有狂徒后低正） | STRIKE_IRONCLAD, TWIN_STRIKE, SETUP_STRIKE；ASHEN_STRIKE 更弱 |
| S 辅助 | OFFERING, BURNING_PACT |
| A 辅助 | SHRUG_IT_OFF, HEADBUTT, DRUM_OF_BATTLE, JUGGLING, BLOODLETTING |
| B 辅助 | BATTLE_TRANCE, STOKE, SECOND_WIND；RAGE 仅当 core>0；DARK_EMBRACE 仅当已有消耗辅助 |

移出：UNMOVABLE、BASH 额外拷贝。

## 黑名单

| 档 | 牌 | 量级 |
| --- | --- | --- |
| 硬毒 | PRIMAL_FORCE, FIEND_FIRE, DEMON_FORM, CORRUPTION, SEVERANCE | 12–18 |
| 硬毒下沿 | BRAND, HAVOC | 10–12 |
| 软反 | INFLAME, RUPTURE, WHIRLWIND, RAMPAGE, ANGER, BARRICADE, PACTS_END, INFERNAL_BLADE 等 | 5–9 |

## 原因标签（impact 可选字段）

按候选主因取一个：`过牌辅助` / `连打协同` / `弹药` / `循环` / `启动` / `输出` / `稀释` / `支线冲突` / `破坏循环`。  
无显著身份变化时标 `稀释` 或省略。

## 非目标

不改推荐排序；不做「绝对禁拿」徽章；不引入独立生存条。
