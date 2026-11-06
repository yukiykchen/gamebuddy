## ADDED Requirements

### Requirement: Card removal advice names concrete cards
When a `card.removal.opened` event is present, the Agent MUST recommend specific cards drawn from the published candidate set and MUST NOT fall back to route advice for that decision. The recommendation MUST name each suggested card and give the reason in terms of the current deck.

#### Scenario: Removal offered while a shop is still open
- **WHEN** the player buys the card-removal service and the selection screen appears
- **THEN** the active task is `card_removal`, not `shop_choice` or `map_route`
- **AND** the advice states which card to remove

#### Scenario: Removal offered by an event
- **WHEN** an event option opens the removal selection
- **THEN** the advice names the removable card instead of emitting a map route recommendation

#### Scenario: Removal offered by a relic that takes several cards
- **WHEN** `maxSelect` is greater than one
- **THEN** the advice lists the top N candidates in recommendation order

### Requirement: Recommended count follows the selection size
The Agent MUST recommend `min(maxSelect, candidate count)` cards. It MUST NOT recommend more cards than the candidate set contains, and MUST NOT recommend fewer when more are required and available.

#### Scenario: Fewer removable cards than requested
- **WHEN** the caller requests five removals but only three cards are removable
- **THEN** the advice lists those three cards
- **AND** the reason notes that fewer cards are available than requested

### Requirement: One recommendation per removal selection
The Agent MUST publish at most one final recommendation per distinct removal selection, identified by the candidate set and the requested count. Repeated snapshots of the same selection MUST NOT trigger a new model request or replace a published recommendation.

#### Scenario: The same selection is reported twice
- **WHEN** `card.removal.opened` repeats with an identical signature
- **THEN** the Agent reuses the already published recommendation

#### Scenario: The selection closes
- **WHEN** `card.removal.closed` arrives
- **THEN** the active recommendation is cleared
- **AND** any unfinished model request for that selection is cancelled

### Requirement: Advice degrades when nothing is removable
When the candidate set is empty or unreadable, the Agent MUST NOT invent a card name. It MUST either stay silent or state that no card in the deck can be removed.

#### Scenario: Deck state is unavailable
- **WHEN** the Agent cannot read the published candidates
- **THEN** no specific card is named
