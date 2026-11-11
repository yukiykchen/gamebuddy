## Purpose

让玩家从桌宠右键填入 API Key 和网关。配过之后模型请求优先走这条通道，走不通时同一轮回到原来的模型配置。

## ADDED Requirements

### Requirement: Pet context menu opens the key page and a two-field dialog
桌宠右键菜单 SHALL 提供「配置密钥」。选择后 MUST 只出现配置框，MUST NOT 自动打开系统浏览器。配置框 MUST 提供「公司内网 API 获取链接」；点击该链接后系统浏览器 MUST 打开 `https://tencent.sso.codebuddy.cn/profile/keys`。第一行 MUST 接受 API Key。第二行 MUST 标明为网关，默认值为 `https://copilot.tencent.com/v2/`，并 MUST 用文字说明这是公司个人 token 网关。玩家 MUST 可以修改网关地址。取消或空白 API Key MUST NOT 写入配置。

#### Scenario: Configure key from the pet
- **WHEN** 玩家在桌宠上右键并选择「配置密钥」
- **THEN** 显示 API Key、预填的公司个人 token 网关，以及「公司内网 API 获取链接」
- **AND** 系统浏览器保持关闭

#### Scenario: Key page opens from the dialog link
- **WHEN** 玩家在配置框中点击「公司内网 API 获取链接」
- **THEN** 系统浏览器打开 `https://tencent.sso.codebuddy.cn/profile/keys`

#### Scenario: Cancel leaves configuration unchanged
- **WHEN** 玩家打开对话框后取消，或提交空白 API Key
- **THEN** 已有模型配置保持不变，也不新增本地网关配置

### Requirement: Saved gateway is preferred and the original client remains
确认非空 API Key 后，应用 MUST 把密钥和网关写入当前用户的应用本地配置，并立刻让后续模型请求优先使用它。下次启动 MUST 继续优先使用这份本地配置。保存 MUST NOT 创建或修改操作系统环境变量，也 MUST NOT 修改仓库 `.env`。没有这份本地配置时，模型请求 MUST 继续使用原来的环境变量客户端。日志、界面和错误文本 MUST NOT 显示完整密钥。

#### Scenario: Key works without restart
- **WHEN** 玩家提交一份非空 API Key 和网关
- **THEN** 后续模型请求优先使用该密钥和网关，无需退出应用

#### Scenario: Next launch keeps the preference
- **WHEN** 应用重新启动且本地配置里已有密钥和网关
- **THEN** 模型请求优先使用该配置，原来的环境变量配置仍保留

#### Scenario: No preference leaves the original call unchanged
- **WHEN** 玩家没有保存过右键配置
- **THEN** 模型请求仍使用原来的密钥、网关和 Bearer 认证

### Requirement: Company gateway and custom gateway use different request shapes
主机为 `copilot.tencent.com` 的已保存网关 MUST 把请求发到该根地址下的 `/chat/completions`，并用 `X-Api-Key` 携带密钥。玩家改成其他网关时，请求 MUST 使用该网关根地址，并沿用原来的接口类型和 `Authorization: Bearer`。原来的客户端本身 MUST 继续使用 Bearer。

公司优先通道 MUST 使用 `deepseek-v4.1-flash` 与 `stream: true`，通过SSE解析建议和人格弹幕。其他网关及原客户端 MUST 保持各自模型ID及流式设置。

#### Scenario: Default company gateway
- **WHEN** 本地配置使用 `https://copilot.tencent.com/v2/` 和一份密钥，并产生一次优先请求
- **THEN** 请求发往 `https://copilot.tencent.com/v2/chat/completions`，请求头包含 `X-Api-Key`
- **AND** 模型为 `deepseek-v4.1-flash`，请求开启流式响应，分片内容合并后进入原有JSON解析和弹幕生成流程

#### Scenario: Replaced gateway keeps bearer authentication
- **WHEN** 玩家把网关改成另一个地址并产生一次优先请求
- **THEN** 请求发往该地址，并使用 `Authorization: Bearer`

### Requirement: A failed preferred request falls back to the original client
优先请求出现网络失败、认证失败、超时或没有可用结果时，同一次调用 MUST 改用原来的模型客户端。调用被玩家或场景取消时 MUST NOT 再发起原来的请求。原来的客户端也失败或不可用时，规则模式 MUST 继续可用，且 MUST NOT 阻断桌宠和对局界面。

#### Scenario: Preferred gateway rejects the key
- **WHEN** 优先请求返回认证失败，且原来的客户端可用
- **THEN** 同一次调用改用原来的客户端，并采用其结果

#### Scenario: Cancel does not start the original request
- **WHEN** 优先请求因当前场景取消而中止
- **THEN** 不再调用原来的客户端

### Requirement: Key configuration opens in foreground
配置密钥窗口 SHALL 置顶显示。每次用户主动打开配置入口时，系统 SHALL 显示、抬升并聚焦唯一的配置窗口；首次加载完成后同样激活，窗口隐藏时重新显示，销毁后可新建。系统 MUST NOT 使用周期性抢焦点来维持置顶。

#### Scenario: Reopen configuration
- **WHEN** 配置窗口已存在或被隐藏，用户再次选择配置密钥
- **THEN** 原窗口 SHALL 恢复显示并在前台聚焦，不新建重复窗口

### Requirement: Configuration has no Windows native menu bar
Windows配置窗口 SHALL 移除原生菜单栏，Alt键或粘贴时不得唤出File/Edit白条。系统 MUST 保留输入框编辑功能及Mac系统应用菜单，不通过拦截复制粘贴来隐藏菜单。

#### Scenario: Paste into key field
- **WHEN** 玩家在配置窗口粘贴密钥
- **THEN** 输入框保持可编辑，窗口内 SHALL 不出现File/Edit菜单栏
