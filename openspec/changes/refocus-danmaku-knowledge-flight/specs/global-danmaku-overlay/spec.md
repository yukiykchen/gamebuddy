## ADDED Requirements

### Requirement: Danmaku is smaller and leaves the screen before removal
Each rendered danmaku MUST use a compact type size and padding relative to the previous large pill style. Flight duration MUST be derived from the message width and overlay width so the item travels off the left edge. The overlay MUST remove a message only after that flight finishes, or when the combat scene itself ends. A later wave in the same scene MUST NOT delete messages that are still flying.

#### Scenario: A name danmaku crosses the overlay
- **WHEN** `小啃兽` is released onto the overlay
- **THEN** it starts at the right edge and remains visible until its left edge has left the overlay
- **AND** a later same-scene move fact MUST NOT erase it mid-flight

#### Scenario: Combat ends
- **WHEN** the combat scene exits or the Mod Bridge disconnects
- **THEN** the overlay MAY clear remaining messages and hide

### Requirement: Hovering one danmaku pauses every visible danmaku
While the pointer is over any on-screen danmaku, the overlay SHALL pause every visible danmaku in place and MAY show the hovered item's detail panel. When the pointer leaves that item, all paused danmaku MUST resume their remaining flight.

#### Scenario: Player inspects 小啃兽即将哈气
- **WHEN** the pointer enters that message while other messages are still flying
- **THEN** every visible danmaku stops moving
- **AND** only the hovered message shows its knowledge panel
- **AND** leaving it resumes every paused message
