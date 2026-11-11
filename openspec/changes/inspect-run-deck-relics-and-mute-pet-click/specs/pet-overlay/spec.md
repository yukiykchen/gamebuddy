## MODIFIED Requirements

### Requirement: Existing overlay chrome still works
Drag, context menu, contextual speech-bubble actions, the card suggestion card, and the encounter guide SHALL keep working in every pose. Ordinary left-clicks on the pet body or on a speech bubble without a contextual action MUST NOT open the Personal Data window. Reduced-motion settings MUST disable looping pose animations.

#### Scenario: Panels remain usable during advising
- **WHEN** the pet is in `advising` with a card suggestion or encounter guide open
- **THEN** the player can still close that panel and drag the pet

#### Scenario: Contextual speech action remains usable
- **WHEN** the speech bubble offers encounter-guide reopening or card expansion
- **THEN** clicking the speech bubble SHALL perform that contextual action
- **AND** MUST NOT open the Personal Data window

#### Scenario: Ordinary pet click is muted
- **WHEN** the player left-clicks the pet body without dragging it
- **THEN** the pet SHALL remain available
- **AND** the Personal Data window MUST NOT be opened, created, or focused

#### Scenario: Ordinary speech click is muted
- **WHEN** the player left-clicks the speech bubble while no contextual speech action is available
- **THEN** the Personal Data window MUST NOT be opened, created, or focused

#### Scenario: Context menu remains available
- **WHEN** the player right-clicks the pet
- **THEN** the pet context menu SHALL remain available
- **AND** selecting “个人数据” SHALL create or focus the Personal Data window

#### Scenario: Reduced motion
- **WHEN** the operating system requests reduced motion
- **THEN** looping pose animations MUST not run
