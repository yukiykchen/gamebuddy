# 商店与通知修复验证

2026-10-18。

## 原因与修复

1. Mod的ShopItemSnapshot使用CamelCase序列化且不忽略null，删牌服务省略库存键时实际产生stockKey:null。JS原校验拒绝该可选键，整个商店state/opened/updated包可能被拒绝，影响推荐与提醒。已将null兼容为缺省，仍拒绝非字符串非null、空串、超长键、非法价格和重复索引。
2. 新鲜shop快照也建立/恢复当前机会，解决进入商店后重连没有新opened事件的漏报。快照先到、事件后到时合并访问身份；刷新/购买后重算库存，售出和离场撤销未显示提醒。
3. 去重的遗留键fallback统一为类型+ID；已显示的同一访问对象不因组合或刷新重播。
4. 普通推荐不再进入弹幕，面板/桌宠推荐保留。人格、怪物技能和关键卡牌/遗物通知不依赖普通推荐链路。
5. 打击木偶不能因为痛击已填满辅助评分槽而漏报；已有打击牌且尚未持有时按明确配合通知，不伪造契合度加分。

## 实际验证

- 先用Mod同形null删牌服务输入复现协议拒绝，再修复并通过state和opened/updated校验。
- unit集成贯穿ObservationStore接收商店快照、生成合法recommendShop、adapter独立关键卡牌/遗物提醒、IPC结构化克隆；模型关闭仍可工作。
- 覆盖重连只有快照、随后opened合并去重、库存清空、离场、新访问、已持有遗物抑制，以及推荐不入弹幕。
- 真实Electron/preload/IPC回放通过：商店地狱狂徒+打击木偶通知可见，普通推荐DOM为0；已目视核对截图.runtime/affinity-v2/shop-alert.png。奖励关键牌仍可见，普通推荐不再复述。
- test:danmaku 83/83、test:archetypes 56/56、test:agent 4/4、harness:validate-all 28项（含82建议场景）、test:syntax通过；两个变更OpenSpec严格校验与git diff --check通过。
- 本轮兼容修复位于桌面JS，不依赖重新编译游戏Mod。未声称完整Godot DLL编译或游戏内长局验收。
