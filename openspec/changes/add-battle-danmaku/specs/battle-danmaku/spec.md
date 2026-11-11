## ADDED Requirements

### Requirement: Confirmed Mod signals produce a bounded factual danmaku wave
The companion SHALL create a wave from a current, fresh Mod observation or an accepted Mod event. An upstream recommendation MAY add a language-only reaction when it is bound to that same observation, but it MUST NOT be required for a wave. Each message MUST carry a scene and state version binding, and MUST expire without player action.

#### Scenario: Combat entry produces a factual reaction without an Agent recommendation
- **WHEN** a fresh observation enters a combat scene
- **THEN** the companion queues at least three related facts from the turn, named alive enemies, their health/block/intent, and compatible natural Codex mechanism facts
- **AND** it MUST NOT append Bilibili, original-template, or recommendation atmosphere messages
- **AND** it MUST NOT use generic entry wording such as “进入战斗”, “出场了” or “围观席就位”
- **AND** it does not wait for an upstream battle recommendation

#### Scenario: Stale or duplicate source is ignored
- **WHEN** an observation, event, or recommendation is duplicate, stale, or bound to another scene/version
- **THEN** it MUST NOT create a new danmaku wave

### Requirement: Danmaku remains factual and non-strategic
The companion SHALL use only Mod-provided facts, trigger-scoped original wording, and attributable Bilibili atmosphere wording for expression. It MUST NOT decide card plays, infer monster mechanics, predict damage/block/win probability, judge player preferences, control the game, or infer a win from missing information.

#### Scenario: Unknown enemy receives a factual entry line
- **WHEN** an alive enemy name is present in a fresh combat observation
- **THEN** the companion emits a fact line using that exact name
- **AND** it MUST NOT require the name to appear in a fixed encounter catalog

#### Scenario: Attack intent is reported as a fact
- **WHEN** a Mod observation contains an alive enemy whose normalized intent is `attack`
- **THEN** the companion MAY display that exact enemy name with the `攻击意图` keyword
- **AND** it MUST NOT recommend a card, block amount, or outcome

#### Scenario: Upstream tentative plan is expressed as tentative
- **WHEN** a same-version upstream battle recommendation is marked tentative
- **THEN** the emitted wording MAY acknowledge a tentative plan
- **AND** it MUST NOT present the plan as guaranteed

#### Scenario: Combat disappears without an outcome
- **WHEN** a combat state is no longer present and no explicit victory or defeat result is available
- **THEN** the companion only expresses that the encounter ended
- **AND** it MUST NOT emit a victory celebration

### Requirement: Danmaku uses automatically prepared corpus material safely
The runtime SHALL only select automatically cleaned corpus phrases that have scene/trigger categories, safety metadata, and source provenance. Raw collected JSONL records MUST NOT be emitted directly or randomly.

#### Scenario: A prepared Bilibili phrase is selected
- **WHEN** a prepared phrase is selected for a compatible trigger and scene
- **THEN** its source metadata is retained with the message for inspection

### Requirement: Danmaku retrieves Bilibili wording without blocking game feedback
The companion SHALL query a dedicated danmaku vector collection with safe, scene-compatible and trigger-compatible corpus filters before selecting Bilibili wording. It MUST NOT read or write the player-memory collection. If embedding or vector retrieval does not complete within 350ms, the companion MUST emit factual and original compatible wording.

#### Scenario: Compatible Bilibili wording is retrieved
- **WHEN** a fresh combat signal creates an `entry`, `low_hp`, or other supported trigger
- **THEN** the retriever filters records by that trigger, scene and safe status before semantic ranking
- **AND** at most two retrieved corpus phrases are mixed with factual and original wording

#### Scenario: Vector service is unavailable
- **WHEN** the Ollama or danmaku vector service is unavailable or times out
- **THEN** the same trigger still produces a bounded factual/original-wording wave
- **AND** it MUST NOT delay, suppress, or alter a battle recommendation

#### Scenario: Retrieval diagnostics identify fallback
- **WHEN** an embedding or vector query succeeds or fails
- **THEN** the runtime logs the embedding outcome, Chroma outcome, retrieved count, and any fallback reason
