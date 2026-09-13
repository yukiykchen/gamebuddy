## ADDED Requirements

### Requirement: Rest advice ends when the rest choice is finished
GameBuddy SHALL treat rest-site advice as tied to an unfinished rest choice, not to still standing on a RestSite map node. After a rest choice completes (heal, smith, or the rest UI closing), the system MUST NOT keep `rest_site` as the active task solely because `currentNode` is still RestSite.

#### Scenario: Heal then route
- **WHEN** a rest site is open and rest advice is showing
- **AND** the player heals
- **THEN** GameBuddy records that the rest choice finished as `HEAL`
- **AND** if the current node has more than one next step, the next task is `map_route`

#### Scenario: Still on the rest tile after choosing
- **WHEN** the rest choice has closed
- **AND** the run is still on that RestSite coordinate
- **THEN** the published recommendation MUST NOT remain a rest-site heal/smith card solely due to that tile
