# GameBuddy 共享弹幕 Worker

这是一套低频 HTTP 共享服务，不使用 WebSocket、LLM 或向量库。

## 初始化

```bash
cd shared-danmaku/worker
npx wrangler login
npx wrangler d1 create gamebuddy-shared-danmaku
cp wrangler.toml.example wrangler.toml
# 把命令返回的 database_id 写入 wrangler.toml
npx wrangler d1 execute gamebuddy-shared-danmaku --remote --file=schema.sql
npx wrangler secret put SHARED_DANMAKU_SALT
npx wrangler deploy
```

部署完成后，把 Worker 地址写入 GameBuddy 项目的 `.env`：

```text
GAMEBUDDY_SHARED_DANMAKU_URL=https://gamebuddy-shared-danmaku.<你的账号>.workers.dev
```

## 接口

- `GET /health`
- `GET /v1/danmaku?sceneKey=...&phase=combat`（返回该场景当前全部有效弹幕）
- `POST /v1/danmaku`
- `POST /v1/danmaku/{id}/report`
- `POST /v1/clears`（通关记录。同一 `runId` 只保留一行：新建返回 201，重复提交返回已有行和 200）
- `GET /v1/leaderboard?character=...&ascension=...&gameMode=...`（匹配记录按观察用时、写入时间、`runId` 升序）

通关记录写在另一个 D1 数据库 `gamebuddy-clears` 的 `clears` 表，绑定名是 `CLEARS_DB`。建表只用 `clears-schema.sql`，不要对 `gamebuddy-shared-danmaku` 执行它。弹幕仍使用原来的 `DB` 和 `shared_danmaku` 表。

弹幕只按职业、怪物组合和 `combat/death` 两种时机共享。服务端不保存玩家姓名或完整游戏状态；每个客户端每天最多提交 20 条，同一客户端在同一场景不能重复提交相同内容。
