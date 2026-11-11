## ADDED Requirements

### Requirement: Move hover shows the current effect and duration
Hovering a coming-action danmaku SHALL show a short Codex effect for that move, including whether the effect lasts this turn or this combat when the knowledge base makes that duration known. The hover panel MUST NOT repeat the visible “即将” sentence, MUST NOT list every other move, and MUST NOT use “释放状态效果”.

#### Scenario: Hovering 小啃兽即将哈气
- **WHEN** the visible text is `小啃兽即将哈气` and Codex lists a Strength gain of 2
- **THEN** the hover panel says the combat-long Strength gain
- **AND** it MUST NOT repeat `小啃兽即将哈气` as the only line
- **AND** it MUST NOT dump the full move encyclopedia

### Requirement: Name hover stays a short knowledge card
Hovering a first-encounter name danmaku SHALL show at most three short knowledge lines: the known action cycle, a target-priority line when the encounter has one, and one mechanism point. It MUST NOT list encounter names, opening C# conditions, or every move's damage.

#### Scenario: Hovering 小啃兽 on first appearance
- **WHEN** the visible danmaku text is `小啃兽`
- **THEN** the hover panel includes the 顶撞 → Slice → 哈气 cycle
- **AND** it MAY include that they scale with Strength
- **AND** it MUST NOT list every move's damage or encounter titles
