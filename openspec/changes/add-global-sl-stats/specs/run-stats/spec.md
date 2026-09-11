## Purpose

只统计当前这一局的读档继续（SL）次数：从起点开出为 0，之后每次不在起点进入对局则加一，并在主面板展示本局数字。

## ADDED Requirements

### Requirement: A run that begins at the start has zero this-run SL
When live (non-replay) observation first shows a run that is at that run's start, this-run SL MUST be 0. The start of a run MUST mean Act 1 and the current map node is the map start (or the visit list contains only that start). Ordinary HP or gold changes MUST NOT count.

#### Scenario: Fresh run from the start
- **WHEN** GameBuddy gets a live run after having no live run
- **AND** the snapshot is Act 1 at the map start
- **THEN** this-run SL is 0

### Requirement: Entering a run away from the start counts as one SL
When live observation goes from no live run to a run that is not at that run's start, GameBuddy SHALL add 1 to this-run SL. Repeated snapshots in the same live session MUST NOT add more. Reconnecting to the same in-progress run MUST count once per entry. A later entry that is at the start MUST reset this-run SL to 0.

#### Scenario: Continue mid-run
- **WHEN** there is no live run
- **AND** the next live snapshot is past the map start
- **THEN** this-run SL increases by 1

#### Scenario: Same live session does not keep counting
- **WHEN** a mid-run entry has already been counted
- **AND** further live snapshots keep arriving without the run disappearing
- **THEN** this-run SL does not increase again

#### Scenario: New run after abandon
- **WHEN** the next live snapshot is Act 1 at the map start
- **THEN** this-run SL becomes 0

### Requirement: This-run count persists across GameBuddy restarts
This-run SL MUST survive GameBuddy restarts until a new run starts from the start. Replay and demo sources MUST NOT write the persisted this-run file.

#### Scenario: Restart keeps this-run count
- **WHEN** this-run SL is 2 and the player quits GameBuddy then opens it again without starting a new run from the start
- **THEN** the main panel still shows this-run SL 2

#### Scenario: Replay does not persist
- **WHEN** a Replay or demo fixture enters a mid-run snapshot
- **THEN** the on-screen demo number MAY change for the session
- **AND** the stored this-run SL file MUST stay unchanged

### Requirement: Main panel shows this-run SL
The main window sidebar SHALL show this-run SL as a visible number while GameBuddy is running. It MUST NOT show a lifetime or career SL total.

#### Scenario: Sidebar after an SL
- **WHEN** a live SL is counted
- **THEN** the sidebar this-run number increases without requiring a manual refresh
