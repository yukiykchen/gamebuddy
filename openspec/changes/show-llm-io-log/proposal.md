## Why

每次问模型时，系统提示、完整输入 JSON、原始输出和解析结果已经打到终端，但主窗口只看得到最终建议。查休息处/选牌为什么选这张时，还得翻 Electron 控制台。

## What Changes

- 每次 LLM 请求把完整输入输出推到主窗口：开始元信息、系统提示、user payload、原始输出（含耗时）、解析 JSON 或失败原因。
- 主窗口底部常驻「模型输入 / 输出」面板，可滚动、复制、清空；刷新窗口后仍能看到本进程里最近若干条。
- 日志不得包含 API key。不把全文塞进桌宠。

## Non-goals

- 不代打、不改游戏。
- 不改模型选谁、不把日志送进下一轮 prompt。
- 不做云端上报、不持久化到磁盘（进程退出即清空）。
- 不在桌宠气泡里贴完整 payload。

## Capabilities

### New Capabilities

- `llm-trace`: 把单次 LLM 调用的完整输入输出作为可观察日志，在主窗口展示且不含密钥。

### Modified Capabilities

- （无）桌宠姿态与建议卡行为不变。

## Impact

- `agent/llm/openai.js`：在现有 console 日志之外回调 UI。
- `main.js` / `preload.js`：广播与窗口加载时回放。
- `src/index.html`、`src/styles.css`、`src/renderer.js`：底部日志面板。
- 测试：`harness/validate-agent.js` 断言回调含系统提示、输入、输出且不含 apiKey。
