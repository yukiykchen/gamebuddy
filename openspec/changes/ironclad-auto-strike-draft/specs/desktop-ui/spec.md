## ADDED Requirements

### Requirement: Reward cards display only their auto-strike delta
When an Ironclad reward candidate has an `archetypeImpact`, the card-reward panel SHALL show the candidate's auto-strike inclination change above that card's name. It MUST NOT add a current-deck inclination percentage, a formation stage, or a needed-card list. Cards without a reliable impact MUST NOT display a guessed percentage.

#### Scenario: Three offered cards
- **WHEN** three Ironclad cards are offered and their impacts are available
- **THEN** each card displays its own signed auto-strike percentage-point change
- **AND** the existing first-choice and SKIP recommendation remains visible

#### Scenario: Reward opens before recommendation finishes
- **WHEN** the bridge sends an Ironclad card reward while the recommendation is still pending
- **THEN** each recognizable offered card displays its own auto-strike change immediately
- **AND** a prior reward's recommendation is not shown for the new offer
