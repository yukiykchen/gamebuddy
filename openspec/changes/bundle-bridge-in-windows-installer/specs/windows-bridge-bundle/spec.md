## ADDED Requirements

### Requirement: Setup packages the precompiled Bridge

The Windows NSIS Setup artifact SHALL include the precompiled GameBuddy Bridge files (`gamebuddy_bridge.dll` and `GameBuddyBridge.json`) alongside the desktop application so a separate Bridge ZIP is not required for the default install path.

#### Scenario: Bridge files are present after desktop install

- **WHEN** a user completes a normal interactive Setup installation
- **THEN** the installed GameBuddy directory contains the Bridge files under its resources bridge folder

### Requirement: Interactive install copies Bridge into a user-chosen game directory

During an interactive (non-silent) Setup, after the desktop files are installed, the installer SHALL prompt the user to choose the Slay the Spire 2 game root directory. When the chosen directory is valid, the installer SHALL copy the bundled Bridge files into `mods\GameBuddyBridge` under that root, creating `mods` if needed.

#### Scenario: User selects a valid game root

- **WHEN** the user selects a directory that contains `SlayTheSpire2.exe` or `data_sts2_windows_x86_64`
- **THEN** the installer writes `gamebuddy_bridge.dll` and `GameBuddyBridge.json` to `<chosen>\mods\GameBuddyBridge`

#### Scenario: User skips or cancels the folder dialog

- **WHEN** the user cancels the folder dialog or chooses to skip Bridge installation
- **THEN** the desktop application installation remains successful and the installer does not fail the overall Setup

### Requirement: Invalid game directory is rejected without failing Setup

If the selected directory is not a valid Slay the Spire 2 root, the installer SHALL NOT copy Bridge files into that directory as if it were valid, and SHALL allow the user to retry or skip without rolling back the desktop install.

#### Scenario: Invalid folder selected

- **WHEN** the user selects a directory that lacks both `SlayTheSpire2.exe` and `data_sts2_windows_x86_64`
- **THEN** the installer refuses that copy target and offers retry or skip

### Requirement: Silent install does not block on Bridge

A silent Setup (`/S`) SHALL install the desktop application without showing the Bridge folder dialog.

#### Scenario: Silent Setup

- **WHEN** Setup runs with `/S`
- **THEN** the installer does not present the Bridge directory picker and completes the desktop installation
