## Context

现有 `.pet-body` 和 `.pet-stage[data-pose]` 是单一实现。设计师输入是四组 640×640、每组 4 帧且带透明通道的 GIF，可由 Electron 原生播放。

## Goals / Non-Goals

**Goals:**

- 状态机只负责产出 pose 名称。
- Sprite registry 只声明 pose 到资源的映射。
- Renderer factory 根据 kind 创建渲染实例，隐藏 CSS 或图片实现。
- 后续多帧动画只需新增 renderer 或扩展静态资源配置。

**Non-Goals:**

- 不把协议推荐字段当作视觉姿态来源。
- 不引入图片处理或动画依赖。

## Decisions

### 1. Registry + renderer factory

`pet-sprite` 是浏览器端纯模块，导出 `createPetSprite(root, config)`。配置声明 `renderer: "css" | "image"`、`poses` 与每态 `image`。Image renderer 负责插入一张 `<img>`，浏览器原生播放 GIF；CSS renderer 保留现有形状实现作为回退。容器 class 由 renderer 管理，`pet.js` 只调用 `setPose()`。

备选：直接替换 `.pet-body` 为 `<img>`。否决：会把资产路径、缩放和姿态条件继续散落在 CSS 选择器里，后续动画接入成本更高。

### 2. GIF 资源原样接入

四组 640×640 GIF 保留原帧率与透明通道，运行时缩放到约 192px。资源统一以 `cujun-<pose>.gif` 命名；设计源文件顺序为 `1=waiting`、`2=thinking`、`3=watching`、`4=advising`。后续优化体积时只替换 registry 中的资源，不改状态机。

### 3. 渐进替换

默认使用 `image`。保留 CSS renderer 和原 DOM 作为可配置回退；等确认视觉后，再删除旧形状。窗口尺寸和建议卡布局不变。

## Risks / Trade-offs

- [GIF 帧率不可由应用逐帧控制] → Image renderer 隔离资源细节，后续可增加 sprite-sheet renderer。
- [GIF 体积高于静态图] → 四组总计约 1 MB，可接受；后续可无业务改动替换成 WebP 或图集。

## Migration Plan

先新增渲染器和资产，再把 `pet.js` 的姿态应用入口切到 `setPose()`。回滚只需把 renderer 改回 `css` 或还原 `pet.js`。

## Open Questions

无。
