## ADDED Requirements

### Requirement: Pet appearance can be switched at runtime
The pet overlay SHALL offer an appearance selector in its context menu when at least one valid skin pack is available. Selecting a different pack MUST update the visible pet immediately while preserving the current pose, speech, advice panel, status strip, drag behavior, and click-to-open behavior.

#### Scenario: User switches skin while watching
- **WHEN** the pet is in `watching` and the user selects another skin from the context menu
- **THEN** the newly selected skin displays its `watching` animation immediately
- **AND** the live status and other overlay controls remain unchanged

#### Scenario: User switches skin while advice is open
- **WHEN** the pet is in `advising` with an advice ticket visible and the user selects another skin
- **THEN** the new skin displays its `advising` animation
- **AND** the existing advice ticket remains visible and closable

### Requirement: Skin selector identifies the current choice
The appearance selector SHALL show all valid skin display names and MUST mark exactly one active skin.

#### Scenario: Context menu opens
- **WHEN** the user opens the pet context menu
- **THEN** the appearance submenu lists each valid skin
- **AND** exactly the active skin is checked
