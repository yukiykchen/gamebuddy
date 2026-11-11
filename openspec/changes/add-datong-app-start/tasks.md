## 1. 启动上报

- [x] 1.1 增加大同上报模块，启动后发送一次 `app_start`，失败不抛出。用 `node --test agent/tests/datong-telemetry.test.js` 覆盖载荷和设备标识复用。
- [x] 1.2 在应用启动完成时调用上报，并运行 `npm run test:syntax`。
