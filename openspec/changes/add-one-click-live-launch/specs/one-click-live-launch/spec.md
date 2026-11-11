## ADDED Requirements

### Requirement: One-click live launch

The project SHALL provide a Windows command that validates the real-game prerequisites, builds and installs the read-only Mod before starting the game, starts GameBuddy desktop, and then starts the selected Slay the Spire 2 executable.

#### Scenario: Default live launch succeeds through the preflight checks

- **WHEN** a Windows user runs `npm run live:win` with a valid STS2 installation, available bridge port, stopped game process, Node/npm, and Mod build prerequisites
- **THEN** the launcher SHALL build and copy `gamebuddy_bridge.dll` and `GameBuddyBridge.json`, start GameBuddy in a separate window, and launch the game executable in that order

#### Scenario: A user supplies a non-default Steam library path

- **WHEN** a Windows user runs `npm run live:win -- -Sts2Dir <path>`
- **THEN** the launcher SHALL use that directory for game assembly validation, Mod installation, and game launch

### Requirement: Safe preflight failures

The live launcher SHALL stop before building or starting new processes when game state would make a Mod update unsafe or invalid.

#### Scenario: Game is already running

- **WHEN** a process whose executable is inside the selected STS2 directory is running
- **THEN** the launcher SHALL stop and explain that the user must fully exit the game because Mods load only at game startup

#### Scenario: Bridge port is occupied

- **WHEN** TCP port `27182` is already listening
- **THEN** the launcher SHALL stop and explain that the user must stop Replay Bridge or another listener, without terminating that process

#### Scenario: First-time Mod enablement

- **WHEN** the launcher starts the game after a successful Mod copy
- **THEN** it SHALL remind the user to confirm `GameBuddy Bridge` in the game's Modding UI and SHALL NOT attempt to change the game's Mod enablement state
