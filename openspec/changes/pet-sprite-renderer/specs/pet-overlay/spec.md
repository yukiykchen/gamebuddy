## ADDED Requirements

### Requirement: Pet pose visuals use a configurable renderer
The pet overlay SHALL render pose visuals through a pose renderer registry. The application MUST NOT require pose state handling to know whether a pose is drawn by CSS, a static sprite, or a frame animation. Pose state transitions, speech, status, and advice panels MUST continue to use the existing pose names.

#### Scenario: Image renderer is selected
- **WHEN** the sprite configuration selects the image renderer
- **THEN** each of `waiting`, `watching`, `thinking`, and `advising` displays its declared transparent image
- **AND** animated GIF frames play through the browser image renderer
- **AND** speech, status strip, advice panels, dragging, and main-window activation remain functional

#### Scenario: Renderer can be swapped
- **WHEN** the sprite configuration selects the CSS renderer
- **THEN** the existing CSS pose presentation is used without changing pet state handling or recommendation handling
