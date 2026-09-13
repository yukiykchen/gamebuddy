## ADDED Requirements

### Requirement: Pet comments on save-loads without a new pose
When a live SL is counted, the desktop pet SHALL speak a short Chinese line in the speech bubble. Tone MUST follow this-run SL after the increment: 1–2 mild, 3–9 teasing, 10 or more heavier. An SL MUST NOT select a fifth long-lived body pose; `data-pose` MUST remain one of `waiting`, `watching`, `thinking`, or `advising` using the existing priority. Thinking or advising speech MUST NOT be replaced while those poses are active; the SL line waits until the pet is not presenting advice or an in-flight LLM review.

#### Scenario: First SL is mild
- **WHEN** a live SL raises this-run SL to 1 or 2
- **AND** the pet is not thinking and not advising
- **THEN** the speech bubble shows a mild comment about reloading
- **AND** the body pose stays in the existing four-pose set

#### Scenario: Frequent SL is teasing
- **WHEN** a live SL raises this-run SL to a value from 3 through 9
- **AND** the pet is not thinking and not advising
- **THEN** the speech bubble shows a teasing comment that can mention the this-run count

#### Scenario: Habitual SL is heavier
- **WHEN** a live SL raises this-run SL to 10 or more
- **AND** the pet is not thinking and not advising
- **THEN** the speech bubble shows a heavier comment about how often the player reloads this run

#### Scenario: Advice is not interrupted
- **WHEN** a live SL is counted while a suggestion card, encounter guide, or recommendation is visible
- **THEN** the pet remains in `advising`
- **AND** the current advice speech is not replaced by the SL line until that advice is no longer presented

### Requirement: Pet status shows this-run SL
The pet status bar SHALL show this-run SL as a visible number whenever the count is known, including 0. It MUST NOT show a lifetime or career SL total.

#### Scenario: Status after load
- **WHEN** the pet window finishes loading and this-run SL is 2
- **THEN** the pet status shows `SL 2` without waiting for another increment
