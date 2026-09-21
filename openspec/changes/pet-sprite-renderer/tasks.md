## 1. Renderer boundary

- [x] 1.1 新增 `src/pet-sprite/index.js`：集中声明 renderer kind、GIF 资源映射和 `createPetSprite()` 工厂
- [x] 1.2 实现 CSS renderer，保留现有姿态形态作为回退
- [x] 1.3 实现 image renderer，为当前 pose 加载或切换透明 GIF

## 2. Static assets

- [x] 2.1 把四组 640×640、4 帧透明 GIF 按 `1=waiting`、`2=thinking`、`3=watching`、`4=advising` 映射，并统一命名为 `cujun-<pose>.gif`
- [x] 2.2 将资产纳入 `src/assets/pet/`，确认打包与相对路径可访问

## 3. Integration

- [x] 3.1 `pet.html` 提供统一 sprite 容器，保留状态条、气泡和建议卡
- [x] 3.2 `pet.js` 用 `createPetSprite(...).setPose()` 替换对 stage pose 的直接视觉依赖；状态机仍维护现有四个 pose
- [x] 3.3 `pet.css` 增加渲染容器与 GIF 安全区样式，保留现有 CSS renderer 样式

## 4. Validation

- [x] 4.1 运行 `npm run test:syntax`
- [x] 4.2 用 Electron 验证新 GIF 可见、气泡、状态条和主窗口正常
