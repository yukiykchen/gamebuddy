## ADDED Requirements

### Requirement: First encounter shows each unique monster name
When a fresh observation first enters combat, the companion SHALL emit one factual danmaku per unique alive enemy name. Same-name enemies MUST share one name danmaku. Hovering that message SHALL show a Codex briefing that includes identity, the known action cycle, and what each common move does. The visible text MUST NOT be a raw move-list sentence.

#### Scenario: A known monster appears
- **WHEN** a fresh combat observation contains an alive enemy named 小啃兽
- **THEN** the overlay queues a danmaku whose visible text is `小啃兽`
- **AND** hovering it shows the known cycle and each move's effect
- **AND** it MUST NOT show “会使用顶撞、Slice、哈气” as the visible text

#### Scenario: Two enemies share a name
- **WHEN** two alive enemies are both named 小啃兽
- **THEN** the overlay emits one `小啃兽` name danmaku

### Requirement: Later turns announce the concrete next effect
After the first-encounter name wave, the companion SHALL emit a factual danmaku only when an alive enemy's current move or primary action changes. The visible text MUST name the enemy and the concrete next effect from Codex, such as gaining Strength, not a generic “释放状态效果” label. Hovering MUST add the remaining move facts and MUST NOT only repeat the visible sentence.

#### Scenario: A buff move is 哈气
- **WHEN** 小啃兽's current move is the Codex-matched 哈气
- **THEN** the overlay shows that it will gain 2 Strength
- **AND** hovering explains that effect instead of repeating “释放状态效果”

#### Scenario: Only a unique Codex move matches the intent kind
- **WHEN** the Mod exposes a buff intent and Codex has exactly one buff move for that monster
- **THEN** the companion MAY use that unique move's effect
- **AND** MUST NOT invent a move when several candidates remain

### Requirement: Atmosphere actually appears after facts
After the factual messages of an entry or move wave, the companion SHALL append Bilibili and LLM atmosphere when those services succeed, and SHALL keep local fallback atmosphere when they time out. A later observation in the same combat scene MUST NOT discard queued atmosphere. Retrieval and LLM MUST NOT delay factual messages.

#### Scenario: Bilibili or LLM arrives after the name fact
- **WHEN** a first-encounter name wave is accepted
- **THEN** the overlay keeps the name fact
- **AND** later appends retrieved Bilibili and validated LLM phrases to the same scene

#### Scenario: A later snapshot arrives in the same fight
- **WHEN** a newer observation stays in the same combat scene
- **THEN** already queued atmosphere MUST remain eligible to display
