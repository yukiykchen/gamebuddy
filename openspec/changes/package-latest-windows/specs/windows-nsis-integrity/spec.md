## ADDED Requirements

### Requirement: Packaged NSIS installers remain installable and uninstallable

Windows NSIS setup and uninstall entry points produced for local delivery SHALL launch without the Nullsoft “Installer integrity check has failed” dialog under the supported Windows and 应用宝 Wine environments.

#### Scenario: Uninstaller starts

- **WHEN** a user runs the installed uninstaller after installing a locally built setup package
- **THEN** NSIS proceeds past the integrity check instead of stopping with the integrity-failure dialog
