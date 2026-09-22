## ADDED Requirements

### Requirement: Bridge publishes the current merchant inventory
The Bridge MUST publish every stocked card, relic, and potion offered to the current player with its runtime identity, item type, price, affordability, and effect data. The Bridge MUST publish card-removal service data when available. It MUST NOT substitute catalog price ranges for an unreadable runtime price.

#### Scenario: Player opens a merchant
- **WHEN** the current player enters a merchant room with stocked entries
- **THEN** `gamebuddy.state.v1.shop` contains every stocked entry for that player
- **AND** the Bridge emits `shop.opened` with the same inventory

#### Scenario: Inventory changes after a purchase
- **WHEN** gold, stock, discount, or a restocked item changes
- **THEN** the Bridge emits `shop.updated` with a new deterministic signature

#### Scenario: Player leaves the merchant
- **WHEN** the current player is no longer in a merchant room
- **THEN** the Bridge emits `shop.closed`
- **AND** the next state snapshot has no active shop

### Requirement: Runtime shop prices remain authoritative
An item with an unavailable runtime price MUST remain distinguishable from a free item and MUST NOT be marked affordable solely from catalog data.

#### Scenario: Early Access moves a price field
- **WHEN** the compatibility reader cannot resolve an entry price
- **THEN** the entry price is null
- **AND** downstream agents exclude it from legal purchase plans
