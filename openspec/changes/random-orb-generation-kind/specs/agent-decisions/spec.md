## Purpose

选牌建议必须按卡面判断充能球种类。随机生成不是单一闪电球。

## ADDED Requirements

### Requirement: Random orb generation is not a single named type
When a deck card, relic, or reward candidate generates a random orb, the card-reward review MUST treat it as any orb type. The published reason MUST NOT describe that card as generating only Lightning (or only Frost/Dark/Plasma) just because other cards or relics generate that type.

#### Scenario: Trash to Treasure in the deck
- **WHEN** the deck includes Trash to Treasure (化废为宝) whose text randomly channels an orb
- **AND** the reward also offers a card that cares about distinct orb types, such as Coolant (冷却剂)
- **THEN** the LLM payload marks Trash to Treasure as random orb generation
- **AND** the published recommendation MUST NOT list Trash to Treasure among Lightning-only generators

### Requirement: Named orb text stays named
A card or relic whose own text names Lightning, Frost, Dark, or Plasma MUST still be treated as that type.

#### Scenario: Zap and Cracked Core
- **WHEN** the deck includes Zap (电击) and the player has Cracked Core (破损核心)
- **THEN** those items MAY be described as Lightning generation
- **AND** they MUST NOT be used to override a different card's random-orb text
