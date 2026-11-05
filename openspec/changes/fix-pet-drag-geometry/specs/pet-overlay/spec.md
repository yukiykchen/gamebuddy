## Purpose

桌宠窗口在拖拽过程中必须保持当前模式规定的尺寸，位置和大小都不因系统缩放而漂移。

## ADDED Requirements

### Requirement: Dragging keeps the pet window size
While the user drags the pet, the window size MUST stay at the target size of the current mode, at any Windows display scale factor. Moving the window MUST NOT change its size.

#### Scenario: Repeated small drags at 150% scaling
- **WHEN** the user drags the pet back and forth for hundreds of pointer frames at a scale factor other than 100%
- **THEN** the window size stays at the mode target within one device pixel
- **AND** the character and the guide panel keep their relative positions

#### Scenario: A previously inflated window is dragged again
- **WHEN** the window was inflated by an earlier build and the user drags it again
- **THEN** the next drag restores the mode target size

### Requirement: Dragging never raises a main-process error
Dragging the pet MUST NOT raise an uncaught `TypeError` from the window-positioning call, including when the computed coordinate rounds to negative zero.

#### Scenario: Pointer delta lands in [-0.5, 0)
- **WHEN** a drag frame computes a coordinate in the range [-0.5, 0)
- **THEN** the window moves without an error dialog
