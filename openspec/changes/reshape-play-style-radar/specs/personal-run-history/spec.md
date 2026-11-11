## ADDED Requirements

### Requirement: Play style radar uses five recognizable habits
The personal data radar SHALL score the latest 50 runs of every character on exactly these axes: 深入, 精英, 体系, 投入, and 护身. Each shown value MUST be from 0 to 100. A missing input MUST stay unknown and MUST NOT be drawn as zero.

#### Scenario: Depth counts the whole run
- **WHEN** a lost or abandoned run ended on whole-run floor 25
- **THEN** that run contributes 50 to 深入
- **AND** a win contributes 100

#### Scenario: Elite is the share of elite fights
- **WHEN** the recent runs contain 1 elite combat and 3 other non-elite combats
- **THEN** 精英 is 25

#### Scenario: Guard ignores damage dealt to enemies
- **WHEN** the player receives 4 HP loss and 6 blocked damage
- **AND** an enemy receives 20 HP loss
- **THEN** 护身 is 60

#### Scenario: Investment combines leftover gold and rest choice
- **WHEN** all recorded gold was spent and half of rest actions were upgrades
- **THEN** 投入 is 75
