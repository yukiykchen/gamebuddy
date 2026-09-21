## ADDED Requirements

### Requirement: Advice opens with one actionable sentence
For card reward, map route, rest site, and event choice tasks, the pet overlay MUST initially show only a task label and one concise actionable decision. Detailed reasoning MUST be hidden by default.

#### Scenario: Card reward advice arrives
- **WHEN** a card reward recommendation chooses a card
- **THEN** the collapsed card says to take that exact card
- **AND** reasons, risks, sources, and confidence are not visible until expanded

#### Scenario: Route advice arrives
- **WHEN** a route recommendation chooses a concrete map entrance
- **THEN** the collapsed card identifies that exact entrance
- **AND** route profile comparisons remain available in the hidden detail area

#### Scenario: Skip, rest, or event advice arrives
- **WHEN** the recommendation is skip, heal, smith, or choose an event option
- **THEN** the collapsed card expresses that exact action without requiring the player to read supporting analysis

### Requirement: Advice details use progressive disclosure
The card MUST provide one control that expands or collapses its detailed reasoning. The control MUST expose its state to assistive technology. A newly published recommendation MUST start collapsed even if the previous recommendation was expanded.

#### Scenario: Player requests reasoning
- **WHEN** the player activates “展开理由”
- **THEN** the card reveals reasoning, supporting points, risks, alternatives, source, and confidence that are available for that task
- **AND** the control changes to “收起详情”

#### Scenario: A new recommendation replaces an expanded one
- **WHEN** a new recommendation is published
- **THEN** the new card returns to its collapsed state

### Requirement: Pet window follows advice disclosure state
The Electron pet window MUST use a compact card height while advice details are collapsed and a taller height while details are expanded. It MUST restore compact pet size when the advice is dismissed.

#### Scenario: Detail state changes
- **WHEN** the player expands or collapses advice
- **THEN** the main process resizes the pet window for that state
- **AND** the card remains anchored next to the pet

### Requirement: Advice and encounter guide share a focused visual system
The advice card and encounter guide MUST use one dark surface family, one accent color, a consistent corner-radius rule, and spacing or hairlines instead of nested card grids. State transitions MUST respect reduced-motion preferences.

#### Scenario: Detailed advice is visible
- **WHEN** the player expands a recommendation
- **THEN** the content is presented as a single-column hierarchy
- **AND** advantages, risks, alternatives, and metadata remain distinguishable without separate colored cards
