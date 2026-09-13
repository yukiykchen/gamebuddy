## ADDED Requirements

### Requirement: Rest advice uses the suggestion card
When a rest-site recommendation is presented, the pet MUST show it in the same left-side suggestion card used for card rewards: title, reason, supporting points, source/confidence, and a close control. The speech bubble MUST only contain a short action line such as the recommended heal or upgrade. It MUST NOT tell the player that the reason is on the left, and MUST NOT place the full rest reason into the speech bubble.

#### Scenario: Upgrade advice opens the card
- **WHEN** a rest-site recommendation to smith a card is published
- **THEN** the suggestion card becomes visible with that upgrade as the title
- **AND** the full reason appears in the card body
- **AND** the speech bubble stays short enough not to cover the pet body with the full reason

#### Scenario: Heal advice opens the card
- **WHEN** a rest-site recommendation to heal is published
- **THEN** the suggestion card becomes visible with a heal title
- **AND** the full reason appears in the card body rather than the speech bubble

#### Scenario: Closing rest advice
- **WHEN** the player closes the rest suggestion card, the rest scene ends, combat starts, or the map opens
- **THEN** the suggestion card is hidden
- **AND** the pet leaves `advising` unless another advice panel is still visible
