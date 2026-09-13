## Purpose

让选牌建议认得出奖励里的升级牌，并且同一屏不会因为升级标记稍后才稳定而改口。

## ADDED Requirements

### Requirement: Upgraded reward cards are judged as upgraded
When a card-reward option is upgraded (`upgraded` true or the shown name ends with `+`), the system MUST evaluate it using the upgraded effect text. Unupgraded community rank MUST NOT be used as sufficient reason to skip that option. The LLM candidate payload MUST include `upgraded`, printed cost, and the upgraded description.

#### Scenario: Momentum Strike plus
- **WHEN** a card reward offers upgraded Momentum Strike (趁势打击+)
- **THEN** the analysis uses the upgraded 13-damage text, not the unupgraded 10-damage text
- **AND** the recommendation MUST NOT treat the unupgraded F-tier summary as the whole reason to SKIP

### Requirement: Same card IDs stay one-shot even if upgrade flags flicker
Two reward-opened events with the same offered card IDs, skip flag, and floor MUST be treated as the same reward. After a recommendation is published, automatic triggers MUST NOT start another review only because `upgraded` changed from false to true.

#### Scenario: Upgrade flag arrives later
- **WHEN** a valid card-reward recommendation has been published for three card IDs
- **AND** a later opened event repeats those IDs with different `upgraded` flags
- **THEN** the system MUST keep the published recommendation
- **AND** it MUST NOT start a second LLM review
