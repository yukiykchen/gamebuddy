# Streaming compatibility verification

2026-10-20，用户报告没有AI弹幕。

## Evidence

- 应用宝安装版ASAR版本0.2.11。本地llm-gateway.json已有非空密钥，网关为公司默认地址。只检查配置是否存在及网关地址，不打印密钥。
- 本机只读Mod连接返回IRONCLAD、Monster、combat=true，排除不在战斗场景。
- 使用已保存密钥和原安装版的默认请求设置，从Mac Node复现：HTTP400/code11101，`Non-stream chat request is currently not supported`。
- 只改stream=true后返回HTTP400/code11102，`model [deepseek-flash] service info not found`。
- 公司优先通道改为`deepseek-v4.1-flash`与stream=true后返回HTTP200 SSE。

## Implementation

公司网关构建配置时固定上述已验证模型与流式设置，复用现有SSE解析。自定义网关保留各自模型、流式、接口类型和Bearer认证；原客户端与失败回退、取消逻辑保持。

## Results

- 真实公司网关 + 已保存密钥 + 合成战斗回放 + 生产DanmakuLlmAtmosphere/BridgeAdapter/Director链路：1954ms，success count=2，queuedAI=2，emittedAI=2，errors=[]。
- 网关回归9项通过：建议SSE解析、人格两句话、UTF-8/JSON/换行跨网络分片、外部模型和流式配置保留、认证、失败回退及取消。
- 语法检查、94项弹幕测试、5项agent测试、29项harness检查通过。
- OpenSpec严格校验通过。
- 已生成独立候选`dist/gateway-stream-fix/GameBuddy-Setup-0.2.12.exe`，旁有SHA256SUMS.txt；包内版本及网关、解析、人格、主进程、窗口去重模块与本次源码一致，包内未包含用户已保存的真实密钥。未覆盖正在运行的安装版。

## Limits

真实请求从Mac Node发出；上述结果证明保存的密钥、正确模型与请求形式可生成弹幕并进入生产队列，不能替代应用宝安装版现场显示验收。未改用户密钥或环境变量，未向线上共享弹幕服务发送测试留言，未操作游戏。
