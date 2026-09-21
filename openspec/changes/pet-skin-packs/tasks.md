## 1. 皮肤包模型

- [ ] 1.1 将当前 GIF 套装迁移到 `src/assets/pets/ironclad/`，添加只含数据的 `pet.json`，并确认四个姿态文件存在
- [ ] 1.2 为 `silent`、`regent`、`necrobinder`、`defect` 各建立皮肤目录和 `pet.json`，从 Downloads 1-20 按顺序填充四态 GIF
- [ ] 1.3 新增皮肤包注册与校验模块，覆盖完整包、缺姿态、越界路径、远程 URL、角色绑定和 CSS 回退测试

## 2. 主进程管理

- [ ] 2.1 启动时加载有效皮肤包并读取 `userData/pet-preferences.json`，支持自动/手动模式，验证无效偏好回退默认包
- [ ] 2.2 扩展桌宠右键菜单为“切换形象”子菜单，提供自动模式和五个角色皮肤，切换后保存偏好并广播当前 pack
- [ ] 2.3 在真实状态中解析 `run.character`，自动模式按角色绑定切换，并广播皮肤
- [ ] 2.4 增加只读皮肤列表/当前选择 IPC 和选择 IPC，验证 renderer 无文件系统权限

## 3. Renderer 切换

- [ ] 3.1 扩展 `pet-sprite` 为 `setPack()`，切换 pack 后保持当前 pose 并继续播放对应 GIF
- [ ] 3.2 `pet.js` 接收初始 pack 与切换广播，验证建议卡、状态条、拖拽和点击行为不被重置
- [ ] 3.3 图片加载失败时上报主进程并回退默认或 CSS pack，验证桌宠不会空白

## 4. 文档与验证

- [ ] 4.1 README 增加角色皮肤包目录、manifest 字段、角色绑定和自动模式说明
- [ ] 4.2 运行 `npm run test:syntax`、皮肤包校验测试和 `npm run harness:validate-all`
- [ ] 4.3 在 Electron Demo 中验证自动模式随角色切换，切换手动皮肤后重启保留，并验证四态
