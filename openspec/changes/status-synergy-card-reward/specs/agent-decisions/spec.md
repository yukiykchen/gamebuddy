## ADDED Requirements

### Requirement: Status-generation card rewards use status synergy
When a card-reward candidate triggers on creating status cards (wounds, burns, or other status cards), GameBuddy SHALL score and explain it using the player's status-generating cards. It MUST NOT treat that candidate as an orb-package card solely because its payoff generates orbs, and MUST NOT reject it solely for lacking Focus or few orb cards.

#### Scenario: Wound and burn package takes Trash to Treasure
- **WHEN** the reward offers Trash to Treasure (化废为宝)
- **AND** the deck contains cards that add Wounds or Burns
- **THEN** the rules-ranked candidates list Trash to Treasure above SKIP
- **AND** the candidate rationale cites the status-generating cards, not a missing orb package

#### Scenario: No status generation still allows skip
- **WHEN** the same card is offered
- **AND** the deck has no cards that create status cards
- **THEN** GameBuddy MAY still recommend SKIP
