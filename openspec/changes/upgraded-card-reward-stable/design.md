## Context

见 `proposal.md`。目录合并是 `{ ...raw, ...match }`，知识库条目覆盖实机 `name`/`cost`/`description`。升级描述字段是 `upgradeDescription`，评分读的是 `upgrade_description`，升级牌仍用未升级文本。签名含 `upgraded`，Mod 先发未升级再发已升级会打开第二次 LLM。

## Goals / Non-Goals

**Goals:**

- 实机升级状态赢过目录。
- 升级牌用升级描述；未升级 F 档不能单独否决。
- 同一组卡 ID 只问一次。
- Mod 同 ID 优先已升级。

**Non-Goals:**

- 不重写知识库档位。
- 不禁止 SKIP。

## Decisions

### 1. 合并顺序改为目录垫底、实机覆盖

`resolveItem` 为 `{ ...match, ...raw }`，并补上 `upgradeDescription`。名称带 `+` 也视为已升级。

### 2. 签名只用卡 ID

`cardRewardSignature` 不再纳入 `upgraded`/`name`。与 one-shot「同一组牌」一致。

备选：升级标记从 false→true 时重算一次。否决：正是建议从拿牌改成跳过的原因。

### 3. Mod 分组取 IsUpgraded

`GroupBy Id` 后取 `IsUpgraded` 为 true 的模型，避免模板节点抢先。

## Risks / Trade-offs

- [第一次采集仍是未升级就锁死] → Mod 优先已升级；描述仍可从知识库 `upgradeDescription` 补。
- [升级牌仍可能 SKIP] → 允许；只禁止用未升级 F 档当充分理由。

## Migration Plan

桌面端立即生效。Mod 需重装后同 ID 才稳定取升级模型。回滚上述文件即可。

## Open Questions

无。
