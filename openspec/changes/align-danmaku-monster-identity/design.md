## Context

见 `proposal.md` 的 Why。实机里状态弹幕只写“释放状态效果”；入场悬停没有循环；B 站 embedding 和弹幕 LLM 超时后，同场下一次快照还会把队列清掉。

## Goals / Non-Goals

**Goals:**

- 入场名字悬停给出循环和每招效果。
- 状态/强化弹幕写出具体效果，悬停不重复空标签。
- 同场快照刷新不丢 B 站/LLM 队列；检索和 LLM 异步追加。

**Non-Goals:**

- 不改覆盖层窗口。
- 不从血量回升反推回血。
- 不要求 B 站原句点名具体怪物。

## Decisions

### 1. 按 Intent 类型分别归一化

可见优先级：`heal` > `attack` > `status/buff/debuff` > `defend`。

### 2. 从 Codex 提炼循环和效果

入场悬停写循环和每招效果。回合正文写 `小啃兽 · 哈气：获得2力量`。只有唯一对应意图的招式时才用来补全，多个候选则不猜。

### 3. 氛围异步追加，只在换场时清队

`sameScene` 只比 runId/sceneId。事实先出，B 站和 LLM 随后 `appendAtmosphere`。Ollama 与弹幕 LLM 超时加长；失败用 `general` 本地氛围。

### 4. 空闲 20 秒、同一发呆只一波

新事实后才允许下一波空闲氛围。

### 5. 协议增量

新增 `intentKinds`；旧快照从类型名拆分。
