## ADDED Requirements

### Requirement: Reward-impact messages match the current offer
The Bridge SHALL include a stable offer signature in the card reward event. GameBuddy SHALL send signed integer auto-strike deltas back through the local connection with that signature. The Mod MUST apply a message only to the currently open reward with the same signature and matching candidate IDs.

#### Scenario: Delayed message after reroll
- **WHEN** a reward refreshes before the previous offer's impact message arrives
- **THEN** the previous message does not create or update any game label

#### Scenario: Unsupported candidate or character
- **WHEN** no reliable delta is available for a candidate or the character is not Ironclad
- **THEN** GameBuddy omits that candidate's label
