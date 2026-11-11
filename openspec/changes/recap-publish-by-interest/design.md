## Context

见 proposal.md。`buildRecap` 在 `selectStories` 之后还会请求 `stage=validate`，再用裁决滤掉片段。占位符渲染已经只接受对上记录的断言值。

## Goals / Non-Goals

**Goals:**

- 删除这最后一轮模型校验及其过滤。
- 生成提示继续要求数字和名称来自已记录的值。

**Non-Goals:**

- 不删除占位符渲染、反事实和死亡等生成期约束。
- 不增加有意思评判。

## Decisions

1. 删掉 `stage=validate` 的请求、报文和按裁决过滤。片段以 `selectStories` 的结果为准。
2. 提示词里去掉校验阶段的输出合同，保留生成时不得编造数字和名称的要求。提示版本号递增，避免旧的空复盘缓存继续生效。

备选是把校验改成只判有没有意思。用户要求不做最后校验，因此不保留第二轮模型调用。

## Risks / Trade-offs

- [句子可能比绑定的数字多说一句] → 生成提示仍禁止编造；占位符对不上记录时不填值。不再用第二轮模型把整张卡删掉。

## Migration Plan

改运行器和对应测试。回退是恢复 `stage=validate` 过滤。

## Open Questions

无。
