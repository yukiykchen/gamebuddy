## Purpose

采集卡牌奖励时，同一张候选牌若同时存在未升级与已升级模型，导出已升级的那份。

## ADDED Requirements

### Requirement: Prefer the upgraded copy of a reward card
When collecting visible reward cards, if multiple models share the same card ID, the exported option MUST prefer the upgraded copy.

#### Scenario: Unupgraded template and upgraded offer
- **WHEN** the reward screen tree contains both an unupgraded and an upgraded model for the same ID
- **THEN** the published `card.reward.opened` entry for that ID has `upgraded` true
