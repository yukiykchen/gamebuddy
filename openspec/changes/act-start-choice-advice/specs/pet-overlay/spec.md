## ADDED Requirements

### Requirement: Event and act-start advice uses the suggestion card
When an `event_choice` recommendation is published, the pet overlay MUST show the existing suggestion card (not only a speech bubble) with the recommended option label, the reason, and short alternative labels. The speech bubble MUST stay a short sentence such as suggesting that option. Thinking copy for `event_choice` MUST say the companion is analyzing event options, not routing the map.

#### Scenario: Ancient relic advice card
- **WHEN** an `event_choice` recommendation for an act-start relic is published
- **THEN** the suggestion card becomes visible with that relic name
- **AND** the pet pose is `advising`

#### Scenario: Thinking before event advice
- **WHEN** an LLM review for `event_choice` is in flight
- **AND** no suggestion card is visible yet
- **THEN** the speech indicates event-option analysis rather than map routing

### Requirement: Event card clears when the event choice ends
The event suggestion card MUST close when `event.closed`, `map.opened`, `combat.started`, or `card.reward.opened` arrives after that advice. A stale `map.opened` from before the event MUST NOT keep a map-routing thinking line while event options are on screen.

#### Scenario: Choice finished
- **WHEN** the event suggestion card is visible
- **AND** `event.closed` is received
- **THEN** the suggestion card is hidden
