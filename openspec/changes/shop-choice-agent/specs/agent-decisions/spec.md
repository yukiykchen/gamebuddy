## ADDED Requirements

### Requirement: Shop advice only recommends legal current actions
The shop Agent MUST derive candidates from the current shop snapshot. Every purchase plan MUST cost no more than the player's current gold and MUST contain only stocked entries with known runtime prices. A save-gold candidate MUST always be available.

#### Scenario: Several items fit within the budget
- **WHEN** two or more current items can be bought together
- **THEN** the Agent compares legal combinations of at most three items
- **AND** the recommendation identifies the complete shopping list, suggested order, total planned spend, and remaining gold

#### Scenario: Nothing is worth its price
- **WHEN** all affordable plans improve the run less than preserving the budget
- **THEN** the primary action is `SAVE_GOLD`
- **AND** the reason names the main opportunity-cost concern

#### Scenario: Player follows the shopping list
- **WHEN** a purchase changes inventory or remaining gold during the same shop visit
- **THEN** the published complete shopping list remains the decision for that visit
- **AND** the Agent does not issue another LLM request or replace the list item by item

### Requirement: Shop advice uses complete strategic context
The Agent MUST evaluate shop items against the complete current deck, owned relics and potions, potion capacity when known, the complete map, the known Boss, known upcoming elites, and the possible elite pool. It MUST distinguish exact encounters from possible pools.

#### Scenario: A purchase counters a known threat
- **WHEN** an item's documented effect addresses a mechanic from an exact upcoming Boss or elite
- **THEN** that fit may raise its score
- **AND** the explanation identifies the encounter as exact

#### Scenario: Only an encounter pool is known
- **WHEN** the map does not identify a specific elite
- **THEN** the Agent may discuss possible elite coverage
- **AND** it MUST NOT claim that a specific elite is guaranteed next

### Requirement: LLM review cannot invent purchases
The LLM MUST receive only legal, rule-generated plans and MUST select one supplied index. Invalid output or request failure MUST fall back to the rule-selected plan.

#### Scenario: LLM returns an invalid plan index
- **WHEN** the selected index does not identify a supplied candidate
- **THEN** the Agent publishes the rule-selected plan
- **AND** no fabricated item or price appears in the recommendation
