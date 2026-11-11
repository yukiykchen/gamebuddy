## Purpose

定义个人数据如何从完整本地事实生成一局一行、只有通关与未通关两种结果的可信摘要，并排除读档产生的重复尝试。

## ADDED Requirements

### Requirement: One real run produces one history row
Personal data SHALL display at most one recent-run row for each `runId`. Save loads, reconnects, scene transitions, process restarts and replacement combat attempts MUST NOT create additional rows.

#### Scenario: One run with multiple reloads
- **WHEN** one run contains ten save loads and later ends
- **THEN** recent history contains one row for that `runId`

#### Scenario: Active run
- **WHEN** a run has not reached a confirmed ending
- **THEN** it remains a recoverable draft and does not appear in recent completed runs

### Requirement: Recent runs have exactly two result labels
Every completed recent-run row SHALL display exactly one of `通关` or `未通关`. The UI MUST NOT display `中断`, `放弃` or `失败` as separate recent-run result labels.

#### Scenario: Architect completion
- **WHEN** a v0.107.1 run reaches the Architect ending
- **THEN** the row displays `通关`

#### Scenario: Confirmed ended run without completion
- **WHEN** a run ends without reaching its completion condition
- **THEN** the row displays `未通关`

### Requirement: Personal metrics use only effective facts
Played-card, reward, route, shop, rest, build and combat metrics SHALL use only facts from the current effective timeline and the latest attempt of each combat. Superseded attempts, replay data, unsupported intervals and unknown outcomes MUST NOT enter known numerators or denominators.

#### Scenario: Reload after a high-damage turn
- **WHEN** a superseded attempt contains a higher turn damage than the replacement attempt
- **THEN** the run's maximum turn damage uses the replacement attempt only

#### Scenario: Missing card-play coverage
- **WHEN** card-play capture is incomplete
- **THEN** the run reports that metric unknown
- **AND** it does not report zero attack plays

### Requirement: Boss and run summaries use actual history
The recent-run row SHALL derive reached floor, actually fought bosses, final effective deck, relics, potions and maximum turn damage from effective facts. A planned next boss MUST NOT be displayed as an actually fought boss.

#### Scenario: Several bosses are fought
- **WHEN** a run fights multiple boss encounters
- **THEN** the local run summary retains the ordered boss history
- **AND** the recent row's boss field follows the configured final-encounter presentation without discarding the history

### Requirement: Unreliable legacy summaries are not silently merged
Legacy `review-history.v1` rows without stable identity and coverage MUST NOT be merged into new fact-backed history. They SHALL remain in a local backup or legacy export, while the fact-backed recent list starts only from trustworthy records.

#### Scenario: Upgrade from legacy history
- **WHEN** the application first enables fact-backed history
- **THEN** existing legacy data is preserved locally
- **AND** false interrupted fragments do not appear in the new recent-run list
