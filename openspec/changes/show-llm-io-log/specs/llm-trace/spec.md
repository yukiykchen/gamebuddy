## Purpose

把每次模型调用的系统提示、完整输入和完整输出留在主窗口里，方便对照建议而不翻终端。

## ADDED Requirements

### Requirement: Main window shows complete LLM input and output
When GameBuddy calls the LLM, the main window SHALL show that call's system prompt, complete user payload, raw model output, and parsed JSON (or a parse/request failure message). The text MUST NOT be truncated for display. The panel MUST remain readable while combat, card-reward, rest, or route views are shown. API keys MUST NOT appear in the shown log.

#### Scenario: Rest-site call is visible
- **WHEN** a rest-site LLM request finishes
- **THEN** the main window log contains the rest-site system prompt
- **AND** the complete rest payload
- **AND** the raw model output
- **AND** the parsed `index` and `reason`

#### Scenario: Key is redacted
- **WHEN** an LLM request is logged
- **THEN** the visible log does not contain the configured API key

### Requirement: Recent LLM logs survive a renderer reload
The main process SHALL keep recent in-memory LLM log entries for the current GameBuddy process and MUST send them to the main window when it finishes loading. Clearing the panel SHALL empty that in-memory list. The log MUST NOT be written to disk.

#### Scenario: Window reload
- **WHEN** the main window reloads after an LLM call in this process
- **THEN** the log panel still shows that call's input and output
