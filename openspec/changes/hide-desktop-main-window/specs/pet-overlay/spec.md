## MODIFIED Requirements

### Requirement: Existing overlay chrome still works
Drag, context menu, speech bubbles, the card suggestion card, and the encounter guide SHALL keep working in every pose. Clicking the pet MUST NOT create or display a main window. Reduced-motion settings MUST disable looping pose animations.

#### Scenario: Panels remain usable during advising
- **WHEN** the pet is in `advising` with a card suggestion or encounter guide open
- **THEN** the player can still close that panel and drag or click the pet
- **AND** clicking the pet does not display a main window

#### Scenario: Context menu remains usable without a main window
- **WHEN** the player opens the pet context menu
- **THEN** controls unrelated to the main window remain usable
- **AND** the menu does not offer an action that opens the disabled main window

#### Scenario: Reduced motion
- **WHEN** the operating system requests reduced motion
- **THEN** looping pose animations MUST not run
