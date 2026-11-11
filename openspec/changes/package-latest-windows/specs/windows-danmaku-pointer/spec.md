## ADDED Requirements

### Requirement: Windows danmaku layer accepts pointer input on interactive targets

On Windows, the danmaku window SHALL sample the cursor position from the main process and SHALL disable click-through while the cursor is over a danmaku item or the shared composer. The window SHALL restore click-through when the cursor leaves those targets and the composer is closed.

#### Scenario: Send button receives the click

- **WHEN** the cursor is over the send-danmaku button on Windows
- **THEN** the danmaku window accepts the pointer event for that button

#### Scenario: Game keeps receiving clicks elsewhere

- **WHEN** the cursor is over empty danmaku-window space and the composer is closed
- **THEN** the danmaku window ignores mouse events
