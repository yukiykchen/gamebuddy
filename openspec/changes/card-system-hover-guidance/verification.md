# 验证记录

## 2026-10-18 面板贴近卡牌

- 移除固定屏幕顶部Y坐标，按实际可见牌面居中，在卡牌上方留18像素；上方不足时依次尝试右、左、下方，最后限制12像素安全边距。奖励、商店共用，保持现有多体系滚动和鼠标进入面板时的稳定性。
- 纯C#检查覆盖奖励居中、商店顶排、右边缘、左边缘长面板、窄视口下方回退。完整Release编译0警告0错误。syntax、Agent、Harness29项及五职业奖励/商店Electron回归通过，已查看桌面渲染截图；这些不代表游戏内实机悬停已验证。
- 已安装并核对DLL SHA256 `ad4c3634e4a9c6b4c25ba36fa1b7fa00351fc50dd9489803f7904c4eeb8f4f9d`，原DLL备份 `gamebuddy_bridge.dll.before-card-relative-hover-20261018-232851.bak`。本次无需重启GameBuddy；需要正常重启游戏加载DLL，未强退用户游戏。

## 2026-10-18 辅助牌分流播报与安静默认

- 奖励、事件可见候选、商店同时覆盖核心/辅助牌，按体系合并卡牌与遗物；26个体系有对应玩法文案。按体系＋机会/访问＋对象去重，同牌多体系分别提醒；保留禁用机制冲突、已拥有对象抑制、金币不足/未知、组内不能全买、售出离场清理规则。
- 用户商店样例回放现有4个体系通知：小刀（暴露）、过牌节奏（猎杀者）、敏捷格挡（尖啸＋磨蚀）、弃牌（磨蚀）；两条涉及磨蚀的提醒均说明金币不足。
- 普通小怪攻略缓存后不自动打开或覆盖桌宠气泡，右键菜单新增“查看本场攻略”；精英/Boss保持自动打开。AI悬停只显示原句，渲染层忽略旧detail解释，怪物技能详情保持可见。
- `test:guidance` 32项、`test:agent` 5项、`test:danmaku` 84项通过；syntax、Harness29项、完整Review回归通过。
- Electron真实渲染确认5人格AI原句悬停、提示词/来源解释不进入DOM、技能事实详情保留、同体系多辅助合并及跨体系独立上屏。已查看 `/var/folders/zl/scff534x2_b5mjh1c4gk2sk80000gn/T/gamebuddy-danmaku-personas-preview.png`。
- 本轮仅JS与渲染改动，无Mod DLL更新。GameBuddy已重启加载，不要求重启游戏；不改变AI人格生成内容和战斗技能介绍。

## 2026-10-18 去除兜底体系与视觉重设计

- 无明确归属且无机制冲突的候选返回空systems，不显示“通用”、未知提示或空框。AI仅处理非空候选；保留空项key用于整批签名检查。纯C#允许空体系，空候选不会导致其他牌的提示被拒绝。
- 桌面与Mod重做为暗炭底、细铜边、圆角阴影、套路标题与作用标签、对齐短板/建议；冲突采用柔和红色，多体系细分隔，按文本高度自适应并限制滚动。保持实际Hitbox/CardNode检测。
- `test:guidance` 30项通过，覆盖静默候选、混合批次AI、拒绝重新生成通用体系、旧提示清理。`test:syntax`、Agent4项、Harness29项通过；Harness旧“所有牌必须有非空流派”断言已按新需求更新，同时保留真实壁垒归属和不生成generic的检查。
- Electron五职业奖励/商店、有关联到无关联切换、冲突提示、四体系长文本换行/滚动/横向不溢出通过。已查看实际新渲染截图：`.runtime/card-guidance/guidance-redesign.png`、`guidance-conflict-redesign.png`；此为桌面实际截图，非游戏内截图。
- 纯C#及五职业10份JS消息回放通过，含空候选；真实模型五职业5批全部通过合法配对验证，无归属巨石不进入悬停AI请求。
- 完整Mod Release构建0警告0错误；安装SHA256 `d8168cb5736ffdf43b0f15614d1caeb7f2b2df1d7c12e2a2b499677b05805eb2`，备份 `gamebuddy_bridge.dll.before-guidance-redesign-20261018-194330.bak`。GameBuddy已重启。未强退游戏，需用户正常重启游戏后加载新DLL；没有宣称游戏内实机视觉验证已完成。

## 2026-10-18 游戏内悬停丢失回归

用户实测发现提示不出现。代码检查发现新面板丢失旧版实际Hitbox/CardNode检测，改用Holder矩形；同时桌面重启时桥只重发状态，旧状态不含当前奖励候选。已恢复实际交互/可见区域检测、直接使用候选升级keys绑定，状态新增可选reward供重连恢复。

- 提示测试29项通过，包括无新事件重连恢复、关闭清理与旧Mod兼容。
- syntax、Agent4项、Harness29项、五职业Electron奖励/商店及冲突提示、纯C#解析与JS消息回放通过。
- 完整Release构建0警告0错误。新DLL SHA256：`5981279f66d61cbe40a525e00efa0075098fbd557a95bf3d2afda6189cfdee5b`；已安装并核对内容，备份为 `gamebuddy_bridge.dll.before-hover-recovery-20261018-192743.bak`。
- GameBuddy已重启。没有强退用户正在运行的游戏；当前游戏内存仍可能加载旧DLL，用户需正常重启游戏才能验证新交互修复。本轮未将Electron/纯C#检查宣称为应用宝内实机悬停验证。

