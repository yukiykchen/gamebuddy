## ADDED Requirements

### Requirement: Visible card advice stays until the reward ends
Once a card-reward suggestion card is shown for the current reward, the pet MUST keep presenting that same advice until the player closes the card, the reward scene ends, or the player explicitly refreshes. A later automatic review for the same offered cards MUST NOT swap the visible choice.

#### Scenario: Suggestion card is not replaced mid-reward
- **WHEN** the pet is in `advising` with a card-reward suggestion card visible
- **AND** another automatic review for the same reward would produce a different primary choice
- **THEN** the pet MUST keep the already visible suggestion
- **AND** it MUST remain in `advising`
