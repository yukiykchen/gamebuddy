## Why

桌宠目前把四个姿态硬编码在 `src/pet.css` 的 CSS 形状和动画里。设计师已提供四组透明 GIF 姿态动画，直接替换会继续耦合到现有 DOM 结构，后续更换资源、调整帧数或增加状态都要再改渲染层。

## What Changes

- 新增桌宠姿态渲染抽象：每个姿态由渲染器生成可见角色，初始支持 CSS renderer 和 image renderer。
- 默认 GIF 姿态动画按 `waiting`、`watching`、`thinking`、`advising` 映射，并作为应用资源打包。
- 姿态状态机、气泡、状态条、建议卡和 IPC 保持不变。
- 渲染配置集中声明，后续可以无业务改动地扩展多帧图集、每态帧数、播放速度或替换渲染器。

## Non-goals

- 不接入 Codex 桌宠的 8x11 v2 图集格式。
- 不新增第五姿态，不改变 Agent 推荐和窗口交互。
- 不实现自定义时间轴；GIF 使用浏览器原生播放，本次建立可扩展的接入边界。

## Capabilities

### Modified Capabilities

- `pet-overlay`: 桌宠角色可见层支持可配置渲染器，GIF 姿态动画可作为当前实现。

## Impact

- 新增 `src/pet-sprite/` 配置与渲染器，以及 `src/assets/pet/` 四组 GIF。
- `src/pet.html`、`src/pet.js`、`src/pet.css` 仅消费统一渲染容器和配置。
- 不改 `main.js`、IPC、Agent、协议和窗口尺寸。
- 验证：`npm run test:syntax`、Electron Demo 四态检查。
