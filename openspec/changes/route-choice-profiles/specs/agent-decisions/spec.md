## ADDED Requirements

### Requirement: Route choices respect immediate legal forks and survival context
GameBuddy SHALL rank one representative continuation for every currently selectable next node. Low HP MUST affect the primary route ordering before elite count, and the model MUST only receive distinct legal next-node candidates.

#### Scenario: Low HP with elite and safer alternative
- **WHEN** an elite route and a safer route are both selectable and current HP is low
- **THEN** elite count alone SHALL NOT force the elite route to be recommended

#### Scenario: Shared entrance, different later routes
- **WHEN** multiple full paths share one next node
- **THEN** they SHALL occupy one candidate slot, with the best continuation for that entrance

### Requirement: Explain health-aware route perspectives
GameBuddy SHALL provide safe, balanced, and growth-oriented route comparisons based on current state and actual map nodes. HP at or above 65% SHALL be healthy/growth, HP above 35% and below 65% SHALL be caution/balanced, and HP at or below 35% SHALL be danger/safe. Node-sequence bonuses SHALL apply only to nearby ordered nodes and SHALL NOT be represented as guaranteed future outcomes.

#### Scenario: Different profile choices
- **WHEN** the three perspectives favor different immediate nodes
- **THEN** the recommendation SHALL identify each node and explain the active health-based tradeoff

#### Scenario: Indistinguishable routes under current evidence
- **WHEN** distinct entrances have similar score and visible composition
- **THEN** the UI SHALL retain a provisional preferred entrance, lower confidence, and disclose that current evidence cannot establish a meaningful gap
- **AND** it SHALL NOT claim that the routes are objectively equivalent or interchangeable
