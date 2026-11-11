## ADDED Requirements

### Requirement: Hovered monster names show a Codex briefing
When a first-encounter name danmaku matches a local Codex monster, hovering it SHALL show a briefing with identity, the known action cycle, and each common move's effect. The overlay MUST NOT display implementation labels such as “档案”, “标签” or “资料”.

#### Scenario: Hovering 小啃兽
- **WHEN** the visible danmaku text is `小啃兽` and Codex contains that monster
- **THEN** the hover panel includes the 顶撞 → Slice → 哈气 cycle
- **AND** it explains 哈气 as gaining Strength
- **AND** it MUST NOT expose internal source labels

### Requirement: Status danmaku names the actual effect
A status, buff or debuff danmaku SHALL use the Codex effect text, such as gaining Strength. It MUST NOT use “释放状态效果” as the visible text when that effect is known, and the hover panel MUST NOT only repeat the same generic label.

#### Scenario: 哈气 is the next move
- **WHEN** the current move is 哈气 and Codex lists a Strength gain
- **THEN** the visible danmaku names that Strength gain
- **AND** the hover panel adds the remaining known move facts

### Requirement: Heal is never shown as defend
Normalized enemy intent kinds SHALL treat heal as its own category. If heal and defend are both present, the visible category MUST be heal.

#### Scenario: A heal intent is also tagged defend
- **WHEN** the current enemy intent kinds include both heal and defend
- **THEN** the visible danmaku category is heal
