## Purpose

把杀戮尖塔 2 事件房与各幕开局远古祝福的可见选项，作为只读快照和生命周期事件送给桌面端。

## ADDED Requirements

### Requirement: Event room options appear in the run snapshot
While the player is in an event room (including act-start Ancient blessings) and visible choosable options exist, the Bridge MUST include `state.event` with `title`, `description`, and `options`. Each option MUST have an integer `index` matching on-screen order and a non-empty `label`. When an option is a relic blessing, `label` MUST be the relic name and `description` MUST be the relic effect text shown in the game. `state.event.kind` MUST be `ancient` for act-start Ancient blessings and `event` otherwise.

#### Scenario: Act-start relic blessing
- **WHEN** an act-start Ancient presents three relic options such as Pael's Horn, Fang, and Eye
- **THEN** `state.event.kind` is `ancient`
- **AND** `state.event.options` contains three entries whose labels and descriptions match the on-screen relic names and effects

#### Scenario: Dialogue before options
- **WHEN** an Ancient is still in dialogue and no choosable option buttons are visible
- **THEN** `state.event` MAY be present with an empty `options` array
- **AND** the Bridge MUST NOT invent option labels

### Requirement: Event lifecycle events
The Bridge MUST emit `event.opened` when a new set of choosable options becomes visible, including the option list in `data`. The Bridge MUST emit `event.closed` when those choosable options disappear or the run leaves the event room.

#### Scenario: Options appear
- **WHEN** choosable event options become visible
- **THEN** clients receive `event.opened` whose data includes the current title and options

#### Scenario: Player finishes the choice
- **WHEN** the player has picked an option and choosable options are gone, or the run leaves the event room
- **THEN** clients receive `event.closed`
