## Purpose

让 GameBuddy 能发现、校验并保存多套桌宠视觉资源，使用户无需改代码或覆盖现有文件即可在多个完整四态皮肤之间切换，并让皮肤按当前游戏角色自动匹配。

## ADDED Requirements

### Requirement: Skin packs declare all required poses
Each selectable pet skin pack SHALL have a stable id, display name, renderer kind, and resources for `waiting`, `watching`, `thinking`, and `advising`. A pack missing any required pose or referencing a missing local asset MUST NOT appear as selectable.

A skin pack MAY declare one supported game character. Character bindings MUST use stable `run.character` values and MUST NOT be derived from display names.

#### Scenario: Complete GIF pack is discovered
- **WHEN** a local skin pack declares all four poses and every referenced GIF exists
- **THEN** the pack appears in the available skin list with its display name

#### Scenario: Incomplete pack is ignored
- **WHEN** a skin pack omits `thinking` or references a missing file
- **THEN** the pack is excluded from the available skin list
- **AND** the currently active pet remains usable

#### Scenario: Character-bound pack is discovered
- **WHEN** a valid skin pack declares `character: "defect"`
- **THEN** the skin registry records that pack as the defect character skin
- **AND** the display name remains available for manual selection

### Requirement: Skin follows the current game character
When automatic skin selection is enabled and a valid `run.character` is present, the application SHALL select the skin bound to that character. A missing or unbound character MUST keep the current or default skin and MUST NOT prevent the pet from rendering.

#### Scenario: Character changes mid-run
- **WHEN** the bridge reports a new `run.character` that has a bound skin
- **THEN** the visible pet switches to that character skin
- **AND** the current pose and open advice panel remain unchanged

#### Scenario: Character has no skin
- **WHEN** the bridge reports an unbound `run.character`
- **THEN** the current skin remains active
- **AND** no invalid pack id is selected

### Requirement: Selected skin persists across launches
The application SHALL save the selected skin id in local application preferences and restore it on the next launch. A stored manual selection SHALL take priority over automatic character matching until the user clears it. If the saved id is no longer available, the application MUST use the declared default skin.

#### Scenario: Selection survives restart
- **WHEN** the user selects a valid skin and restarts GameBuddy
- **THEN** the same skin is active after startup

#### Scenario: Automatic selection does not overwrite manual choice
- **WHEN** a manual skin is stored
- **AND** the game later reports a character with a different bound skin
- **THEN** the manual skin remains active

#### Scenario: Saved skin is removed
- **WHEN** the saved skin id no longer exists at startup
- **THEN** the default skin becomes active without preventing the pet window from opening

### Requirement: Skin resources remain local and declarative
Skin discovery SHALL read local manifests and image assets only. A skin pack MUST NOT execute code, fetch remote assets, or modify game state.

#### Scenario: Manifest contains unsupported values
- **WHEN** a manifest requests a remote URL or unsupported renderer kind
- **THEN** the pack is rejected and no remote request or script execution occurs
