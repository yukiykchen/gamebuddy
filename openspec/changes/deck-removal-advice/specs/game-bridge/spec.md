## ADDED Requirements

### Requirement: Bridge reports the deck card-selection screen for card removal only
The Bridge MUST emit `card.removal.opened` when the game is about to show the deck card-selection screen for a card-removal purpose, and MUST emit `card.removal.closed` when that screen is dismissed. The Bridge MUST NOT emit either event when the same screen is opened for transforming or copying a card. Detection MUST NOT depend on localized display text.

#### Scenario: A removal screen is opened outside a shop
- **WHEN** an event, relic, or rest-site option opens the deck card-selection screen to remove cards
- **THEN** the Bridge emits `card.removal.opened`
- **AND** the payload contains the removable candidate cards, `minSelect`, `maxSelect`, and `cancelable`

#### Scenario: A removal screen is opened from a merchant purchase
- **WHEN** the player buys the card-removal service and the deck card-selection screen appears
- **THEN** the Bridge emits `card.removal.opened` for the same selection
- **AND** the merchant inventory continues to be reported through `shop.updated` unchanged

#### Scenario: The same screen is opened to transform a card
- **WHEN** the deck card-selection screen appears for a transform or copy purpose
- **THEN** the Bridge emits no `card.removal.*` event

#### Scenario: The player confirms or cancels the selection
- **WHEN** the deck card-selection screen closes
- **THEN** the Bridge emits `card.removal.closed`
- **AND** a subsequent `card.removal.closed` without a matching open is not emitted

### Requirement: Removal candidates match the game's own removability rule
The candidate set published by the Bridge MUST be the player's deck filtered by the game's removability rule, which excludes cards carrying the Eternal keyword, further narrowed by any filter the caller supplied. The Bridge MUST NOT publish a candidate the game would not display, and MUST skip publishing entirely when that set is empty or the player's creature is dead.

#### Scenario: Every deck card is Eternal
- **WHEN** no deck card satisfies the removability rule
- **THEN** the Bridge emits no `card.removal.opened`
- **AND** the game shows no selection screen

#### Scenario: A filtered removal offers fewer cards than requested
- **WHEN** the caller requests more removals than the filtered candidate count
- **THEN** the payload reports the actual candidate count alongside the requested `maxSelect`

### Requirement: Screen detection failures degrade silently
If the Bridge cannot resolve the selection screen type, its preference fields, or the candidate list, it MUST skip the event and MUST NOT raise an exception into the game.

#### Scenario: An early-access build moves a field
- **WHEN** reflection cannot read the selection preferences
- **THEN** no `card.removal.*` event is emitted for that selection
- **AND** gameplay is unaffected
