# pet-overlay Specification

## Purpose

让悬浮桌宠用对局场景里真正需要的姿态，表达它是在等游戏、旁观、分析还是给建议，玩家不必只靠气泡文字判断。

## Requirements

### Requirement: Pet exposes four exclusive game poses
The desktop pet SHALL present exactly one of `waiting`, `watching`, `thinking`, or `advising` at a time. Each pose MUST use a visually distinct body posture of the same character. Pose names MUST describe GameBuddy companion activity, not Codex desktop-pet states.

#### Scenario: Only one pose is visible
- **WHEN** the pet is shown on screen
- **THEN** exactly one pose is active
- **AND** that pose is distinguishable from the other three without reading the speech bubble

### Requirement: Pose follows the current run scene
The pet SHALL derive the active pose from overlay signals with this priority (highest first): `advising`, then `thinking`, then `waiting`, then `watching`.

- `advising` MUST activate when a card-reward suggestion card or encounter-guide panel is visible, or when a route, rest, or event recommendation is currently presented.
- `thinking` MUST activate while an LLM request for a recommendation is in flight and no advice is being presented.
- `waiting` MUST activate when the overlay is not receiving live game state (waiting, connecting, stale, or invalid), and no higher pose applies.
- `watching` MUST activate when the overlay is live, the companion is not thinking, and no advice is being presented.

Enemy attack intent MUST NOT select a dedicated body pose. It MAY still be mentioned in the speech bubble while the pet remains in `watching` or another applicable pose.

#### Scenario: Analysis uses thinking
- **WHEN** the companion starts an LLM review for card, route, rest, or event advice
- **AND** no suggestion card, encounter guide, or recommendation is presented yet
- **THEN** the pet shows `thinking`

#### Scenario: Advice uses advising
- **WHEN** a card suggestion card, encounter guide, or route/rest/event recommendation is presented
- **THEN** the pet shows `advising`

#### Scenario: No game uses waiting
- **WHEN** the overlay status is waiting, connecting, stale, or invalid, and no LLM request is in flight
- **THEN** the pet shows `waiting`

#### Scenario: Spectating a live run uses watching
- **WHEN** the overlay is live, no LLM request is in flight, and no advice is presented
- **THEN** the pet shows `watching` with a quiet loop distinct from thinking and waiting

#### Scenario: Combat attack does not change pose family
- **WHEN** the overlay is live in combat, an enemy intent indicates an attack, and no thinking or advice is active
- **THEN** the pet remains in `watching`
- **AND** it MAY show a speech warning without switching to a fifth pose

### Requirement: Existing overlay chrome still works
Drag, click-to-open main window, context menu, speech bubbles, the card suggestion card, and the encounter guide SHALL keep working in every pose. Reduced-motion settings MUST disable looping pose animations.

#### Scenario: Panels remain usable during advising
- **WHEN** the pet is in `advising` with a card suggestion or encounter guide open
- **THEN** the player can still close that panel and drag or click the pet

#### Scenario: Reduced motion
- **WHEN** the operating system requests reduced motion
- **THEN** looping pose animations MUST not run
