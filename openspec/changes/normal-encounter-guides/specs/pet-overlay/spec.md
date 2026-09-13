## ADDED Requirements

### Requirement: Normal encounter advice is identified as a small-monster guide
When an encounter guide has `kind` equal to `normal`, the pet overlay MUST label the panel and speech as “小怪攻略”. It MUST show the same usable guide sections and close control as Elite and Boss guides, and its source footer MUST distinguish mechanic-derived advice from reviewed community advice.

#### Scenario: Normal guide opens
- **WHEN** the pet receives a normal encounter guide
- **THEN** the panel heading says “小怪攻略”
- **AND** the pet enters `advising` without introducing a fifth pose

#### Scenario: Mechanic-derived footer
- **WHEN** the normal guide strategy basis is `mechanics`
- **THEN** the footer attributes mechanics and strategy derivation to Spire Codex
- **AND** it does not claim any community source count
