## Purpose

删牌相关的建议只能落在游戏里真的删得掉的牌上，事件与商店都要遵守同一条合法性判断。

## ADDED Requirements

### Requirement: Removal advice never targets Eternal cards
Card-removal advice MUST exclude cards whose keyword set contains the game's `Eternal` keyword, and MUST identify them by the keyword enum key rather than localized keyword text.

#### Scenario: Greed is the best-value removal candidate
- **WHEN** the deck contains an Eternal curse that would otherwise score highest for removal
- **THEN** the removal target is a removable card instead
- **AND** the Eternal card is not named in the advice

#### Scenario: Every card in the deck is Eternal
- **WHEN** no card in the deck can be removed
- **THEN** the removal service is not offered as part of any purchase plan
- **AND** the advice states that the deck's cards cannot be removed

#### Scenario: Advice is produced for a non-English client
- **WHEN** the catalog stores the keyword text in a language other than Chinese
- **THEN** the same cards are still excluded, because the decision uses the keyword enum key

### Requirement: Event removal effects are scored by removable count
An event option that removes N cards MUST be scored using the number of cards actually removable from the deck, and MUST NOT receive the removal bonus when nothing can be removed.

#### Scenario: Deck has fewer removable cards than offered
- **WHEN** an event offers to remove 2 cards and only 1 card in the deck is removable
- **THEN** the option is scored for 1 removable card

#### Scenario: Deck is unknown
- **WHEN** the deck cannot be read from the state
- **THEN** the option keeps its previous score
