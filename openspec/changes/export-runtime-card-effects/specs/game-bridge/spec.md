## Purpose

让桌面端通过只读协议获得游戏当前实际卡牌的效果、升级状态与多种资源费用，并在早期访问版本字段变化时安全降级。

## ADDED Requirements

### Requirement: Card snapshots expose runtime card facts
The game bridge MUST include the card ID, displayed name, upgraded state, runtime effect text when available, energy cost/X-energy flag, and star cost/X-star flag in card snapshots. The existing `cost` field MUST remain compatible with the numeric energy cost.

#### Scenario: Upgraded reward with special cost
- **WHEN** a visible upgraded reward card has runtime effect text and a star or X-based cost
- **THEN** `card.reward.opened` contains the upgraded flag, runtime text, and structured cost fields representing what the game exposes
- **AND** the legacy `cost` field still represents the numeric energy cost or `null` for X energy

### Requirement: Missing runtime metadata is explicit
When an optional runtime card member is unavailable, the bridge MUST emit a null/false value and an unavailable source instead of inventing an effect or cost.

#### Scenario: Game patch moves the description member
- **WHEN** the bridge cannot read a card's runtime description after a game update
- **THEN** the snapshot remains valid and identifies the description as unavailable
- **AND** state and reward publishing continue without mutating the game
