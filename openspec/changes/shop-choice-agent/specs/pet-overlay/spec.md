## ADDED Requirements

### Requirement: Shop advice opens with the complete shopping list
The pet overlay MUST reduce a shop recommendation to one sentence that names every recommended purchase for the current visit. Detailed budget and strategic analysis MUST remain behind the existing disclosure control.

#### Scenario: Several items are recommended
- **WHEN** the shop Agent recommends a purchase plan
- **THEN** the collapsed card names every item and card-removal action in the plan
- **AND** the expanded detail shows suggested order, planned spend, remaining gold, benefits, risks, and threat fit

#### Scenario: Card removal is the first priority
- **WHEN** the plan starts with card removal
- **THEN** the collapsed card names the exact card to remove

#### Scenario: Saving gold is preferred
- **WHEN** the primary action is `SAVE_GOLD`
- **THEN** the collapsed card says to buy nothing and preserve gold

### Requirement: Shop advice follows shop lifecycle
The pet MUST clear shop thinking and advice when the shop closes. Inventory updates during the same visit MUST NOT trigger another decision or hide the original complete shopping list.

#### Scenario: Player purchases an item
- **WHEN** the Bridge publishes an updated shop snapshot
- **THEN** the original shopping list remains visible
- **AND** no new shop LLM request is started
