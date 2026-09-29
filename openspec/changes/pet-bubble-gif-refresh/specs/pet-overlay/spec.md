## MODIFIED Requirements

### Requirement: Compact pet shows one primary sentence

The pet overlay MUST show one primary speech bubble containing the current status or concise action. The bubble MUST fit short text rather than stretch across the whole compact window, while retaining a maximum width and wrapping longer text. A suggestion bubble MUST open its detailed explanation when clicked. Connection state and elapsed LLM thinking time MUST remain readable in a lighter secondary status line.

#### Scenario: Waiting for a game

- **WHEN** the Bridge is connecting or waiting for game state
- **THEN** the pet shows a single waiting sentence
- **AND** it does not repeat the same waiting phrase in a second boxed bubble
- **AND** the speech bubble stays compact around that short sentence

#### Scenario: A recommendation arrives

- **WHEN** a card, route, rest, event, or shop recommendation is presented
- **THEN** the compact bubble states the recommended action in at most two lines
- **AND** clicking it opens the existing reason and risk details

### Requirement: Pet artwork follows pose and reduced motion

The overlay MUST retain the original character GIF artwork for each existing skin and each of the four poses. Under `prefers-reduced-motion: reduce`, the artwork MUST use a static frame generated from that original GIF for the selected pose.

#### Scenario: Character changes pose

- **WHEN** the current pose changes between waiting, watching, thinking, and advising
- **THEN** the matching character state artwork appears without moving the body anchor or covering text

#### Scenario: Reduced motion

- **WHEN** the operating system requests reduced motion
- **THEN** no character GIF loop is played
- **AND** the pose remains distinguishable through its static artwork
