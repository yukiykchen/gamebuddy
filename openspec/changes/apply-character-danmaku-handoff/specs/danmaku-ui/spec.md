## ADDED Requirements

### Requirement: Danmaku uses the active character theme
The desktop companion SHALL style each danmaku using the character from the current Mod observation. It SHALL map ironclad to warrior, silent to bird, defect to robot, regent to star, and necrobinder to reaper. Ordinary danmaku SHALL display the matching character avatar.

#### Scenario: Known character emits a combat danmaku
- **WHEN** a fresh Ironclad observation emits an ordinary danmaku
- **THEN** the message uses the warrior frame and warrior avatar
- **AND** its text, source detail, scrolling and pointer behavior remain available

#### Scenario: Character is unknown
- **WHEN** the active character is missing or unrecognized
- **THEN** the message uses a neutral frame without a misleading character avatar

### Requirement: Card reward advice has no avatar
The desktop companion SHALL render a `card_reward` recommendation in the active character frame without an avatar.

#### Scenario: Card reward recommendation
- **WHEN** a card reward recommendation is emitted during a Silent run
- **THEN** its frame uses the bird theme and displays no avatar
- **AND** its recommendation text and hover detail remain available

#### Scenario: Other recommendation
- **WHEN** a non-card reward recommendation is emitted during a known character run
- **THEN** its frame uses that character theme and displays its avatar

### Requirement: Danmaku stays inside the marked upper playfield band
The desktop companion SHALL display all danmaku, including card reward advice, only inside the user-marked horizontal band from approximately 10.7% to 37.8% of viewport height. Character avatars and hover details SHALL remain inside that band.

#### Scenario: Several messages are queued
- **WHEN** ordinary and recommendation messages are emitted together
- **THEN** they use at most three vertical lanes inside the marked band
- **AND** no message appears over the game HUD or below the marked band
