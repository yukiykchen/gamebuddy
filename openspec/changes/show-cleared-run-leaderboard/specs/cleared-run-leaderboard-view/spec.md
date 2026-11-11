## Purpose

让玩家在现有个人数据窗口中按角色、进阶和游戏模式读取共享服务已经存储的通关记录，并明确理解排名、观察用时及战斗内读档信息。

## ADDED Requirements

### Requirement: Player can open and leave the cleared-run leaderboard

个人数据窗口 SHALL 提供可识别的“通关榜”入口。玩家进入榜单后 SHALL 能返回个人数据视图，且切换视图 MUST NOT 修改本地个人数据、显示名或任何游戏状态。

#### Scenario: Open leaderboard

- **WHEN** 玩家在个人数据视图选择“通关榜”
- **THEN** 窗口显示通关榜筛选条件和榜单内容区域

#### Scenario: Return to personal data

- **WHEN** 玩家从通关榜选择“返回个人数据”
- **THEN** 窗口恢复原有个人数据视图且不清空或改写个人数据

### Requirement: Leaderboard uses the existing three-part query

通关榜 SHALL 使用 `character`、`ascension` 和 `gameMode` 三个必填条件查询。角色值 SHALL 使用现有记录使用的角色标识，进阶 SHALL 为 0 到 10000 的整数，游戏模式 SHALL 限于 `Standard`、`Daily` 或 `Custom`。首次打开 SHALL 以 `ironclad`、`0`、`Standard` 查询；玩家改变任一条件并提交后 SHALL 以完整的新条件重新查询。

#### Scenario: Initial query

- **WHEN** 玩家首次打开通关榜
- **THEN** 客户端请求 `GET /v1/leaderboard?character=ironclad&ascension=0&gameMode=Standard`

#### Scenario: Query another board

- **WHEN** 玩家选择角色 `silent`、进阶 `10`、模式 `Daily` 并提交
- **THEN** 客户端仅使用这三个参数请求对应榜单

#### Scenario: Invalid ascension

- **WHEN** 进阶不是 0 到 10000 的整数
- **THEN** 页面提示玩家修正条件且 MUST NOT 发起榜单请求

### Requirement: Leaderboard presents stored clears in service order

成功响应后，页面 SHALL 按服务端 `items` 的原顺序显示从 1 开始的名次，不在客户端重新排序。每行 SHALL 显示 `displayName`、格式化后的 `observedDurationSeconds` 和 `combatSaveLoad` 状态，并 SHALL 能展开查看 `finalDeck`、`finalRelics` 与 `selectedEvents`。页面 MUST NOT 显示 `playerId`。

#### Scenario: Ranked clears are shown

- **WHEN** 服务端按观察用时返回多条通关记录
- **THEN** 页面按该顺序编号，并展示每条记录的榜上名称、观察用时和是否有战斗内读档

#### Scenario: Clear details are expanded

- **WHEN** 玩家展开一条榜单记录
- **THEN** 页面只展开该记录的终局牌组、终局遗物和事件选择，并转义服务端提供的文本

#### Scenario: Hidden installation identity

- **WHEN** 榜单响应包含 `playerId`
- **THEN** 页面任何位置均不显示该字段

### Requirement: Leaderboard communicates loading, empty, and failure states

页面 SHALL 在请求进行中显示加载状态并防止重复提交同一请求；零条记录时 SHALL 显示当前筛选条件下暂无通关记录；超时、网络错误、非成功 HTTP 响应或无效响应 SHALL 显示失败状态和“重试”操作。失败 MUST NOT 影响个人数据视图，重试 SHALL 使用最近一次已提交的有效条件。

#### Scenario: No matching clears

- **WHEN** 服务端成功返回空 `items`
- **THEN** 页面显示“当前条件下暂无通关记录”

#### Scenario: Request fails

- **WHEN** 榜单请求超时、网络失败或被服务端拒绝
- **THEN** 页面显示读取失败且提供重试入口

#### Scenario: Retry failed query

- **WHEN** 玩家在失败状态选择“重试”
- **THEN** 客户端使用失败请求的同一组角色、进阶和游戏模式再次查询
