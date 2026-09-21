## Purpose

让 GameBuddy 能发现、校验并保存多套桌宠视觉资源，使用户无需改代码或覆盖现有文件即可在多个完整四态皮肤之间切换。

## ADDED Requirements

### Requirement: Skin packs declare all required poses
Each selectable pet skin pack SHALL have a stable id, display name, renderer kind, and resources for `waiting`, `watching`, `thinking`, and `advising`. A pack missing any required pose or referencing a missing local asset MUST NOT appear as selectable.

#### Scenario: Complete GIF pack is discovered
- **WHEN** a local skin pack declares all four poses and every referenced GIF exists
- **THEN** the pack appears in the available skin list with its display name

#### Scenario: Incomplete pack is ignored
- **WHEN** a skin pack omits `thinking` or references a missing file
- **THEN** the pack is excluded from the available skin list
- **AND** the currently active pet remains usable

### Requirement: Selected skin persists across launches
The application SHALL save the selected skin id in local application preferences and restore it on the next launch. If the saved id is no longer available, the application MUST use the declared default skin.

#### Scenario: Selection survives restart
- **WHEN** the user selects a valid skin and restarts GameBuddy
- **THEN** the same skin is active after startup

#### Scenario: Saved skin is removed
- **WHEN** the saved skin id no longer exists at startup
- **THEN** the default skin becomes active without preventing the pet window from opening

### Requirement: Skin resources remain local and declarative
Skin discovery SHALL read local manifests and image assets only. A skin pack MUST NOT execute code, fetch remote assets, or modify game state.

#### Scenario: Manifest contains unsupported values
- **WHEN** a manifest requests a remote URL or unsupported renderer kind
- **THEN** the pack is rejected and no remote request or script execution occurs
