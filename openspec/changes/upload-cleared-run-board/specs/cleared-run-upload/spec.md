## Purpose

把游戏判定为通关的对局摘要上传到现有共享服务，供以后按角色、进阶和模式做排行榜。未通关不上传。

## ADDED Requirements

### Requirement: Only a game-cleared run is uploaded

The desktop client SHALL upload a run only after the existing ending path records `cleared=true`. A run recorded as not cleared or abandoned MUST NOT be uploaded. The upload MUST NOT reinterpret hit points or the Architect encounter.

#### Scenario: Cleared run uploads

- **WHEN** the existing ending path records `cleared=true`
- **THEN** the client submits one clear record for that `runId`

#### Scenario: Loss or abandon does not upload

- **WHEN** the existing ending path records `cleared=false` or abandoned
- **THEN** no clear record is submitted

### Requirement: Clear record contains the leaderboard fields

Each uploaded clear record SHALL include the character, ascension, game mode, observed duration in seconds, whether an in-combat save load was detected, the final deck, the final relics, the selected events, and the `runId`. An in-combat save load SHALL be detected only from existing `combat.attempt_replaced` facts. A clear with that flag set MUST still be uploaded. The same `runId` MUST NOT create a second record.

#### Scenario: In-combat save load is flagged and still uploaded

- **WHEN** a cleared run contains at least one `combat.attempt_replaced` fact
- **THEN** the uploaded record marks in-combat save load as true
- **AND** the record is still stored

#### Scenario: Repeat submission

- **WHEN** a clear record for a `runId` is submitted again
- **THEN** the service keeps a single record for that `runId`

### Requirement: Leaderboard can be read back

The shared service SHALL return stored clear records filtered by character, ascension, and game mode, ordered by observed duration ascending.

#### Scenario: Filtered ranking

- **WHEN** a client requests clears for one character, ascension, and game mode
- **THEN** the service returns matching records ordered by shortest observed duration first
