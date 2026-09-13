## Purpose

确保选牌规则和 LLM 使用实机优先、可追溯且不臆测的卡牌上下文，覆盖升级文本、普通能量、X 费、星费以及数据降级情况。

## ADDED Requirements

### Requirement: Runtime card facts take precedence
The card-reward analysis MUST prefer non-empty runtime descriptions, upgraded state, and runtime costs over catalog values. It MAY fill only missing fields from the matching-version card catalog and MUST retain the source of the effective description and costs.

#### Scenario: Runtime upgraded text differs from catalog
- **WHEN** an upgraded reward provides non-empty runtime text that differs from the catalog
- **THEN** rules and the LLM candidate use the runtime text
- **AND** the payload marks the text source as runtime

#### Scenario: Runtime text is unavailable
- **WHEN** a card snapshot has no runtime description but the catalog has a matching description
- **THEN** the Agent uses the catalog description and marks its source as catalog
- **AND** it does not present the fallback as directly observed from the game

### Requirement: LLM receives complete structured card context
For every reward candidate and owned deck card, the LLM payload MUST include upgraded state, effective effect text, description source, energy amount/X flag, star amount/X flag, and a completeness indicator. Missing values MUST remain explicit, and the system prompt MUST forbid inventing absent effects or costs.

#### Scenario: Reward contains energy, X, and star costs
- **WHEN** a reward set contains cards with numeric energy, X energy, or star costs
- **THEN** each candidate's structured cost object distinguishes those cost types
- **AND** the LLM can identify whether each field came from runtime, catalog fallback, or remains unavailable

#### Scenario: Incomplete card context
- **WHEN** neither runtime data nor the catalog supplies an optional effect or special cost
- **THEN** the LLM payload marks the card context as partial
- **AND** the prompt requires the recommendation reason to avoid asserting the missing value
