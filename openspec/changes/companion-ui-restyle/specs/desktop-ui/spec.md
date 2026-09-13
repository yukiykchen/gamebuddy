## Purpose

主窗口把本局状态和当前建议放在一眼能找到的位置，让玩家把它当搭子笔记而不是后台监控台。

## ADDED Requirements

### Requirement: Main window uses a run HUD instead of a dashboard sidebar
The main window SHALL put character, act/floor, HP, gold, deck size, relic count, this-run SL, and live/waiting status into a single top HUD. It MUST NOT use a persistent left sidebar whose primary job is stacking connection details, numbered navigation, a model advertisement, and run stats together.

#### Scenario: HUD after a live snapshot
- **WHEN** a live run snapshot is shown
- **THEN** the top HUD shows character, floor, HP, gold, and this-run SL without opening a nested sidebar section

### Requirement: Scene switching uses plain Chinese tabs
The main window SHALL switch combat, card reward, and route/rest views with unlabeled-as-sequence tabs named in Chinese. Those tabs MUST NOT be numbered `01` / `02` / `03`, and page titles MUST NOT use tracked all-caps English eyebrows as the primary heading.

#### Scenario: Player opens card reward
- **WHEN** the player selects the card-reward tab or a card reward is open
- **THEN** the window shows the card-reward view
- **AND** the tab label is Chinese such as `选牌`

### Requirement: Current advice is the main-window hero
When a rest, card-reward, or route recommendation is present, the main window SHALL place that recommendation title and reason in the primary content area before secondary stats. Empty or waiting copy MUST tell the player what to do next in the game, not advertise an engine name.

#### Scenario: Rest recommendation in the main window
- **WHEN** a rest-site recommendation is published
- **THEN** the main window hero states the heal or upgrade choice and the reason
- **AND** it does not hide that advice behind a generic engine card
