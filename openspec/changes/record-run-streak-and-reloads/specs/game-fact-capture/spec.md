## Purpose

把游戏确认的读档记到所属对局的本地事实上，使每局读档次数可以在结束后读取，包括读档发生时对局身份尚未就绪的情况。

## ADDED Requirements

### Requirement: Confirmed save load is stored on its run
GameBuddy SHALL record one reload fact on the run that the game is loading whenever the game confirms a saved-run load. A disconnect, a newly started run, or a menu preview of a save MUST NOT create that fact. Repeated loads of the same run MUST each add one fact and MUST keep the same run identity.

#### Scenario: Reload while the run is already known
- **WHEN** the game confirms a saved-run load and that run's identity is already active
- **THEN** the run gains one reload fact
- **AND** the run identity does not change

#### Scenario: Reload before the run identity is ready
- **WHEN** the game confirms a saved-run load before the run identity exists
- **AND** that same load then establishes the run identity
- **THEN** the reload fact is stored on that run
- **AND** it is not stored on a later, different run

#### Scenario: Reconnect is not a save load
- **WHEN** the desktop client reconnects without the game confirming a saved-run load
- **THEN** no reload fact is added

### Requirement: Finished run reports how many times it was reloaded
A finished run captured by this behavior SHALL include a non-negative reload count. The count MUST equal the number of confirmed saved-run loads recorded for that run, and MUST be 0 when none occurred. A finished run captured before this behavior SHALL omit the count instead of reporting 0.

#### Scenario: Run ends after two reloads
- **WHEN** a run records two confirmed saved-run loads and then ends
- **THEN** the finished run reports a reload count of 2

#### Scenario: Run ends without a reload
- **WHEN** a newly captured run ends without a confirmed saved-run load
- **THEN** the finished run reports a reload count of 0

#### Scenario: Older run has no reload field
- **WHEN** a finished run was captured before reload facts existed
- **THEN** its reload count is unknown
