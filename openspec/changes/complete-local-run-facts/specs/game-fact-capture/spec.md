## Purpose

定义《杀戮尖塔 2》对局中不可事后补回的选择、构筑与战斗事实，以及读档重打时保持身份并只采用最新尝试的统一语义。

## ADDED Requirements

### Requirement: Run and combat identities survive save loads
GameBuddy SHALL keep one `runId` for one real run and one `combatId` for one room encounter. Loading a save during that encounter MUST NOT create a new run or combat identity, archive the run, or emit another recent-run row.

#### Scenario: Reload the same combat ten times
- **WHEN** the player reloads the same room encounter ten times
- **THEN** all observations use the same `runId` and `combatId`
- **AND** the local save-load count increases ten times
- **AND** the run remains one active run

#### Scenario: Start a genuinely new run
- **WHEN** the game confirms a new run after the prior run has ended
- **THEN** the new run receives a different `runId`

### Requirement: Only the latest combat attempt remains effective
GameBuddy SHALL identify each observed attempt within a combat while keeping the public `combatId` stable. When a save load restarts that combat, all cards, turns, damage, block, healing, resources, entities and effects from the earlier attempt MUST be superseded; only the latest attempt SHALL remain available to storage and personal-data consumers.

#### Scenario: Reload after playing cards
- **WHEN** the player plays five cards, reloads the encounter, and then wins after playing eight cards
- **THEN** the effective combat record contains the eight cards from the latest attempt
- **AND** it does not contain or aggregate the five discarded plays

#### Scenario: Reload before the combat finishes
- **WHEN** a save load is confirmed while a combat attempt is active
- **THEN** GameBuddy marks the prior attempt superseded before accepting facts for the replacement attempt

### Requirement: Run completion follows game progression
GameBuddy SHALL derive completion from verified game progression and ending state rather than player HP alone. On the supported v0.107.1 ruleset, defeating the Act 3 boss and reaching the Architect ending SHALL be recorded as cleared even though the scripted ending reduces the player to zero HP. All other confirmed ended runs SHALL be recorded as not cleared.

#### Scenario: Architect ending
- **WHEN** the player defeats the Act 3 boss and reaches the Architect ending
- **THEN** the run ends with `cleared=true`

#### Scenario: Death before clearing Act 3
- **WHEN** the player dies before the completion condition is reached
- **THEN** the run ends with `cleared=false`

#### Scenario: Temporary missing state
- **WHEN** run state temporarily disappears because of a scene transition, reconnect, application exit or save load
- **THEN** GameBuddy does not infer that the run ended

### Requirement: Choice opportunities and outcomes are captured
For card rewards, routes, shops, rest sites and events, GameBuddy SHALL capture a stable decision identity, all observable candidates and constraints, the confirmed choice, and the resulting state changes. A screen close MUST NOT be treated as a skip unless the game confirms that outcome.

#### Scenario: Card reward is selected
- **WHEN** a reward shows three candidates and the player selects one
- **THEN** one decision records the three offered slots and the selected slot and card instance
- **AND** refresh callbacks do not create duplicate decisions

#### Scenario: Reward result cannot be confirmed
- **WHEN** a reward closes without a confirmed selection or skip
- **THEN** the result is unknown rather than selected, skipped or zero

#### Scenario: Shop, rest, event and route choices
- **WHEN** the player completes one of these decisions
- **THEN** its offered options, prices or disabled reasons, selected option, actual cost and resulting changes are linked to the same decision

### Requirement: Permanent build changes are captured
GameBuddy SHALL capture permanent card additions, removals, upgrades, transformations and modifications, relic changes, and potion gain/use/discard/replace with instance identity, source action and before/after context. Temporary combat cards MUST NOT be recorded as permanent deck changes.

#### Scenario: Transform one card
- **WHEN** an action transforms a permanent card
- **THEN** the old and new card instances are linked to one transformation action

### Requirement: Combat actions and resolutions are captured
Each effective combat SHALL contain verified combat and turn boundaries, entity instances, actual cards played, targets, play mode, actual resource payments, damage resolution, block changes, healing, resource changes, card-zone movements, potion use and power changes. Repeated identical actions MUST remain distinct, and polling estimates MUST NOT be presented as exact resolution facts.

#### Scenario: Multi-hit and multi-target action
- **WHEN** one action deals several hits or affects several targets
- **THEN** every resolution is recorded separately with one shared source action and distinct target identity

#### Scenario: Manual and automatic card play
- **WHEN** the same card type is played manually once and automatically once
- **THEN** two actions are recorded with different play modes

#### Scenario: Hook is unavailable
- **WHEN** the supported game method cannot be hooked
- **THEN** that event family is marked unavailable for the interval
- **AND** zero observed events are not interpreted as zero player actions
