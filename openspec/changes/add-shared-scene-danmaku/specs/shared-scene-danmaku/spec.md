## Purpose

为同一类杀戮尖塔 2 场景中的自愿参与者提供短暂、匿名、可审核的共享观战弹幕，同时最小化游戏状态和个人数据的外发。

## ADDED Requirements

### Requirement: Players submit scene messages from the game overlay
The game overlay SHALL provide a small control on the right side of the game display. Activating it SHALL expand a text composer for the current shared scene. The log window MUST NOT contain a shared-message input.

#### Scenario: Composer keyboard behavior
- **WHEN** the composer is open and the user presses `Enter`
- **THEN** the application SHALL submit the current non-empty text
- **AND** `Shift+Enter` SHALL insert a newline without submitting

#### Scenario: Composer can accept typing
- **WHEN** the composer opens over an active shared scene
- **THEN** the danmaku window MUST become temporarily focusable so the text field can receive keyboard input
- **AND** after the composer closes the window MUST return to non-focusable click-through behavior

#### Scenario: No active shared scene
- **WHEN** no combat or death scene is available
- **THEN** the game-overlay control SHALL remain non-blocking
- **AND** submission SHALL be unavailable with a concise status

#### Scenario: Service is unavailable
- **WHEN** the shared service is unreachable
- **THEN** the application SHALL show a non-blocking unavailable state
- **AND** local danmaku MUST continue without delay

### Requirement: Shared rooms use a privacy-minimized scene signature
The application SHALL match players using only a coarse scene signature consisting of game version, character, scene type and sorted active enemy identities. It MUST NOT include a run seed, player health, hand, deck, relics, player memory, recommendation, or full observation payload.

#### Scenario: Equivalent public scenes are matched
- **WHEN** two opted-in players have the same coarse scene signature
- **THEN** their messages SHALL be eligible for delivery to the same shared room

#### Scenario: Sensitive state remains local
- **WHEN** the application joins or posts to a shared room
- **THEN** the outbound payload MUST exclude all prohibited private fields

### Requirement: Shared messages are bounded and visibly attributable
The application SHALL accept only short player-authored text and render shared messages with a shared-player source distinct from Mod facts and original local wording. Messages MUST NOT become strategy input.

#### Scenario: A valid player message is delivered
- **WHEN** a player sends a valid message for the current scene
- **THEN** other players entering that scene SHALL be eligible to receive it without a sender identity

#### Scenario: Entering a scene reads its current complete set
- **WHEN** a player enters a shared combat or death scene
- **THEN** the application SHALL request every currently active message for that scene and phase
- **AND** it MUST NOT reuse a time-based client cache or impose a fixed message-count limit

#### Scenario: Sender sees a delayed local echo
- **WHEN** the service accepts the player's message and the scene remains current
- **THEN** the sender SHALL see the same text fly across the game overlay after approximately 3 seconds
- **AND** it MUST NOT appear immediately at submission time
- **AND** it MUST NOT appear after the user has moved to a different scene

#### Scenario: Player messages do not affect advice
- **WHEN** a player message is received
- **THEN** it MUST NOT alter a recommendation, game state, scene trigger, or player-memory record

### Requirement: Shared danmaku is abuse-limited
The shared service SHALL enforce text length and daily submission limits, reject malformed or duplicate messages, and hide repeatedly reported messages.

#### Scenario: Flooding is rejected
- **WHEN** a sender exceeds the configured room message rate
- **THEN** the service MUST reject the excess messages without disconnecting other clients

#### Scenario: Duplicate content is rejected
- **WHEN** the same client submits identical text to the same scene and phase again
- **THEN** the service MUST reject the duplicate without affecting other clients
