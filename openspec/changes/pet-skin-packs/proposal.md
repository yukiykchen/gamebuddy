## Why

桌宠渲染器已经能按四个姿态播放 GIF，但资源映射仍固定在代码中。用户拥有多套 GIF 时需要改文件或覆盖资源，无法在应用内安全切换，也不能保留上次选择。

## What Changes

- 新增桌宠皮肤包约定：每套皮肤使用独立目录和清单，声明名称、渲染类型以及四个必需姿态资源。
- 将当前五套角色 GIF 建为皮肤包，并声明角色绑定：`ironclad` 战士、`silent` 静默猎手、`regent` 储君、`necrobinder` 亡灵契约师、`defect` 故障机器人。
- 启动时发现并校验内置皮肤包；无效或缺帧的皮肤不进入可选列表。
- 桌宠右键菜单新增“切换形象”子菜单，选择后立即替换当前形象，不改变姿态状态机。
- 收到真实游戏状态后，若皮肤未手动锁定，则按 `run.character` 自动选择对应皮肤；角色变化时立即切换。
- 将所选皮肤持久化到 Electron `userData`；重启后恢复，资源失效时回退到默认皮肤。
- 对渲染器增加运行时 `setPack()` 边界，后续加入更多 GIF、WebP 或图集无需修改业务状态代码。

## Non-goals

- 不提供应用内导入、删除或编辑文件的文件选择器。
- 不下载远程皮肤，不执行皮肤包脚本。
- 不新增姿态，不改变 Agent、协议、Mod，也不自动操作或修改游戏。

## Capabilities

### New Capabilities

- `pet-skin-packs`: 定义皮肤包发现、校验、切换、持久化和回退行为。

### Modified Capabilities

- `pet-overlay`: 桌宠右键菜单可切换当前形象，姿态和现有交互保持有效。
- `pet-skin-packs`: 皮肤包可绑定一个游戏角色，角色切换可触发自动换肤。

## Impact

- `main.js`、`preload.js`：皮肤包发现、菜单、IPC 和持久化。
- `src/pet-sprite/`、`src/pet.js`：运行时换包接口与状态同步。
- `src/assets/pets/`：按目录组织多套皮肤及清单。
- 不引入新依赖；验证使用语法测试、单元级清单校验和 Electron Demo。
