## ADDED Requirements

### Requirement: Ironclad card rewards expose auto-strike inclination delta
For an Ironclad card reward, GameBuddy SHALL calculate the 0–100 auto-strike inclination for the current deck and for the deck with each offered card added once. Each recognizable candidate SHALL expose the rounded difference as `archetypeImpact.deltaPoints`. This value MUST describe deck inclination, not win probability. The calculation SHALL use existing copy counts, card upgrades, deck size, and supported relics. It MUST NOT replace the legal card-reward decision or SKIP decision.

#### Scenario: Repeated Pommel Strike has diminishing impact
- **WHEN** an Ironclad deck has Hellraiser and one Pommel Strike
- **AND** a reward offers another Pommel Strike
- **THEN** the candidate's auto-strike delta is positive
- **AND** adding a third copy after the second yields a smaller delta

#### Scenario: Unsupported character
- **WHEN** the card reward belongs to a character other than Ironclad
- **THEN** no auto-strike inclination delta is exposed

#### Scenario: Unrelated card
- **WHEN** a reward card has no auto-strike role
- **THEN** its auto-strike inclination delta is zero or negative
