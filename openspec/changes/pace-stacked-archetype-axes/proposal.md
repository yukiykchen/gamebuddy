## Why

叠卡轴把第一张满权重牌当成了这一格的大部分。起手上第一张剑柄打击让自动打击 +16，第二张只剩 +4；牌组里已经有循环件时，地狱狂徒的组合分会被整笔打开。消耗出口、力量多段和格挡来源有同样的形状。侧栏流派框只有细条和裸增量，读不出「现在多少、这张牌动多少」。

## What Changes

- 叠卡轴改为慢饱和：第一张是可见的一步，第二张仍然明显，大约两份权重才接近填满。
- 含叠卡轴的组合分按该轴已填满的比例释放，不再因为轴上出现第一张就整笔打开。
- 单卡槽保持陡曲线：地狱狂徒、完美打击、消耗双闸门、力量来源、壁垒和格挡转伤仍由第一张完成该槽，第二张只做小幅补充。
- 选牌侧栏改成铁甲铜铁面板，候选牌同时显示当前流派度和带符号的变化。

## Non-goals

- 不自动出牌、不点击、不修改游戏状态。
- 不改 87×4 角色矩阵、不改 `draft_impact` 协议，也不重标每张牌的权重。
- 不把流派度解释成胜率，不调整选牌排序或 SKIP。
- 不给另外三个角色做流派框。

## Capabilities

### New Capabilities

- `ironclad-archetype-pace`: 四套流派里，叠卡轴与单卡槽的增量节奏，以及组合分随叠卡满度释放。
- `desktop-ui`: 铁甲选牌侧栏的流派面板，以及候选牌上的当前流派度与变化。

### Modified Capabilities

- 无。主规格里还没有对应需求。

## Impact

- `agent/knowledge/ironclad-archetypes.js` 的饱和与组合分。
- `src/archetype-ui.js`、`src/styles.css` 的流派面板与候选增量。
- `agent/tests/ironclad-archetypes.test.js`、`agent/tests/archetype-ui.test.js`，以及可能受增量变化影响的 `agent/tests/auto-strike.test.js`。
