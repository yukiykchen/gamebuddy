# Design

移除 `harness/sl-stats.js`，主进程不再根据连接边沿推断读档行为，也不再写入 `userData/sl-stats.json`。`currentObservation()` 恢复为只包含 Observation 与决策结果，不携带 `slStats`。

渲染进程和桌宠删除 `bridge-sl-stats` 订阅、计数状态与台词队列。已有用户目录中的旧 `sl-stats.json` 不再读取；应用不主动删除该历史文件，避免升级过程执行额外破坏性操作。
