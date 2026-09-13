## ADDED Requirements

### Requirement: Rest overlay closes after the rest choice
When a rest choice finishes, the pet MUST hide the rest suggestion card. A later map-route recommendation MAY then be shown using the existing overlay rules.

#### Scenario: Heal dismisses the rest ticket
- **WHEN** the overlay is showing rest-site advice
- **AND** `rest.closed` is received
- **THEN** the rest suggestion card is hidden
