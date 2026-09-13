## ADDED Requirements

### Requirement: Advice panels read as compact tickets
When a card-reward, rest-site, or encounter-guide panel is visible beside the pet, that panel MUST look like a short ticket: a type mark, a title, at most three short reason lines in the overlay, and at most two point groups. The full analysis MAY remain in the main window. The ticket MUST NOT cover the pet body. Closing, dragging, and clicking the pet to open the main window MUST still work.

#### Scenario: Rest ticket stays short
- **WHEN** a rest-site upgrade recommendation is shown on the overlay
- **THEN** the overlay title names the upgrade
- **AND** the overlay reason is truncated to at most three lines
- **AND** the pet body remains visible to the right of the ticket

#### Scenario: Card-reward ticket stays short
- **WHEN** a card-reward take recommendation is shown on the overlay
- **THEN** the overlay title names the card
- **AND** the overlay does not render the full main-window analysis block

### Requirement: Overlay status is a floor strip not browser chrome
The pet status control SHALL sit as a small floor strip under the character, showing live/waiting, pose, and this-run SL when known. It MUST NOT use a wide bordered chip that reads as a browser or IDE status bar.

#### Scenario: SL remains on the strip
- **WHEN** this-run SL is 2 and the overlay is live
- **THEN** the floor strip still shows `SL 2`
