## ADDED Requirements

### Requirement: Dismissed encounter advice can be reopened during the same combat
The pet overlay MUST offer a reopen control after the player dismisses an encounter guide while that combat is still active. Reopening MUST restore the cached guide without regenerating it or allowing combat state updates to reopen it automatically. The control and cached guide MUST be cleared when combat ends.

#### Scenario: Player dismisses and reopens a guide
- **WHEN** an encounter guide is visible and the player closes it during combat
- **THEN** the guide panel is hidden and a reopen control identifies the guide type
- **WHEN** the player activates that control before combat ends
- **THEN** the same guide is shown again without a new guide-generation request

#### Scenario: Combat updates after dismissal
- **WHEN** a guide has been dismissed and turn, HP, or intent state changes in the same combat
- **THEN** the guide does not reopen automatically
- **AND** the manual reopen control remains available

#### Scenario: Combat ends after dismissal
- **WHEN** the active combat ends while the guide is hidden
- **THEN** the cached guide and reopen control are removed
- **AND** the previous guide cannot be reopened in the next room
