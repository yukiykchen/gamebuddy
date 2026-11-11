## Why

复盘在生成片段之后又做一轮语义校验。数字已经从本局记录绑定，这一轮仍会把片段判掉，整局就没有总结。

## What Changes

- 去掉生成之后的语义校验。通过绑定渲染的片段直接进入本局复盘。
- 生成阶段仍要求数字和名称来自已记录的值，不能现编。

## Non-goals

- 不自动出牌，不点击，不修改游戏状态。
- 不新增有意思/没意思的第二轮评判。
- 不放宽占位符必须对上已记录值的渲染。

## Capabilities

### New Capabilities

- `run-recap-publish`: 复盘片段在生成后如何进入页面。

### Modified Capabilities

- 无。

## Impact

- `review/recap/runner.js` 的最终校验回合。
- 依赖该回合才保留或丢弃片段的复盘测试。
