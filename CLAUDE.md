# Claude Code

遵循根目录 `AGENTS.md`。

改可观察行为（UI、协议、Agent、Mod、Harness 语义）时：

1. 先 `openspec list`
2. 没有 change 则 `/opsx:propose`（可先 `/opsx:explore`）
3. **没有 `openspec/changes/<name>/tasks.md` 之前，禁止修改业务代码**
4. 已有 `tasks.md` 后用 `/opsx:apply` 实现

错别字、格式、纯注释可以例外。Claude Code 命令带冒号：`/opsx:propose`，不是 `/opsx-propose`。
