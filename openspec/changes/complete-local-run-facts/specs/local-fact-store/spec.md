## Purpose

定义完整对局事实在玩家本机的可靠保存、重打覆盖、完整度与恢复契约，使功能可以从同一份可信输入重新计算而不依赖云端。

## ADDED Requirements

### Requirement: Confirmed facts are stored locally
GameBuddy SHALL persist validated facts under Electron `userData/facts/v1`, grouped by `runId`, with versioned manifests, events, snapshots and coverage. Full facts MUST NOT be uploaded or written to the development decision-log directory.

#### Scenario: Facts are received
- **WHEN** a valid fact event is accepted
- **THEN** it is durably stored before being acknowledged
- **AND** a later application restart can read it

#### Scenario: No telemetry consent
- **WHEN** the user has not enabled any telemetry
- **THEN** local fact capture still operates
- **AND** no full fact leaves the device

### Requirement: Event identity and gaps are preserved
Every fact SHALL have an event ID, source session and strictly increasing source sequence. Retransmission of one event MUST store it once, while two legitimate identical actions with different IDs MUST both be retained. Missing sequence ranges and rejected events MUST be represented in coverage.

#### Scenario: Duplicate retransmission
- **WHEN** the same event ID is delivered more than once
- **THEN** the stored effective facts contain it once

#### Scenario: Identical consecutive plays
- **WHEN** two identical cards are legitimately played in succession
- **THEN** both event IDs remain present

### Requirement: Superseded combat attempts are removed
The local effective record SHALL contain only the latest attempt for a `combatId`. On a confirmed save load during combat, the store MUST atomically supersede the prior attempt and exclude all of its actions and aggregates from exports and consumers. The separate local save-load counter SHALL remain cumulative.

#### Scenario: Replacement attempt is committed
- **WHEN** a replacement attempt begins after a save load
- **THEN** reads and exports no longer return the prior attempt facts
- **AND** the same `combatId` identifies the replacement

#### Scenario: Crash during replacement
- **WHEN** the application crashes while replacing an attempt
- **THEN** recovery yields either the complete prior attempt or the complete replacement draft
- **AND** never a mixture of both attempts

### Requirement: Coverage is tracked per fact family
GameBuddy SHALL store support state, capture intervals, gaps, observation method and unknown reasons separately for lifecycle, decisions, build changes and each combat event family. Unsupported, not observed and not applicable MUST remain distinct.

#### Scenario: Card-play hook fails
- **WHEN** card-play capture is unavailable for one combat
- **THEN** coverage marks card plays unavailable for that combat
- **AND** personal data does not treat the combat as having zero played cards

### Requirement: Storage failures do not affect gameplay
Writes, recovery and retention MUST NOT block or mutate the game. Uncommitted facts MUST NOT be acknowledged as durable. Corrupt trailing data, disk-full errors and queue overflow SHALL produce a local health record and explicit missing range.

#### Scenario: Disk becomes full
- **WHEN** a fact cannot be persisted
- **THEN** the game continues
- **AND** the client does not acknowledge that fact as durably stored
- **AND** capture health reports the failure

### Requirement: Replay preserves fact semantics
Recording and replay SHALL preserve original event IDs, source ordering, attempt replacement and coverage. Replay imports MUST be labelled as replay data and MUST NOT enter normal personal-run history.

#### Scenario: Replay is imported twice
- **WHEN** the same replay is imported repeatedly
- **THEN** it produces the same effective fact summary without duplicate actions
