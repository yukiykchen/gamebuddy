## Context

见 proposal.md。现有 main.js 每 100ms flush 调度队列，adapter 有最新快照和事件入口。language-profile 缺少储君/亡灵契约师，LLM 硬编码战士。nextActionFact 已提供技能台词与悬停详情，可复用。

## Goals / Non-Goals

只修改表达层，复用现有状态/事件，不改 Mod、不自动操作。保留 90 秒评论去重、共享消息及建议。

## Decisions

- 复用主进程 flush 驱动 adapter.tick，入场立即请求，再按 15 秒周期；事件缓冲最多 12 条/45 秒。快照包括角色、回合、血量/格挡/能量和怪物当前行动、生命与格挡；明确区分采样时状态与已发生事件。
- 每批有独立 batchId，避免同事实缓存抑制周期请求；结果仍按文本去重。允许跨周期在途请求，返回即排队，不用固定台词填空。请求按场景绑定 AbortController，动作变化不取消。
- 共享 OpenAI 客户端增加 弹幕专用 timeoutMs=60000；可选 signal 仅用于场景取消，默认建议超时仍 120 秒。两句预算提高至最多 300 tokens。
- 人格由 language-profile 统一管理，包含 style、tone 和 examples；系统提示不再指定默认战士，禁止网络梗和重复示例，给出不同语感。
- nextActionFact 用于独立 monster_skill 来源，技能评论身份包含场景/怪物/技能。沿用原有台词与悬停，无需改布局。普通评论继续跨场景 90 秒文本去重。

## Risks / Trade-offs

- 60 秒等待期间可能有多个请求在途 → 离开场景或断线主动取消，同场结果带采样时上下文，提示词避免把旧意图当实时指令。
- 模型可能只返回一条或重复句 → 保留有效句并记录数量，不伪造第二条、不额外补请求。
- 固定技能台词可能相同 → 按怪物/技能身份区分，确保不同技能详情仍可访问。

## Migration Plan

修改源代码并重启桌面端；不自动更新已安装包。使用假时钟、mock HTTP、Replay 和实际 renderer 验证，未调用真实付费模型。
