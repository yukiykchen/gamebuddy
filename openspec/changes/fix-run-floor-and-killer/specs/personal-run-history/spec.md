## ADDED Requirements

### Requirement: Recent run floor is the whole-run floor

The personal history SHALL show the cumulative floor reached in the run. When a fact snapshot includes `totalFloor`, the summary MUST use the latest finite `totalFloor`. When older snapshots only include the act floor, the summary MUST add the highest positive floor of each act, and MUST exclude the one-floor transition snapshot that appears only because the next act has started.

#### Scenario: Death in a later act

- **WHEN** a run visits 17 rooms in act 1, 16 rooms in act 2, and dies on room 6 of act 3
- **AND** the stored snapshots record act floors 18, 17, and 6 because each completed act has one transition floor
- **THEN** the recent run shows floor 39

#### Scenario: Authoritative total floor wins

- **WHEN** the latest run snapshot includes `totalFloor` 40 and act floor 6
- **THEN** the recent run shows floor 40

### Requirement: A lost run names the encounter that ended it

When a run ends with `cleared` false for a reason other than `abandoned`, the history MUST show the enemies of the last combat that started, did not end, and was not replaced by `combat.attempt_replaced`. It MUST NOT keep an earlier boss after a later combat ends the run. A winning run MUST continue to show its last boss encounter. The loss label SHALL be “死于”; the win label SHALL remain “关底 BOSS”.

#### Scenario: Player dies to a normal enemy after beating a boss

- **WHEN** a boss combat against 碾碎爪 ends
- **AND** a later combat against 猫头鹰法官 starts and the run then ends without that combat ending
- **THEN** the recent run shows 猫头鹰法官
- **AND** the label is 死于

#### Scenario: Victory keeps the boss

- **WHEN** the run ends cleared after a boss combat against 建筑师
- **THEN** the recent run shows 建筑师
- **AND** the label is 关底 BOSS

#### Scenario: Abandoned run is not labeled as a death

- **WHEN** the run ends with reason `abandoned` during an unfinished combat
- **THEN** that unfinished combat is not shown as the cause of death
