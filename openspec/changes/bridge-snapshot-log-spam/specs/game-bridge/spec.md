## Purpose

让只读 Bridge 导出的卡面文本与玩家在界面看到的数字一致，并把周期快照的开销降到不会污染本体日志和桌面的量级。

## ADDED Requirements

### Requirement: Card effect text is resolved before export
The exported card description MUST be the text the player sees in the game, with every selector resolved to its current value. The bridge MUST NOT request formatting of a loc template whose variables are not bound, and MUST NOT leave selector syntax in the exported text.

#### Scenario: Card whose template uses a damage delta selector
- **WHEN** a snapshot includes a card whose description template carries a damage delta selector
- **THEN** the exported description contains the resolved number and no selector syntax
- **AND** the game log gains no localization error entry for that snapshot

#### Scenario: The game's description builder is unavailable after a patch
- **WHEN** the bridge cannot obtain a resolved description from the game
- **THEN** the exported description is `null` and its source is `unavailable`
- **AND** no localization error is logged for that card

### Requirement: Periodic snapshots are coarse, events stay immediate
The bridge MUST publish full run-state snapshots no more often than once every 5 seconds while a run is active, and MUST keep sending event messages such as reward, event, shop and rest open/close without waiting for that interval.

#### Scenario: Player is idle in combat
- **WHEN** no observable game event fires for one minute
- **THEN** the desktop receives at most 12 periodic snapshots in that minute
- **AND** the game log growth attributable to snapshotting stays below 1 MB per minute

#### Scenario: A reward screen opens
- **WHEN** the player reaches a card reward screen
- **THEN** `card.reward.opened` is delivered without waiting for the next periodic snapshot
