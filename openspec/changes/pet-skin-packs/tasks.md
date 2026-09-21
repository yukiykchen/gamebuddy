## 1. 皮肤包模型

- [ ] 1.1 将当前 GIF 套装迁移到 `src/assets/pets/star-guide/`，添加只含数据的 `pet.json`，并确认四个姿态文件存在
- [ ] 1.2 新增皮肤包注册与校验模块，覆盖完整包、缺姿态、越界路径、远程 URL 和 CSS 回退测试

## 2. 主进程管理

- [ ] 2.1 启动时加载有效皮肤包并读取 `userData/pet-preferences.json`，验证无效偏好回退默认包
- [ ] 2.2 扩展桌宠右键菜单为“切换形象”单选子菜单，切换后保存偏好并广播当前 pack
- [ ] 2.3 增加只读皮肤列表/当前选择 IPC 和选择 IPC，验证 renderer 无文件系统权限

## 3. Renderer 切换

- [ ] 3.1 扩展 `pet-sprite` 为 `setPack()`，切换 pack 后保持当前 pose 并继续播放对应 GIF
- [ ] 3.2 `pet.js` 接收初始 pack 与切换广播，验证建议卡、状态条、拖拽和点击行为不被重置
- [ ] 3.3 图片加载失败时上报主进程并回退默认或 CSS pack，验证桌宠不会空白

## 4. 文档与验证

- [ ] 4.1 README 增加新增皮肤包目录、manifest 字段和四态资源命名说明
- [ ] 4.2 运行 `npm run test:syntax`、皮肤包校验测试和 `npm run harness:validate-all`
- [ ] 4.3 在 Electron Demo 中切换两套 pack，重启后确认选择保留，并验证 waiting/watching/thinking/advising 四态
