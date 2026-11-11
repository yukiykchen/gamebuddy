## ADDED Requirements

### Requirement: Pet overlay preserves existing companion interactions
The pet overlay SHALL preserve the four-pose selection priority, drag behavior, context menu, recommendation card and guide panel after battle danmaku moves to a dedicated overlay window. It MUST NOT render or intercept battle danmaku messages.

#### Scenario: Dedicated danmaku messages do not affect the pet
- **WHEN** the main process emits a battle danmaku message
- **THEN** the pet continues rendering its existing state and controls
- **AND** no battle-danmaku DOM node is created in the pet overlay

#### Scenario: Existing reduced motion behavior remains supported
- **WHEN** the operating system requests reduced motion
- **THEN** the pet's existing reduced-motion behavior remains active
