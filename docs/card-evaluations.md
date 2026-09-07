# 卡牌评价知识库

`agent/knowledge/card-evaluations.json` 是奖励选牌 Agent 的单卡基础先验，`docs/card-evaluations.csv` 是便于筛选和人工复核的总表。

## 数据来源

- [Spire Codex](https://spire-codex.com/tier-list)：卡牌中文数据、社区对局数量、胜率和经过贝叶斯收缩的 Codex Score。
- [STS2 Tier Lists](https://sts2tierlists.com/)：高手 Tier List 的作者、档位、适用补丁和原视频时间点。

项目不复制第三方攻略正文。高手意见只保留排名事实和原始链接，具体优缺点由 GameBuddy 根据卡牌机制和实时局势重新生成。

本轮还核对了以下公开来源，但没有批量复制其内容：

- [GamerStation](https://gamerstation.gg/tools/sts2/tier-list)：基于奖励界面采集的社区拿取率；当前没有稳定的公开导出接口。
- [Mobalytics](https://mobalytics.gg/slay-the-spire-2/tier-lists/cards)：编辑型全角色 Tier List，适合交叉检查争议卡，不适合作为自动同步的数据源。
- [PC Gamer Silent 攻略](https://www.pcgamer.com/games/roguelike/slay-the-spire-2-best-silent-cards-build-ascension-10/)：高进阶角色攻略，包含具体流派的拿牌条件，但目前不是全卡覆盖。
- [Reddit `r/slaythespire`](https://www.reddit.com/r/slaythespire/)：适合收集版本争议、Boss 克制和上下文反例，不适合直接汇总为固定分数。

## 字段含义

- `prior.score`：单卡基础先验，不能直接当作当前奖励的最终评分。
- `prior.tier`：按 S/A/B/C/D/F 展示基础先验。
- `prior.confidence`：当前证据覆盖度，不代表建议必然正确。
- `community`：Spire Codex 社区统计快照。
- `expertConsensus`：多个高手 Tier 的归一化信号和证据链接。
- `mechanicTags`：伤害、格挡、抽牌、回能、AOE、成长、控制等机械标签。

当社区数据和高手评价都存在时，基础先验暂按 `70% × Codex Score + 30% × 高手 Tier 归一化分` 计算。这个权重只是保守初值，后续应通过历史选牌回测校准。

## 更新方式

```powershell
npm run knowledge:cards
```

每次更新都会记录 `capturedAt`。由于游戏处于 Early Access，卡牌平衡调整后应重新生成，并重点检查专家评价中的 `patches` 是否过期。
