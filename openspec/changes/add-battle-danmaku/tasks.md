## 1. 规范化场景与非策略调度

- [x] 1.1 新增 `scene-context.js`，从 Mod observation 和显式事件规范化场景、敌人、意图、血量区间、回合与已出卡；不得产生策略结论
- [x] 1.2 将目录和调度器改为通用事实模板，移除固定怪物白名单依赖；每波先输出事实台词
- [x] 1.3 扩展适配层支持 `entry`、`attack`、`hp_drop`、`low_hp`、`victory`、`defeat`、`mechanic`、`card_played` 与 `general`，并让事实触发不等待 recommendation
- [x] 1.4 将上游 recommendation 扩展为可选结构化语言输入，不以其做策略推断或阻塞事实波次
- [x] 1.5 战斗入场波次只显示 Mod 敌人名称与已明确的攻击意图关键词，删除“进入战斗/出场/围观”等泛化文案，禁用 entry 的 B 站检索、原创氛围和建议混入，并以 Node 测试验证

## 2. 全量 B 站语料与独立检索

- [x] 2.1 改造准备脚本：读取全部原始 JSONL，清理控制字符/空/重复/超长记录，保留来源 metadata，自动标注 scene、trigger 与 tone，不创建人工审核门槛
- [x] 2.2 改造索引脚本：批量调用 Ollama embedding，将可追踪的场景/触发记录写入独立 Chroma collection，并报告处理与索引计数
- [x] 2.3 将 Chroma 查询改为安全、场景和触发过滤，返回 `source=bilibili` 的来源信息；保留 350ms 实时回退
- [x] 2.4 为 embedding、Chroma 查询、检索数量和回退原因加入诊断日志

## 3. 独立全屏覆盖窗口

- [x] 3.1 新增 `src/danmaku.html`、`src/danmaku.css`、`src/danmaku.js`，渲染可自动过期的分轨弹幕并在新 generation 时清空
- [x] 3.2 在主进程创建透明、无边框、主显示器范围、置顶、鼠标穿透且不抢焦点的 `danmakuWindow`
- [x] 3.3 将弹幕 IPC 改发至 `danmakuWindow`；Mod 断开、状态过期或场景退出时清空隐藏；保留独立桌宠行为
- [x] 3.4 更新 preload 的只读订阅接口及语法检查清单

## 4. 测试与验证

- [x] 4.1 补充场景提取、未知敌人、攻击意图、低血量、掉血、出牌、场景失效及 recommendation 独立性的 Node 测试
- [x] 4.2 补充语料准备/索引和检索过滤、日志回退测试
- [x] 4.3 运行 `npm run danmaku:prepare`、`npm run danmaku:index`、`npm run test:danmaku`、`npm run test:danmaku-retrieval`、`npm run test:syntax`、`npm run harness:validate-all`
- [x] 4.4 验证 Chroma 记录数与处理结果一致，并在本机 Ollama/Chroma 可用时完成一次真实检索；服务关闭时仍能输出事实台词
- [ ] 4.5 在 Electron Demo/Replay 中验证全屏窗口显示、鼠标穿透、场景切换清理和桌宠原有拖动/建议面板
