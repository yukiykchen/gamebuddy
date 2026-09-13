## Purpose

扩展 `gamebuddy.state.v1` 与事件名，使开局祝福和事件选项能被校验、缓存和回放。

## ADDED Requirements

### Requirement: Optional event kind on state snapshots
When `state.event` is present, it MUST include `title`, `description`, and `options`. `kind` MAY be `ancient` or `event`. Option `description` and `locked` remain optional. Unknown extra fields MUST NOT fail validation.

#### Scenario: Ancient snapshot validates
- **WHEN** a snapshot includes `event.kind` `ancient` and three relic options with index and label
- **THEN** protocol validation MUST accept it

### Requirement: event.closed is a supported protocol event
`event.closed` MUST be a supported message name alongside existing `event.opened`. `event.opened` data MAY include `title`, `kind`, and `options`. Missing `event.closed` data MUST still validate.

#### Scenario: Closed event validates
- **WHEN** a client sends `{ type: "event", name: "event.closed", timestamp: <number> }`
- **THEN** protocol validation MUST accept it
