## Purpose

让 GameBuddy 在普通怪物、精英和 Boss 的每一场真实战斗中，都能根据已确认敌人提供一次性、可追溯且不臆测伤害的机制与打法提示。

## ADDED Requirements

### Requirement: Every combat type can produce an encounter guide
When combat is active, the system MUST classify the encounter as boss, elite, or normal. A normal combat MUST produce the same guide sections as stronger encounters: summary, deck checks, target priorities, monster mechanics, dangers, tips, and common mistakes.

#### Scenario: Normal map combat starts
- **WHEN** combat is active and the current room is neither Boss nor Elite
- **THEN** the system generates a guide with `kind` equal to `normal`
- **AND** the guide includes the actual visible enemies and actionable strategy sections

#### Scenario: Event combat has no normal map node
- **WHEN** combat starts from an event or unknown node and the visible enemies match catalog monsters
- **THEN** the system still generates a normal guide from those actual enemies
- **AND** it MUST NOT guess that the fight is an Elite or Boss

### Requirement: Normal encounter matching uses actual enemies
The system MUST match a normal encounter using the active enemy IDs/names and current Act before presenting an encounter title. If no exact encounter is found, it MUST present per-monster mechanics without inventing an encounter identity.

#### Scenario: One monster appears in multiple encounter groups
- **WHEN** several catalog encounters contain one of the active monster types
- **THEN** matching favors the encounter whose monster composition best covers the active enemies in the current Act

### Requirement: Mechanic-derived advice is labeled honestly
When no reviewed community strategy exists, the system MUST derive advice only from catalog mechanics and the active enemy composition. The guide MUST label that strategy as mechanic-derived and MUST NOT report community source counts or reviewed confidence.

#### Scenario: Normal encounter has no community profile
- **WHEN** a matched normal encounter has mechanics but no reviewed strategy profile
- **THEN** the guide still includes deck checks, target priorities, tips, and mistakes derived from those mechanics
- **AND** its strategy basis is `mechanics`

### Requirement: Encounter guides remain one-shot per combat
Automatic state updates during one combat MUST NOT reopen or replace a normal encounter guide after it was shown or dismissed. Combat end MUST clear the guide so the next combat can show its own advice.

#### Scenario: Turn and HP updates arrive
- **WHEN** a normal guide has been shown and later state snapshots update turn, HP, or enemy intents in the same combat
- **THEN** no second guide is automatically opened

#### Scenario: Next combat starts
- **WHEN** the previous combat ends and another combat becomes active
- **THEN** the new encounter can produce a new guide
