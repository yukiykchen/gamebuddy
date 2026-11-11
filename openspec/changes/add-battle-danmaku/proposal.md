## Why

现有弹幕仍受限于桌宠小窗口，语料仅有少量人工审核记录，并且事实台词依赖有限的怪物白名单。GameBuddy 已经从只读 Mod Bridge 收到足够的事实状态，应让弹幕独立、及时地覆盖游戏主显示器，同时让已采集的 B 站语料以场景化氛围表达参与检索。

## What Changes

- 新增独立 `danmakuWindow`：透明、无边框、鼠标穿透且不抢焦点，覆盖主显示器工作区；桌宠继续只负责桌宠、建议与攻略 UI。
- 新增本地场景提取层，只从 Mod observation 与已确认事件读取敌人名称、意图、血量、回合和已出卡；战斗进入及变化时只显示敌人名称、攻击意图、低血量/掉血状态等事实关键词，不显示“进入战斗”等泛化文案，也不混入入场氛围弹幕。
- 取消人工审核作为运行时准入条件：离线脚本对原始 JSONL 自动清洗、去重、自动标注并将合格记录批量写入独立 Chroma collection。自动排除会构成策略、控制或明显不适合观战表达的记录，不需要人工审核队列。
- 使用 Ollama `nomic-embed-text` 仅生成向量，使用独立 Chroma `gamebuddy_danmaku_v1` 存储、过滤和检索弹幕；运行时输出检索可观测日志并在服务不可用时立即回退到 Mod 事实与原创台词。
- 保留状态版本、事件 ID、冷却、过期和场景失效约束，禁止弹幕模块做任何策略判断、游戏控制、性格判断或因等待上游 Agent 而阻塞。

## Capabilities

### New Capabilities

- `battle-danmaku`: 根据已确认的 Mod 状态、已确认事件和可选的上游建议，调度可追溯、非策略性的观战弹幕。
- `global-danmaku-overlay`: 在不影响游戏操作的独立全屏透明窗口中渲染和清理弹幕。

### Modified Capabilities

- `pet-overlay`: 移除战斗弹幕渲染职责，保留现有桌宠交互、姿态、建议卡与攻略卡。

## Impact

- `main.js`、`preload.js`、新增 `src/danmaku.*`：创建、定位、隐藏和向独立覆盖窗口发送弹幕。
- `agent/danmaku/`：新增场景事实提取，删除怪物白名单依赖，保留建议为可选语言输入。
- `scripts/prepare-danmaku-corpus.js`、`scripts/index-danmaku-corpus.js`：由审核队列改为全量自动清洗、标注、向量化和入库。
- 新增/修改 Node 测试与 Harness 验证；不修改 Mod 协议，也不写入玩家记忆库或接入实时策略 LLM。
