## Purpose

让弹幕根据 Mod 明确提供的职业与战斗事实呈现有辨识度、可追溯且不承担策略职责的场景语言，减少泛化和重复的观战表达。

## ADDED Requirements

### Requirement: Danmaku derives a language profile from explicit game facts
The companion SHALL derive a language profile from the Mod-provided character, room, active enemy names, normalized intents, health bands, turn and accepted events. It MUST use a generic profile when a character identifier is absent or unsupported, and MUST NOT infer an archetype, strategy, personality or hidden mechanic.

#### Scenario: Character-specific profile is available
- **WHEN** a fresh combat observation contains a supported `run.character`
- **THEN** compatible atmosphere wording SHALL be eligible for that character profile
- **AND** factual keywords remain based only on the observation

#### Scenario: Unknown character falls back safely
- **WHEN** the observation has no character identifier or an unknown identifier
- **THEN** the companion MUST use generic compatible wording
- **AND** MUST NOT suppress Mod-fact messages

### Requirement: Monster knowledge is rendered without duplicating game UI
The companion SHALL retain Mod-provided monster IDs and use them to match existing local Codex knowledge. It MUST render Codex-only monster knowledge naturally, without visible implementation/source labels such as “档案”, “标签” or “资料”. It MUST NOT render player health, player damage, enemy health, block, generic attack-intent, turn counter, or action-cycle text that the game UI already exposes.

#### Scenario: First encounter shows known move overview
- **WHEN** a Mod enemy ID matches local Codex move data on first encounter
- **THEN** the companion SHALL render a natural overview of the known move names
- **AND** MUST NOT render an action-cycle sentence

#### Scenario: Codex mechanism is available
- **WHEN** the Mod enemy ID matches local Codex mechanism data
- **THEN** the companion SHALL render up to three distinct natural, non-strategic mechanism reminders when compatible facts exist
- **AND** MUST NOT expose the internal data-source label or recommend a card/action

### Requirement: Current enemy move is rendered with hoverable knowledge detail
The Mod SHALL expose a best-effort current enemy move identifier and display name in addition to its existing intent. When the identifier changes and matches Codex move data, the companion SHALL render only the move name as danmaku and attach the full known move detail for hover display. It MUST omit the message when the move cannot be identified rather than guessing from intent.

#### Scenario: A known current move changes
- **WHEN** a current enemy move ID changes and matches a local Codex move
- **THEN** the overlay SHALL render the move name
- **AND** hovering that message SHALL show its known effect, damage, hit count, block, heal and description when available

#### Scenario: Current move is unavailable
- **WHEN** the Mod cannot expose a move ID/name or Codex cannot match it
- **THEN** the companion MUST NOT infer the move from intent alone
- **AND** MUST NOT emit a generic attack-intent danmaku

### Requirement: Recommendation status does not create generic danmaku
The companion MUST NOT render generic recommendation-status wording such as “建议更新”, “辅助建议到了” or “方案已就位”. An upstream recommendation remains available to its existing UI, but MUST NOT create a danmaku wave without a current Mod fact trigger.

#### Scenario: Recommendation arrives without a new Mod fact
- **WHEN** an upstream battle recommendation arrives for the current combat scene
- **THEN** the companion MUST NOT create a danmaku wave from that recommendation alone
- **AND** the existing recommendation UI remains unaffected

### Requirement: Danmaku selects scene-compatible expressive wording
The companion SHALL select atmosphere wording using a compatible scene trigger, tone and, when available, character profile. Every non-factual phrase MUST have source and category metadata and MUST NOT contain a card recommendation, numerical combat prediction, player judgment or mechanism claim.

#### Scenario: Attack-intent scene has a compatible tone
- **WHEN** an active enemy displays a normalized attack intent
- **THEN** eligible wording SHALL be limited to the tense/attention tone for that scene
- **AND** the message MUST NOT tell the player which card or action to choose

