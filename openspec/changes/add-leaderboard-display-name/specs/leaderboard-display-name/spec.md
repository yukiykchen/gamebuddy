## Purpose

让每条通关记录带上玩家自己填写的显示名。没有填写时使用固定的匿名名称，并保留一个不展示的本机玩家编号。

## ADDED Requirements

### Requirement: Player can save a display name locally

The personal data page SHALL let the player edit a display name and SHALL save it on that installation. The name MUST NOT be empty. When no name has been saved, and when the player saves a blank name, the stored name MUST be `匿名人士`. The page MUST NOT block the rest of the personal data page on this field.

#### Scenario: Name is saved

- **WHEN** the player enters a non-empty name and saves
- **THEN** later visits to the personal data page show that name

#### Scenario: Blank name returns to the default

- **WHEN** the player clears the name and saves
- **THEN** the stored display name is `匿名人士`

### Requirement: Clear upload carries the display name

A cleared-run upload SHALL include `displayName`. A missing or blank name MUST be uploaded as `匿名人士`. The upload SHALL also include a stable local `playerId` created for that installation. The `playerId` MUST NOT be shown in the personal data page.

#### Scenario: Named player

- **WHEN** a cleared run uploads and the saved display name is `阿达`
- **THEN** the stored record display name is `阿达`

#### Scenario: Anonymous player

- **WHEN** a cleared run uploads and no display name is saved
- **THEN** the stored record display name is `匿名人士`

### Requirement: Leaderboard returns the display name

A leaderboard response SHALL include each record's `displayName` and `playerId`.

#### Scenario: Ranking includes identity labels

- **WHEN** a client requests a leaderboard
- **THEN** each returned record includes its display name and player id
