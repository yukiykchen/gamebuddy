## ADDED Requirements

### Requirement: Out-of-combat LLM prompts use energy per turn
When GameBuddy asks the LLM to review a card reward or rest site, the prompt payload MUST include the player's energy per turn (`maxEnergy`) and MUST NOT include leftover combat `energy`. The card-reward system prompt MUST tell the model to judge playability by energy per turn, not leftover energy from the previous fight.

#### Scenario: Leftover 2 energy does not become a 2-energy run
- **WHEN** a card-reward review starts and the live snapshot has `energy` 2 and `maxEnergy` 3
- **THEN** the LLM user payload reports energy per turn as 3
- **AND** it does not include a field that presents 2 as the run's energy

#### Scenario: Rest site uses the same rule
- **WHEN** a rest-site review starts with leftover combat energy below max energy
- **THEN** the LLM payload still reports energy per turn as max energy
- **AND** it does not include leftover combat energy as `energy`
