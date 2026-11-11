## Why

配置公司个人 token 网关现在要手改 `.env`。桌宠右键应打开密钥页，收下密钥和网关，并在每次模型请求里优先使用这份配置。

## What Changes

- 桌宠右键增加「配置密钥」：用系统浏览器打开 `https://tencent.sso.codebuddy.cn/profile/keys`，并弹出两行配置。第一行是 API Key。第二行是网关，默认填 `https://copilot.tencent.com/v2/`，文字标明这是公司个人 token 网关，用户可以改成其他网关。
- 保存后写入本机应用配置，并立刻生效。已保存时，建议、构筑说明和弹幕都先走这份密钥和网关。
- 这份请求打不开、认证失败、超时或没有可用结果时，同一轮改走原来的 `.env` / 环境变量客户端。原来的地址、模型和 Bearer 认证保持不变。
- 没有这份配置时，模型调用与现在完全一致。密钥不进入日志、仓库或操作系统环境变量。

## Capabilities

### New Capabilities
- `desktop-ui/codebuddy-key-setup`: 桌宠右键配置公司个人 token 网关，请求优先使用它，失败后回到原来的模型客户端。

### Modified Capabilities
无。

## Impact

涉及桌宠右键菜单、配置窗口、LLM 客户端的可选优先通道。原有 DeepSeek 等 Bearer 调用在未配置或优先通道失败时继续可用。缺少全部密钥时仍回退规则，不阻断界面。

## Non-goals

不自动出牌、不点击、不修改游戏状态。不代用户登录 SSO，不拦截密钥页接口，不监听剪贴板。不创建系统或用户环境变量，不改 `.env`。弹窗不收集模型 ID。不把公司网关的认证方式套到原来的客户端上。