## 2026-10-18 策略与机制约束补全

- 26套策略逐项包含目标、启动、循环、输出、补强优先级、依赖、误区和例外。阅读版为 `docs/build-strategy-handbook.md`，运行定义为 `agent/knowledge/build-strategies.js`。
- `npm run test:guidance`：28项通过（原有13项＋策略15项）。覆盖真实牌面与运行时改造、原始力量/单张巨石、五职业循环与出牌上限、集中损失、条件牌序、升级消耗、混合/生存取舍、恶意模型选项、失败回退、强制奖励、整份购物清单及核心删牌保护。结构与条件冲突并存时，AI不能只展示较轻提示掩盖结构破坏。
- `test:syntax`、`test:agent`（4项）、`test:danmaku`（83项）通过；`harness:validate-all` 29项检查通过，含82项Agent检查。
- `test:guidance-renderer`：五职业奖励/商店及原始力量冲突状态通过；已查看 `.runtime/card-guidance/auto-strike-conflict.png`，提示明确“仅限当前手牌”，普通卡牌状态明确标记“不适合当前路线”。`test:danmaku-renderer` 通知回归通过。
- 纯C#测试及实际五职业奖励/商店10份JS消息回放通过，包含变牌、锁抽牌、集中代价、消耗技能等真实冲突文本。
- `node harness/preview-build-strategies.js`：真实配置模型五职业各一批，共5请求、10候选，全部通过逐字配对校验，返回约2.2–3.3秒。每次请求确实携带完整策略及已知牌面。报告保存在忽略的 `.runtime/card-guidance/strategy-model-preview.json`，不含凭据。该抽样证明请求和约束生效，不等于全部对局战术最优。
- OpenSpec strict、`git diff --check` 通过。本轮仅更新JS决策和策略，现有Mod协议可读取，不需重新替换DLL。GameBuddy重启加载策略；没有代替用户进行游戏内选择。

当前覆盖是已核实的通用机制规则。未识别的新效果不会按网站缺席直接定为冲突；规则未命中也不保证没有其他风险。未知动态效果、完整战斗模拟和全部卡牌组合的最优性不在已验证范围。

## 已完成

- 网站抓取五职业25套路，核心/辅助/遗物零未匹配；另外自动打击标为机制补充，完美打击数量增伤统一归入其中。
- `npm run test:guidance`：12项通过，含全部本地卡牌输出、数量不虚报、多个体系、条件冲突、AI拒绝虚构、迟到结果与缓存、未知牌及推荐独立。
- `npm run test:agent`：4项通过。
- `npm run test:danmaku`：83项通过。
- `npm run test:archetypes`：56项历史算法兼容测试通过；该算法不在新运行入口使用。
- `npm run test:syntax`：通过。
- `npm run harness:validate-all`：29项检查通过，含82项Agent检查与新提示测试。
- `npm run test:guidance-renderer`：真实Electron页面/preload/IPC，五职业奖励与商店提示通过；检查悬停/聚焦、多体系、无旧分数及横向溢出。截图位于忽略的 `.runtime/card-guidance/`，已人工查看奖励及商店截图，改为悬浮框避免撑高卡片。
- `npm run test:danmaku-renderer`：关键牌/遗物通知、普通推荐不复述、空stockKey服务兼容通过。
- `GAMEBUDDY_GUIDANCE_FIXTURE=... dotnet run --project mod/GameBuddyBridge.Tests`：纯C#解析/上下文测试与实际五职业JS奖励/商店消息回放通过。
- 真实配置模型 deepseek-v4-pro：五职业各一批共5次请求，全部通过合法配对校验，约12–15秒返回；原始结果保存在忽略的 `.runtime/card-guidance/live-model-preview.json`。不是全部牌组人工正确性认证。

## 完整 Mod 构建及安装

初次仅检查常规Steam路径造成误判。用户指出应用宝环境后，使用 `mdfind -name sts2.dll` 找到真实路径：

`/Users/houwenhao/Applications/steam/steamapps/common/Slay the Spire 2`

使用该目录程序集执行 Release 构建：0警告、0错误。新DLL已原子替换到游戏 mods/GameBuddyBridge，原DLL备份为 `gamebuddy_bridge.dll.before-card-guidance-20261018-184029.bak`。安装时核对产物与目标内容一致。

## 实机边界

没有代替用户进入战斗、选牌或购物。已加载旧DLL的游戏需要正常重启才会加载新版；本文不把编译、纯C#或Electron验证称为应用宝内实机交互验证。多体系滚动及商店节点悬停最终仍需在游戏中体验。

## 自动打击归类合并

按用户要求移除独立打击成长分类与功能组，数量增伤保留为自动打击中的卡牌定位。奖励、商店和AI输入共用该分类；新测试13项通过，五职业奖励/商店Electron渲染通过，页面不再出现独立打击成长。此次仅修改JS分类及说明，无需重编Mod。
