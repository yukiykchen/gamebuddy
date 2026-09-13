## Purpose

在事件房与各幕开局祝福出现可选项时，给出只读的选项推荐，而不是改去推演地图。

## ADDED Requirements

### Requirement: Choosable event options take priority over map routing
When the observation has one or more choosable event options, the active task MUST be `event_choice`. The system MUST NOT select `map_route` solely because a prior `map.opened` is still the latest map event, or because the current node still has map forks.

#### Scenario: Act-start blessing while map forks exist
- **WHEN** `state.event` has three Ancient relic options
- **AND** the map still has more than one onward route
- **THEN** the active task is `event_choice`

#### Scenario: Ancient dialogue without options
- **WHEN** the run is in an Ancient or event room
- **AND** there are no choosable options yet
- **THEN** the system MUST NOT start `map_route` for that scene

### Requirement: LLM reviews only visible event options
Rules MUST expose the visible choosable options as the only legal candidates. When an LLM is configured, it MUST pick one of those option indexes and a Chinese reason. Locked, already-chosen, and proceed-only buttons MUST NOT be candidates. If the LLM is missing or fails, the system MUST still publish a rules fallback from those candidates without blocking the UI.

#### Scenario: LLM picks a relic
- **WHEN** Pael offers Horn, Fang, and Eye
- **AND** the LLM returns index 1 with a reason
- **THEN** the recommendation task is `event_choice`
- **AND** the primary action is `CHOOSE_EVENT` with that option's label

#### Scenario: No API key
- **WHEN** event options are visible
- **AND** no LLM key is configured
- **THEN** a rules `event_choice` recommendation is still published
