## Why

个人数据把第三幕内楼层当成整局楼层，并把上一幕已经打过的关底 Boss 显示成死亡原因。玩家在碾碎爪处退出后继续，最终死于猫头鹰法官，记录却显示 6 层、碾碎爪。

## What Changes

- 终局楼层使用游戏的累计楼层；旧事实没有该字段时，按各幕实际到达楼层相加，并去掉进入下一幕时多出来的过渡楼层。
- 失败且不是主动放弃时，显示结束这局的那场战斗敌人；胜利仍显示最后的关底 Boss。
- 新的对局快照同时写入幕内楼层和累计楼层。

## Capabilities

### New Capabilities

- `personal-run-history`: 最近对局的楼层和结局对象必须和这局实际进度、实际死因一致。

### Modified Capabilities

无。

## Impact

- `review/fact-service.js`、`review/service.js`、`src/review-ui.js`
- `mod/GameBuddyBridge/Scripts/GameBuddyExporter.cs` 的 `run.observed`
- 已保存的事实在桌面端下次启动时按新规则重算，不改事实原文
