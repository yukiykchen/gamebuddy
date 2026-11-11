## ADDED Requirements

### Requirement: In-game card rewards show auto-strike deltas
For an Ironclad card reward, the GameBuddy Mod SHALL display each recognizable candidate's auto-strike inclination delta in the user-marked row above the three cards in the game. The labels MUST NOT intercept card selection or alter gameplay state.

#### Scenario: Three candidate reward
- **WHEN** the reward screen offers three Ironclad cards and GameBuddy returns deltas for the current reward
- **THEN** each card shows its own signed auto-strike percentage-point change at the corresponding left, middle, or right position
- **AND** the three positions remain fixed at approximately 31.5%, 49.2%, and 67.8% of viewport width and 35% of viewport height during card hover

#### Scenario: Chinese game locale
- **WHEN** the game uses a Chinese locale
- **THEN** the labels use a font with Chinese glyphs and show readable Chinese text
- **AND** the labels occupy the marked row above the cards without covering card artwork

#### Scenario: Positive, zero, and negative deltas
- **WHEN** a candidate has a positive or zero auto-strike delta
- **THEN** its text uses green and an upward arrow inside an avatar-free dark framed box
- **WHEN** a candidate has a negative delta
- **THEN** its text uses red and a downward arrow inside the same framed box style
- **AND** every box ignores card selection input

#### Scenario: Reward refresh or close
- **WHEN** the reward changes or its screen closes
- **THEN** labels and prior values are removed
- **AND** a late result for the previous reward is ignored
