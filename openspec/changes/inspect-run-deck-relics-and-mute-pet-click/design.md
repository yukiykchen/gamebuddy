## Context

见 `proposal.md`。当前 `review/service.js` 已在每局草稿的 `finalState.deck` 与 `finalState.relics` 中保存最新快照，但 `buildDashboard()` 只向 renderer 投影对局摘要。`src/review-ui.js` 把历史渲染为不可交互的 `<article>`，`src/review-renderer.js` 每次数据变化都会整体重绘。桌宠方面，`src/pet.js` 在身体 pointer-up 和气泡无上下文动作时都会调用 `windowControls.openMain()`；该 IPC 当前实际打开个人数据窗口。桌宠右键菜单和托盘菜单则在 `main.js` 中直接调用 `showPersonalData()`。

本变更不需要扩展 `gamebuddy.state.v1`：卡牌快照已有 `{ id, name, upgraded }`，遗物在现有数据中可能是字符串或带名称的对象。旧历史可能没有 `finalState`，因此“缺失”和“已知空数组”必须分开处理。

## Goals / Non-Goals

**Goals:**

- 使用已保存的终局快照完成单局牌组和遗物复盘，不新增采集链路。
- 让展开状态在同一次 renderer 生命周期内可预测，并支持鼠标与键盘。
- 删除普通点击到个人数据的隐式路径，不影响拖动、右键和已有气泡上下文动作。
- 用仓库当前 Mod 源码生成 Release DLL，并可验证地覆盖指定游戏目录中的 DLL。

**Non-Goals:**

- 不改变历史文件 schema、100 局保留策略或 `gamebuddy.state.v1`。
- 不向历史补写卡牌/遗物，也不从当前局、Codex、LLM 或网络反查缺失名称。
- 不修改 GameBuddyBridge 业务逻辑；本变更中的 Mod 工作仅为构建、测试和本地部署。

## Decisions

### 1. Project end-of-run builds into the dashboard

`review/service.js` 的 `recentRuns` 为每条记录增加 `deck` 和 `relics`。若旧记录缺少对应字段，则投影为 `null`；若字段存在且为空，则保留 `[]`。卡牌投影保留 `id`、`name`、`upgraded`，遗物兼容字符串与对象并生成最小的 `id/name` 显示形状。数组顺序和重复项保持不变。

这样仍由主进程控制本地数据边界，renderer 不获得文件路径或 Node 文件能力。备选方案是在点击后新增按 `runId` 查询 IPC，但最多 50 条终局快照的数据量有限，引入请求状态、竞态和额外 IPC 没有收益。

### 2. Manage a single-open accordion in renderer state

`src/review-renderer.js` 保存 `expandedRunId`，通过历史列表上的事件委托处理点击和键盘激活，再把该标识传给纯渲染函数。任一时刻最多展开一局；点击当前局收起，点击另一局切换。收到 `review:changed` 后，如果该 `runId` 仍存在就保持展开，否则清空。

`src/review-ui.js` 把每行渲染为可聚焦、可激活且带 `aria-expanded`/`aria-controls` 的控件，详情区域紧随对应摘要行。详情按“终局牌组”“终局遗物”分区：名称优先、ID 回退，升级卡显示 `+` 标记；重复卡逐项保留。`null` 显示“旧记录未包含此数据”，空数组显示已知空态。所有动态文本继续经过 HTML 转义。

备选方案是用 `<details>` 保留多个展开项。该方案不利于整体重绘后恢复状态，也会让 50 局列表快速膨胀，因此采用单选 accordion。

### 3. Remove only the two implicit `openMain()` calls

`src/pet.js` 保留气泡处理中的攻略重开和建议卡展开两个提前返回分支；无上下文动作时直接结束，不再调用 `openMain()`。身体 pointer-up 仍结束拖动、释放 pointer capture，但未拖动时不再打开窗口。`contextmenu` 和 `showPetMenu()` 不变，`main.js` 的桌宠右键菜单及托盘“个人数据”项继续调用 `showPersonalData()`。

不删除 preload 的 `openMain` IPC，也不重命名通道：其他旧页面可能仍依赖该兼容接口，而需求只要求静音桌宠普通点击。

### 4. Keep build details inside the history scroller

`src/styles.css` 为可交互行增加 focus-visible、展开状态和详情分区样式。卡牌与遗物使用响应式换行网格，不依赖图片资源；窄屏沿用现有 900px 断点。详情属于 `.review-run-list` 的滚动内容，避免改变窗口最小尺寸，并在 `prefers-reduced-motion` 下禁用新增过渡。

### 5. Make Release build and deployment verifiable

先运行 C# 测试，再使用本机游戏目录作为 `Sts2Dir` 执行：

```text
dotnet build mod/GameBuddyBridge/GameBuddyBridge.csproj -c Release -p:Sts2Dir="/Users/houwenhao/Applications/steam/steamapps/common/Slay the Spire 2"
```

成功后创建目标 Mod 目录，并把 `mod/GameBuddyBridge/bin/Release/net9.0/gamebuddy_bridge.dll` 覆盖到用户指定路径。复制后用 SHA-256 或字节比较确认源产物与目标 DLL 一致。部署前要求游戏已完全退出；失败时保留原 DLL，不把不完整产物当作成功。

选择显式复制而不是依赖 PowerShell `build.ps1`，因为当前环境是 macOS，且用户给出了唯一目标路径。`GameBuddyBridge.json` 未要求更新，除非构建校验发现目标 manifest 缺失或与项目 manifest 不兼容，否则不覆盖。

## Risks / Trade-offs

- **[风险] 50 局完整牌组增加 dashboard 大小** → 仅投影最小显示字段，不携带描述、费用或其他卡牌元数据；数据仍保持本地。
- **[风险] 旧记录的空数组与缺失字段混淆** → 使用 `null` 表示缺失，`[]` 表示明确记录为空，并分别测试。
- **[风险] 整体重绘丢失展开状态或焦点** → 展开标识保存在 renderer，数据更新后按 `runId` 校验；交互测试覆盖切换和收起。
- **[风险] 卡牌/遗物形状来自多个版本** → 投影兼容对象和字符串，未知名称回退稳定 ID，所有文本转义。
- **[风险] 覆盖正在加载的 DLL 导致部署失败或运行旧代码** → 部署前退出游戏，复制后校验哈希，并重新启动游戏验证 Mod 加载。
- **[取舍] 单次只展开一局** → 降低长列表空间占用，但不提供并排构筑比较；后者明确不在本次范围。

## Migration Plan

1. 先扩展 dashboard 投影和单元测试，确认新旧历史都能生成稳定输出。
2. 接入历史 accordion 与样式，完成键盘、窄屏和缺失数据验收。
3. 移除桌宠两个隐式打开路径，并回归右键菜单、托盘菜单与气泡上下文动作。
4. 运行 Node、Harness、Electron UI 和 C# 验证。
5. 游戏完全退出后构建 Release DLL、覆盖指定 Mod 路径并比对哈希；重启后确认 Mod 正常加载。
6. 回滚时恢复本变更的 JS/CSS；DLL 部署若需回滚，则从部署前备份恢复目标 DLL。历史 JSON 无需迁移。
