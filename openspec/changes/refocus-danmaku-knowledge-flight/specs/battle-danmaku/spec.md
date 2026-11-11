## ADDED Requirements

### Requirement: One encounter introduction for the whole fight
A fresh combat observation SHALL emit one introduction danmaku for the matched encounter, even when several monsters are alive. The visible text SHALL be the encounter name, such as `一大群史莱姆`. Hover detail SHALL list each distinct alive monster's short mechanism and move cycle. The overlay MUST NOT emit a separate introduction line per monster.

#### Scenario: A slime group enters
- **WHEN** a fresh combat observation matches the encounter `一大群史莱姆` and several slime variants are alive
- **THEN** the overlay shows one introduction whose text is `一大群史莱姆`
- **AND** its hover detail lists each distinct slime's cycle and mechanism
- **AND** it MUST NOT also fly a separate introduction for each slime

### Requirement: Move facts announce notable effects
After the encounter introduction, a changed enemy action SHALL be announced only when it is not a simple single-hit attack or a simple defend. Visible text SHALL use `{enemy}即将{move}：{effect}` when the effect is known. It MUST NOT use a generic “释放状态效果” label when the move name is known. The same notable move MAY be announced again on a later turn.

#### Scenario: 小啃兽 uses 哈气
- **WHEN** 小啃兽's current Codex-matched move is 哈气
- **THEN** the overlay shows `小啃兽即将哈气：本场战斗力量+2`
- **AND** it MUST NOT show `释放状态效果` as the visible text

#### Scenario: Unique buff move without a move id
- **WHEN** the Mod exposes a buff intent and Codex has exactly one buff move for that monster
- **THEN** the visible text MAY use that unique move name after 即将
- **AND** MUST NOT invent a name when several candidates remain

### Requirement: Entry may show one knowledge priority fact
When a fresh combat observation first enters a multi-enemy fight, the companion MAY emit one additional factual danmaku that restates an existing encounter priority from Codex mechanics or community encounter strategy. It MUST NOT invent a card to play, a damage number, or a win chance.

#### Scenario: Two 小啃兽 enter together
- **WHEN** a fresh combat observation contains two alive enemies named 小啃兽 and the knowledge base marks them as scaling
- **THEN** the overlay MAY queue one priority fact such as preferring the scaling target
- **AND** it MUST NOT tell the player which card to play

### Requirement: Companion host atmosphere is not used
Factual waves MUST NOT append local companion-host phrases such as “小伙伴”, “陪你”, or “观战席”. Atmosphere after facts MUST be retrieved Bilibili phrases or validated LLM reactions only. If those services fail, the wave stays factual.

#### Scenario: Retrieval and LLM time out
- **WHEN** Bilibili retrieval and LLM atmosphere both fail after an entry or move fact
- **THEN** the overlay keeps the factual messages
- **AND** it MUST NOT fill the gap with companion-host wording
