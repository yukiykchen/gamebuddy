## ADDED Requirements

### Requirement: Danmaku is rendered in a distinct game-display overlay
The application SHALL render battle danmaku in a dedicated transparent overlay window rather than the pet window. The overlay MUST cover the primary display bounds, be frameless, remain above normal game windows, avoid focus, and ignore mouse events.

#### Scenario: A queued message is sent to the overlay
- **WHEN** the main process releases a current danmaku message
- **THEN** it sends `bridge-danmaku` only to the dedicated overlay window
- **AND** the pet window remains responsible for pet and recommendation UI

#### Scenario: Overlay is non-interactive
- **WHEN** the overlay is visible over the game display
- **THEN** mouse input passes through to the game
- **AND** the overlay does not become the focused window

### Requirement: Danmaku overlay clears outside a live game scene
The application SHALL clear and hide the danmaku overlay when the Mod Bridge disconnects, the observation becomes stale, or the game scene exits.

#### Scenario: Bridge disconnect clears the overlay
- **WHEN** the Mod Bridge connection closes or errors
- **THEN** the main process sends `bridge-danmaku-clear` to the overlay
- **AND** hides the overlay without closing the pet window

#### Scenario: New combat invalidates old messages
- **WHEN** the danmaku generation changes for a new scene
- **THEN** the overlay removes messages from older generations before rendering current messages