#### Scenario: Explicit entry facts remain dominant
- **WHEN** a combat scene is newly entered
- **THEN** the overlay MUST show only available Codex move/ability knowledge for the encountered monsters
- **AND** MUST NOT add character phrases, corpus atmosphere phrases, LLM phrases or recommendation wording to that entry wave

### Requirement: Significant non-entry scenes produce a high-density bounded wave
The companion SHALL queue six to eight distinct messages for a significant non-entry scene signal. The wave MUST start with the current Mod-fact message, use a 350–600ms message separation, and include only compatible local, corpus, or LLM-atmosphere sources. It MUST remain bounded by scene invalidation, expiry and cooldown.

#### Scenario: Attack intent creates a high-density wave
- **WHEN** a current combat observation introduces an attack-intent scene signal
- **THEN** the companion SHALL queue six to eight current, distinct messages beginning with a Mod-fact keyword
- **AND** all atmosphere messages MUST be compatible with the scene tone

#### Scenario: Entry remains fact-only
- **WHEN** a fresh observation enters combat
- **THEN** the companion MUST retain the existing fact-only entry behavior
- **AND** MUST NOT increase the entry wave with atmosphere messages

### Requirement: LLM atmosphere wording is asynchronous and constrained
The companion SHALL use an enabled configured LLM only to generate short atmosphere wording from the current language profile. It MUST validate generated text locally, label accepted text with an LLM source, and discard text that is unsafe, strategic, stale or not bound to the current scene. It MUST NOT send a full observation, player-memory data, recommendation, API key or hidden game data to the LLM.

#### Scenario: LLM wording arrives after fact feedback
- **WHEN** a significant non-entry scene signal is emitted and LLM wording is not cached
- **THEN** the companion SHALL emit available Mod-fact and local/corpus wording without waiting
- **AND** MAY append validated LLM atmosphere wording only while the same scene generation remains current

#### Scenario: LLM is unavailable
- **WHEN** the configured LLM is unavailable, disabled, invalid or times out
- **THEN** the companion MUST preserve the high-density wave using local/corpus fallback material when available
- **AND** MUST NOT delay or alter facts, recommendations or game state

### Requirement: Danmaku avoids repetitive and stale language
The companion SHALL avoid repeating the same phrase, meme family or source phrase within a bounded recent window and within the same combat scene. It MUST prefer a different compatible category when available and use a safe generic fallback otherwise.

#### Scenario: Recent phrase is encountered again
- **WHEN** the highest-ranked phrase was recently emitted in the current combat scene
- **THEN** the companion SHALL select another compatible phrase when one exists
- **AND** retain the factual message regardless of phrase availability

#### Scenario: Only one compatible phrase exists
- **WHEN** no unused compatible phrase remains
- **THEN** the companion MAY omit atmosphere wording
- **AND** MUST NOT reuse an incompatible or strategy-like phrase

### Requirement: A player can pause a danmaku by hovering it
The overlay SHALL pause an individual danmaku's animation and expiration while the pointer hovers over its visible text, then resume it with the remaining display time after the pointer leaves. Hovering MUST NOT change game focus or intercept pointer input outside the message itself.

#### Scenario: Hover pauses a moving message
- **WHEN** the player points at an active danmaku message
- **THEN** that message MUST stop moving and remain visible
- **AND** other messages and game input remain unaffected

#### Scenario: Pointer leaves a paused message
- **WHEN** the pointer leaves a paused danmaku message
- **THEN** the message SHALL resume motion and expire after its remaining time

### Requirement: Offline corpus tagging supports style selection
The corpus preparation pipeline SHALL preserve source provenance and assign explainable trigger, tone and meme-category metadata to eligible phrases. It MUST retain a generic category for phrases that cannot be classified and MUST reject text outside the atmosphere-only boundary.

#### Scenario: Slang phrase is prepared
- **WHEN** an eligible short slang phrase matches an explainable category rule
- **THEN** its indexed metadata SHALL include its tone and meme category
- **AND** the phrase SHALL remain traceable to its source
