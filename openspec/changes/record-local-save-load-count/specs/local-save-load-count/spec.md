## Purpose

在 Mod 所在目录保存游戏确认的读档次数，供本机以后识别读档回退。记录不上传，也不进入桌面端协议。

## ADDED Requirements

### Requirement: Confirmed save loads are counted locally
GameBuddy SHALL increment a local save-load count when the game begins setting up an already saved run. A new run, a main-menu save preview, and a Bridge reconnect MUST NOT increment the count.

#### Scenario: Saved run setup
- **WHEN** the game begins setting up an already saved single-player or multiplayer run
- **THEN** the local count increases by one
- **AND** the record stores the UTC time of that observation

#### Scenario: New run or reconnect
- **WHEN** the player starts a new run, the main menu only reads the save, or the desktop Bridge reconnects
- **THEN** the local count stays unchanged

### Requirement: The count stays beside the Mod
The save-load record SHALL be stored in the same directory as the Mod assembly, in `save-loads.json`. The file MUST contain schema `gamebuddy.save-load.v1`, the total count, and one entry per counted load. It MUST NOT contain a seed, player name, account identifier, or file path.

#### Scenario: Repeated loads
- **WHEN** two confirmed save loads are recorded in order
- **THEN** the file count is 2
- **AND** the two entries keep distinct sequence numbers and timestamps

#### Scenario: Interrupted write
- **WHEN** a write is interrupted or the existing file is not valid JSON
- **THEN** a later successful record replaces it with a valid file
- **AND** a failed write does not stop the game or invent an extra count

### Requirement: Save-load records are not uploaded or displayed
GameBuddy MUST NOT send the save-load count or its entries through the Bridge protocol, copy them to the desktop app data directory, upload them, or show them in the main window or desktop pet.

#### Scenario: Live observation
- **WHEN** a save load has been recorded locally
- **THEN** Bridge state and event messages do not include the count
- **AND** the desktop app does not gain a save-load display or upload payload
