## MODIFIED Requirements

### Requirement: Ironclad card rewards expose auto-strike inclination delta
For an Ironclad card reward, GameBuddy SHALL calculate the 0–100 auto-strike inclination for the current deck and for the deck with each offered card added once. Each recognizable candidate SHALL expose the rounded difference as `archetypeImpact.deltaPoints`. This value MUST describe deck inclination toward Hellraiser auto-strike play, not win probability. The calculation SHALL use existing copy counts, card upgrades, deck size, supported relics, whitelist support/ammo roles, and blacklist soft-anti / hard-poison penalties. Unlisted recognizable cards MUST still affect inclination only through deck-thickness setup dilution (typically zero or a small negative delta). The calculation MUST NOT replace the legal card-reward decision or SKIP decision.

#### Scenario: Repeated Pommel Strike has diminishing impact
- **WHEN** an Ironclad deck has Hellraiser and one Pommel Strike
- **AND** a reward offers another Pommel Strike
- **THEN** the candidate's auto-strike delta is positive
- **AND** adding a third copy after the second yields a smaller delta

#### Scenario: Unsupported character
- **WHEN** the card reward belongs to a character other than Ironclad
- **THEN** no auto-strike inclination delta is exposed

#### Scenario: Unrelated card pays dilution tax
- **WHEN** a reward card has no auto-strike whitelist or blacklist role
- **THEN** its auto-strike inclination delta is zero or negative from deck thickness alone

#### Scenario: Hard-poison card is strongly negative
- **WHEN** an Ironclad deck already has Hellraiser and loop pieces
- **AND** a reward offers Primal Force, Fiend Fire, Demon Form, Corruption, or Severance
- **THEN** the candidate's auto-strike delta is substantially more negative than an unrelated filler card

#### Scenario: Shrug It Off is soft-positive support
- **WHEN** an Ironclad deck has Hellraiser and Pommel Strike
- **AND** a reward offers Shrug It Off
- **THEN** the candidate's auto-strike delta is positive
