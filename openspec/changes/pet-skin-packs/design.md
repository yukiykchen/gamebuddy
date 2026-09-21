## Context

见 `proposal.md`。当前 `src/pet-sprite/index.js` 已把姿态状态机和 image/CSS renderer 分离，但默认 pack 仍在 renderer 文件内硬编码。游戏状态使用 `run.character`，对应 `ironclad`、`silent`、`regent`、`necrobinder`、`defect`。Electron 主进程已有桌宠右键菜单和 `app.getPath('userData')` 可用于偏好存储。

## Goals / Non-Goals

**Goals:**

- 用数据清单描述皮肤，状态机和 renderer 不感知具体皮肤名称。
- 角色绑定是皮肤清单中的稳定字符串，不在业务代码里写中文角色判断。
- 主进程作为可用皮肤和持久化选择的唯一来源。
- 切换只更新视觉，不重建窗口、不清空建议、不触发 Agent。
- 资源错误不阻塞桌宠启动。

**Non-Goals:**

- 不在运行时扫描用户任意目录。
- 不允许 pack 携带 JavaScript 或远程 URL。
- 不改变 GIF 自带帧率。
- 不把未知角色或缺失角色当作错误。

## Decisions

### 1. 每包目录 + manifest

内置资源按 `src/assets/pets/<pack-id>/` 组织，每包提供 `pet.json` 和四个姿态文件。`pet.json` 只允许本目录相对路径；清单字段为 `id`、`displayName`、`renderer`、`poses`、可选 `character`。

备选：单个根 JSON 列出全部皮肤。否决：新增或删除一套时需修改共享文件，容易产生冲突，也不利于未来外部 pack 校验。

### 2. 自动与手动模式并存

偏好文件只存 `mode` 和可选 `skinId`。`mode: "auto"` 时按 `run.character` 选择；`mode: "manual"` 时固定 `skinId`。主进程在每次真实状态中收到 `run.character` 后广播当前有效 skin，但菜单中的手动选择会覆盖自动结果并写回偏好。

备选：每次角色变化直接覆盖保存值。否决：用户明确选过皮肤后不应被游戏角色悄悄改掉。

### 3. 构建时注册表，启动时校验

仓库内维护一个不含业务逻辑的 pack id 列表；主进程读取对应 manifest，用 `path.resolve` 校验资源仍位于 pack 目录并存在。通过 IPC 只发送经过校验的显示配置，不把文件系统能力暴露给 renderer。

备选：renderer 自己读取目录。否决：`contextIsolation` 下不应给页面文件系统权限，且主进程菜单也需要相同清单。

### 4. 主进程持久化与广播

选择保存到 `userData/pet-preferences.json`，包含 `mode` 与可选 `skinId`。切换时主进程更新文件并广播 `bridge-pet-skin`；renderer 调用既有 `setPack()` 后用当前 pose 重绘。写入失败不影响本次内存切换。

### 5. 默认与回退

当前角色套装作为内置皮肤；默认绑定 `ironclad`。另提供 `classic-css` 内置回退，不依赖图片文件。保存项失效、manifest 无效或图片加载失败时回退到默认；默认也失效时回退 CSS。

## Risks / Trade-offs

- [内置列表仍需登记 pack id] → 新增 pack 只改单行注册和独立目录，避免运行时任意目录安全面。
- [角色字段未来改名] → 映射集中在 manifest，主进程只按稳定字段匹配，未知值不报错。
- [GIF 加载失败发生在 renderer] → renderer 上报失败，主进程选择下一个可靠回退并更新菜单状态。
- [偏好文件损坏] → 解析失败按空偏好处理，不覆盖资源。

## Migration Plan

把当前 `src/assets/pet/*.gif` 整理进五个角色皮肤目录并生成 manifest；首次启动无偏好时进入自动模式，默认使用 `ironclad`。回滚时仍可把 renderer 固定到单一 pack。
