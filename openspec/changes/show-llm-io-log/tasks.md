## 1. 日志回调

- [x] 1.1 在 `createOpenAiClient` 增加 `onLog`，每次现有 console 日志同步回调完整 `text`（开始、系统提示、输入、原始输出、解析或失败），并抹掉 apiKey。`node harness/validate-agent.js` 覆盖一次 chat 调用含这些阶段且文本不含 key

## 2. 主窗口

- [x] 2.1 `main.js` 环形保存最近日志，经 preload 广播；窗口加载回放；清空 IPC 只清内存。`npm run test:syntax` 通过
- [x] 2.2 主窗口底部只读日志面板展示全文，可复制、可清空，且不随战斗/选牌/路线 `render()` 被清掉

## 3. 验证

- [x] 3.1 运行 `npm run test:syntax` 与 `node harness/validate-agent.js` 并通过
- [ ] 3.2 在 LIVE 休息处或选牌触发一次 LLM 后，主窗口能看到系统提示、完整输入 JSON 和原始输出
