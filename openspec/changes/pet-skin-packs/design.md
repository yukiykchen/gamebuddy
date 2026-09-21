## Context

见 `proposal.md`。当前 `src/pet-sprite/index.js` 已把姿态状态机和 image/CSS renderer 分离，但默认 pack 仍在 renderer 文件内硬编码。Electron 主进程已有桌宠右键菜单和 `app.getPath('userData')` 可用于偏好存储。

## Goals / Non-Goals

**Goals:**

- 用数据清单描述皮肤，状态机和 renderer 不感知具体皮肤名称。
- 主进程作为可用皮肤和持久化选择的唯一来源。
- 切换只更新视觉，不重建窗口、不清空建议、不触发 Agent。
- 资源错误不阻塞桌宠启动。

**Non-Goals:**

- 不在运行时扫描用户任意目录。
- 不允许 pack 携带 JavaScript 或远程 URL。
- 不改变 GIF 自带帧率。

## Decisions

### 1. 每包目录 + manifest

内置资源按 `src/assets/pets/<pack-id>/` 组织，每包提供 `pet.json` 和四个姿态文件。`pet.json` 只允许本目录相对路径；清单字段为 `id`、`displayName`、`renderer`、`poses`。

备选：单个根 JSON 列出全部皮肤。否决：新增或删除一套时需修改共享文件，容易产生冲突，也不利于未来外部 pack 校验。

### 2. 构建时注册表，启动时校验

仓库内维护一个不含业务逻辑的 pack id 列表；主进程读取对应 manifest，用 `path.resolve` 校验资源仍位于 pack 目录并存在。通过 IPC 只发送经过校验的显示配置，不把文件系统能力暴露给 renderer。

备选：renderer 自己读取目录。否决：`contextIsolation` 下不应给页面文件系统权限，且主进程菜单也需要相同清单。

### 3. 主进程持久化与广播

选择保存到 `userData/pet-preferences.json`，只包含 `skinId`。切换时主进程更新文件并广播 `bridge-pet-skin`；renderer 调用既有 `setPack()` 后用当前 pose 重绘。写入失败不影响本次内存切换。

### 4. 默认与回退

当前 GIF 套装作为默认 `star-guide`。另提供 `classic-css` 内置回退，不依赖图片文件。保存项失效、manifest 无效或图片加载失败时回退到默认；默认也失效时回退 CSS。

## Risks / Trade-offs

- [内置列表仍需登记 pack id] → 新增 pack 只改单行注册和独立目录，避免运行时任意目录安全面。
- [GIF 加载失败发生在 renderer] → renderer 上报失败，主进程选择下一个可靠回退并更新菜单状态。
- [偏好文件损坏] → 解析失败按空偏好处理，不覆盖资源。

## Migration Plan

把当前 `src/assets/pet/*.gif` 移到 `src/assets/pets/star-guide/` 并生成 manifest；首次启动没有偏好时选择 `star-guide`。回滚时仍可把 renderer 固定到单一 pack。
