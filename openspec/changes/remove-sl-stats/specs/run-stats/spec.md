## ADDED Requirements

### Requirement: Save/load statistics are not collected
GameBuddy SHALL NOT infer save/load entries from live connection boundaries, persist a save/load count, or expose such a count to the main window and desktop pet.

#### Scenario: GameBuddy receives live observations
- **WHEN** a game state or Bridge reconnect is observed
- **THEN** GameBuddy does not infer, persist, broadcast, or display an SL count
