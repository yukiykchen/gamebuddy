## Purpose

约束选牌建议何时计算、何时展示：玩家在同一张奖励界面上只看到一次最终建议，而看不到被后续请求覆盖的中间结论。

## ADDED Requirements

### Requirement: One published recommendation per card reward
The system SHALL compute at most one card-reward recommendation for the same offered cards, skip flag, and floor. After that recommendation is published, automatic triggers MUST NOT start another review for the same reward. The published primary choice MUST remain until the reward closes, combat starts, or the player explicitly refreshes.

#### Scenario: Same reward is not asked twice
- **WHEN** a card reward is open and a valid recommendation for those offered cards has already been published
- **AND** another state snapshot, a repeated reward-opened event, or a window reload arrives
- **THEN** the system MUST NOT start another LLM or rules review for that reward
- **AND** the already published recommendation MUST stay the one shown

#### Scenario: Thinking then one final suggestion
- **WHEN** a new card reward opens and a review is still in progress
- **THEN** the UI MAY show thinking
- **AND** it MUST NOT show a card or skip choice that will be replaced by a later review of the same reward
- **AND** after the review finishes, the UI MUST show that single published recommendation

#### Scenario: Next reward can be new
- **WHEN** the current card reward closes or a later floor offers a different card set
- **THEN** the system MUST treat it as a new decision and MAY publish a new recommendation

#### Scenario: Manual refresh is explicit
- **WHEN** the player uses the main-panel refresh control on the same reward
- **THEN** the system MAY compute a replacement recommendation
- **AND** that replacement MUST still be shown as a single current suggestion, not as a sequence of intermediate picks
