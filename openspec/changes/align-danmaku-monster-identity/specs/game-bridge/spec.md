## ADDED Requirements

### Requirement: Enemy snapshots expose structured next-action kinds
The live Bridge SHALL export each alive enemy's current next-action kinds from the game's intent objects, in addition to any raw intent text, move id and move name. Recognized kinds MUST include `attack`, `defend`, `heal`, `buff`, `debuff` and `status`. A snapshot that contains a heal intent MUST include `heal` even when a defend intent is also present.

#### Scenario: A healing move also grants block
- **WHEN** the current next move contains both a heal intent and a defend intent
- **THEN** the enemy snapshot includes `heal` in its structured kinds
- **AND** it also MAY include `defend`
- **AND** the raw intent text remains available for inspection

#### Scenario: Only an attack intent is present
- **WHEN** the current next move contains only attack intents
- **THEN** the enemy snapshot's structured kinds contain `attack`
- **AND** it MUST NOT contain `heal` or `defend`
