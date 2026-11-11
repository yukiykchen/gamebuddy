# 卡牌体系悬停提示

当前实现以三行提示替代流派分数。每个关联体系分别展示：体系与作用、已确认短板、下一步建议。悬停、选牌、商店购买、删牌与关键通知共用机制冲突判断，普通推荐保留自身排序。

## 来源与覆盖

抓取时间：2026-10-18T10:26:27.127720+00:00。运行时读取离线快照，不依赖网页请求。五职业25个攻略套路全部导入，未匹配卡牌/遗物为0。

| 职业 | 套路 | 核心牌 | 辅助牌 | 关键遗物 |
| --- | --- | --- | --- | --- |
| ironclad | [消耗流](https://slaythespire2.net/zh-CN/build/ironclad#build-exhaust-engine) | 5 | 10 | 4 |
| ironclad | [力量流](https://slaythespire2.net/zh-CN/build/ironclad#build-strength-scaling) | 5 | 10 | 6 |
| ironclad | [格挡／全身撞击流](https://slaythespire2.net/zh-CN/build/ironclad#build-block-barricade) | 5 | 8 | 6 |
| ironclad | [易伤流](https://slaythespire2.net/zh-CN/build/ironclad#build-vulnerable) | 5 | 7 | 2 |
| ironclad | [自伤流](https://slaythespire2.net/zh-CN/build/ironclad#build-self-damage) | 5 | 7 | 5 |
| silent | [中毒流](https://slaythespire2.net/zh-CN/build/silent#build-poison) | 5 | 10 | 4 |
| silent | [奇巧弃牌流](https://slaythespire2.net/zh-CN/build/silent#build-sly-discard) | 5 | 10 | 5 |
| silent | [小刀流](https://slaythespire2.net/zh-CN/build/silent#build-shiv) | 5 | 9 | 6 |
| silent | [敏捷格挡流](https://slaythespire2.net/zh-CN/build/silent#build-dexterity-block) | 4 | 7 | 2 |
| silent | [过牌节奏流](https://slaythespire2.net/zh-CN/build/silent#build-draw-tempo) | 4 | 7 | 0 |
| defect | [冰霜集中球](https://slaythespire2.net/zh-CN/build/defect#build-frost-focus-orbs) | 6 | 10 | 5 |
| defect | [0 费 Claw 流](https://slaythespire2.net/zh-CN/build/defect#build-claw-zero-cost) | 5 | 9 | 3 |
| defect | [闪电能力引擎](https://slaythespire2.net/zh-CN/build/defect#build-lightning-power-engine) | 6 | 10 | 3 |
| defect | [黑暗球激发爆发](https://slaythespire2.net/zh-CN/build/defect#build-dark-orb-evoke-burst) | 5 | 8 | 2 |
| defect | [状态牌引擎](https://slaythespire2.net/zh-CN/build/defect#build-status-engine) | 5 | 8 | 0 |
| regent | [辉星引擎](https://slaythespire2.net/zh-CN/build/regent#build-star-engine) | 6 | 10 | 4 |
| regent | [星位序列循环](https://slaythespire2.net/zh-CN/build/regent#build-alignment-loop) | 5 | 7 | 0 |
| regent | [君王之剑铸造流](https://slaythespire2.net/zh-CN/build/regent#build-sovereign-blade-forge) | 5 | 7 | 2 |
| regent | [虚空形态流](https://slaythespire2.net/zh-CN/build/regent#build-void-form) | 3 | 5 | 0 |
| regent | [造牌流](https://slaythespire2.net/zh-CN/build/regent#build-card-creation) | 4 | 5 | 0 |
| necrobinder | [灵魂循环](https://slaythespire2.net/zh-CN/build/necrobinder#build-soul-cycle) | 5 | 7 | 1 |
| necrobinder | [灾厄斩杀](https://slaythespire2.net/zh-CN/build/necrobinder#build-doom-execute) | 5 | 9 | 3 |
| necrobinder | [奥斯提召唤](https://slaythespire2.net/zh-CN/build/necrobinder#build-osty) | 5 | 10 | 2 |
| necrobinder | [虚无流](https://slaythespire2.net/zh-CN/build/necrobinder#build-ethereal) | 5 | 6 | 0 |
| necrobinder | [死神重击](https://slaythespire2.net/zh-CN/build/necrobinder#build-reaper-big-hit) | 4 | 5 | 0 |

自动打击是另外一项牌面机制补充，明确标为 mechanic，不伪称当前攻略单列流派。完美打击的数量增伤、其他打击牌的供给作用全部归入自动打击，不另设独立体系。攻略核心/辅助名单保存在 agent/knowledge/build-guides.json；功能组由本地 Spire Codex 牌面复核，保存在 build-mechanics.js。官网原文把坚定不移与壁垒合写时，功能组仍区分格挡放大与跨回合留存。

同步命令：`python3 scripts/sync-build-guides.py`。脚本记录每页URL与SHA256，名单变化应审核；不复制攻略长篇正文。

## AI 固定模板

实际模型提示词：agent/knowledge/card-guidance-service.js 的 GUIDANCE_PROMPT。模型返回每个卡牌 key、体系 systemId、诊断 diagnosisId，以及对应 shortfall/advice。

模型实际收到每个体系的启动、运转、收尾、优先级、依赖机制、误区与例外，以及完整已知牌面、当前功能数量和路线证据。完整策略可阅读 [套路策略手册](build-strategy-handbook.md)，运行时定义在 agent/knowledge/build-strategies.js。

定位、数量、缺失组件、可选短板与建议配对由程序构造；AI负责选择本次应展示的合法配对，文本必须与该配对完全一致。不允许模型自由改写数值、拼接不同建议或宣布组件足够/稳定成型。它是受约束生成，不是任意牌组强度判断。奖励/商店的实际模型提示同时包含 build-decision-guard.js 的 STRATEGY_REVIEW，返回结果再由程序校验。

悬停立即显示规则结果；角色、runId、牌组/升级、遗物、库存与奖励签名决定缓存。一次上下文一次请求，60秒截止；无配置、失败、非法输出、旧上下文返回均保留规则提示。缓存最多64项。

## 诊断边界

- 只判断明确缺失与已持有数量，不给牌组打分，不把拥有组件说成足够。
- 初始防御、打击或普通抽牌不单独认定专属路线。
- 消耗收益允许不同分支；普通格挡转输出不强制壁垒。
- 冲突按真实牌面效果与当前机制依赖判断，不按网站名单排他。包括攻击改写、随机变牌、出牌上限、集中/敏捷损失、循环技能被消耗、锁抽牌/回能和初始打击变化。未知模组提供可识别的运行时牌面时也可检查。
- 明确路线的结构冲突默认不推荐；牌序可解决的条件冲突保留选择并说明代价。低血量应急与确实成立的混合路线允许明示取舍，不能跳过的奖励明确说明风险。
- 原始力量影响当前手牌攻击，不是永久改变整副牌；单张巨石不具有变牌效果。地狱狂徒已生效时，抽到打击可能先自动打出，风险取决于当时手牌。
- 选牌、商店整份清单都约束冲突候选，模型越界或失败使用合法规则结果。删牌保护明确路线组件、打击供给、爪击与必要功能唯一来源。
- 没有明确套路归属且没有已核实机制冲突的牌不显示构筑提示，不创建“通用”或“未知”流派，也不为其请求悬停AI。未知牌不猜作用；有关联体系的诊断仍如实说明牌组内未知信息。未完整建模所有遗物与动态改造效果，不以未建模效果宣布强度结论。

## 接口与显示

新协议 card_guidance：context=reward/shop，signature为奖励/商店上下文，deckSignature绑定牌组；cards包含升级区分的key和多个systems。新Mod拒绝旧draft_impact。

奖励与商店都使用相同规则。桌面卡片悬停/键盘聚焦才显示提示，多体系浮层滚动；游戏内使用只读面板。关键卡与关键遗物弹幕读取攻略关系，不复述普通推荐，不依赖旧评分；被阻止的候选不再播放必拿通知，有条件冲突附代价。

组件弹幕现在同时覆盖核心和辅助牌，奖励/可见事件选牌/商店均按体系合并一条，核心、辅助、遗物分别列出。26个体系各用对应玩法的开场文案；同牌关联多个体系时分别参与相关提醒。去重键包含体系、机会/商店访问与具体对象，已播某一体系不会吞掉另一体系；预算未知、不足、同体系无法全买、机制风险与售出离场作废仍保留。

普通小怪攻略默认仅缓存，不自动展开，也不把桌宠气泡改成“查看攻略”；右键桌宠的“查看本场攻略”仍可手动打开。精英/Boss自动攻略保持原行为。人格AI弹幕的悬停详情只渲染原句，忽略旧消息里的场景、提示词和来源解释；怪物技能的行动详情保留。

游戏奖励悬停使用实际Hitbox和CardNode，避免外层Holder零尺寸导致匹配失败。当前奖励候选和签名包含在状态reward字段中，GameBuddy重连后自动恢复，关闭时为null；旧Mod没有该字段时兼容事件入口。

新版视觉采用暗炭色底、细铜边、圆角和柔和阴影；套路名与作用标签组成标题行，短板/建议分行对齐。多体系有细分隔，冲突使用柔和红色；长文本换行并限制面板高度滚动。空体系候选保留在协议用于完整签名匹配，但桌面与游戏内均立即隐藏，不留空框或上一张牌的提示。

## 本机 Mac／应用宝环境

游戏实际路径：`/Users/houwenhao/Applications/steam/steamapps/common/Slay the Spire 2`。这是应用宝运行的Windows游戏目录，程序集位于 data_sts2_windows_x86_64。不要仅检查 ~/Library/Application Support/Steam 后就判定未安装。

查找：`mdfind -name sts2.dll` 和 `mdfind -name 0Harmony.dll`。

构建命令：

```sh
dotnet build mod/GameBuddyBridge/GameBuddyBridge.csproj -c Release \
  "-p:Sts2Dir=/Users/houwenhao/Applications/steam/steamapps/common/Slay the Spire 2" \
  -p:CopyModAfterBuild=false
```

产物：mod/GameBuddyBridge/.godot/mono/temp/bin/Release/gamebuddy_bridge.dll。替换游戏 mods/GameBuddyBridge 中DLL前备份；已加载旧DLL的游戏需要正常重启才会使用新版，不能热替换内存程序集。

## 验证

见 openspec/changes/card-system-hover-guidance/verification.md。真实模型五职业各一批样例全部通过格式/配对校验；这不代表所有牌组诊断经过玩家实战验证。
