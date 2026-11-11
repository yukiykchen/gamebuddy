## ADDED Requirements

### Requirement: Closing the pet exits the application

Choosing the pet context-menu exit action SHALL quit the GameBuddy process, including the main window, danmaku overlay, tray, and background timers. The action MUST NOT only hide the pet window.

#### Scenario: Pet exit menu stops the process

- **WHEN** the user chooses the pet context-menu exit action
- **THEN** the application begins a normal quit and does not keep running in the background
