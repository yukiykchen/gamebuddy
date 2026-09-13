## Purpose

在主窗口列出当前开局祝福或事件的选项，并标出 Agent 推荐项。

## ADDED Requirements

### Requirement: Main window shows event option advice
When the published recommendation task is `event_choice`, the main window MUST show the event title, the recommended option label, the reason, and the other visible options as alternatives. It MUST NOT keep showing a map-route view as if that were the current decision.

#### Scenario: Act-start blessing recommendation arrives
- **WHEN** the desktop receives an `event_choice` recommendation for an Ancient relic
- **THEN** the main window displays that relic as the suggested pick
- **AND** the other relic options remain visible as alternatives
