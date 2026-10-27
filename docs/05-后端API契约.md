# 多人协作后端 API 契约（v1）

> 目标：10 人左右小团队，**共享内容库、各自打卡**；无密码、无注册表单，凭「工作区码 + 昵称」加入。
> 部署形态：Cloudflare Worker + D1（免费、持久）；本地开发/自托管用 Node 适配器跑同一套 handler。

## 0. 通用约定

- Base path：`/api`，全部 `application/json; charset=utf-8`。
- 鉴权：除 health / 创建 / 加入外，均需 `Authorization: Bearer <token>`。
- 成功：2xx + JSON；失败：`{ "error": { "code": "STRING_CODE", "message": "中文提示" } }`。
- 错误码：`BAD_REQUEST`(400) `UNAUTHORIZED`(401) `FORBIDDEN`(403) `NOT_FOUND`(404) `CONFLICT`(409) `RATE_LIMITED`(429) `PAYLOAD_TOO_LARGE`(413) `SERVER_ERROR`(500)。
- 请求体上限 256 KB；`saved.snapshot` 序列化后 ≤ 64 KB。
- 字段命名：`snake_case`（与前端类型映射在 `src/lib/api.ts` 完成）。
- CORS：`ALLOWED_ORIGINS` 环境变量（逗号分隔，`*` 允许全部）；允许 `Authorization, Content-Type`；`OPTIONS` 返回 204。
- 时间：毫秒时间戳（number）。日期：`YYYY-MM-DD`（Asia/Shanghai 由客户端计算后传入）。

## 1. 数据模型（D1）

```sql
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, nickname TEXT NOT NULL,
  token_hash TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
  settings TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_members_ws ON members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_members_token ON members(token_hash);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, member_id TEXT NOT NULL, date TEXT NOT NULL,
  title TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', done INTEGER NOT NULL DEFAULT 0,
  done_at INTEGER, is_template INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_member_date ON tasks(member_id, date);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, member_id TEXT NOT NULL,
  title TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_templates_member ON templates(member_id);

CREATE TABLE IF NOT EXISTS saved (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL,
  title TEXT NOT NULL, platform TEXT NOT NULL, snapshot TEXT NOT NULL, saved_at INTEGER NOT NULL,
  added_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_saved_ws ON saved(workspace_id);

-- 内容批次：只存「哪一天的第几批」，内容由客户端按 date+seq 确定性生成（Mock 阶段）
CREATE TABLE IF NOT EXISTS batches (
  workspace_id TEXT NOT NULL, kind TEXT NOT NULL, date TEXT NOT NULL,
  seq INTEGER NOT NULL, fetched_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, kind)
);
```

## 2. 接口

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/health` | 否 | `{ ok: true, version: "1", time: 123 }` |
| POST | `/api/workspaces` | 否 | body `{ name? }` → `{ workspaceId, code, name }`；code 为 6 位大写字母数字（去除易混淆 0O1I） |
| POST | `/api/sessions` | 否 | body `{ code, nickname }` → `{ token, memberId, workspaceId, code, nickname, workspaceName, settings }`；code 不存在 404，昵称 1–16 字 |
| POST | `/api/seed` | 是 | body `{ date }` → `{ tasks, templates }`；幂等：该成员该日无任务且无模板时，创建默认模板「离店房态价格」「排房」并生成当日清单 |
| GET | `/api/me` | 是 | `{ me:{id,nickname}, workspace:{id,code,name}, members:[{id,nickname,lastSeenAt,online}], onlineCount }`；同时刷新 last_seen_at |
| POST | `/api/heartbeat` | 是 | 同 `/api/me` 返回，供前端每 30s 轮询在线人数；`GET` 亦可（实现为 GET） |
| GET | `/api/tasks?date=YYYY-MM-DD` | 是 | `{ tasks: Task[] }`（仅本人的） |
| GET | `/api/tasks?from=&to=` | 是 | `{ tasks: Task[] }`；跨度 ≤ 400 天 |
| PUT | `/api/tasks/:id` | 是 | body 完整 Task → 2xx `{ task }`；不允许写入他人任务 |
| DELETE | `/api/tasks/:id` | 是 | `{ ok: true }`；他人任务 404 |
| GET | `/api/templates` | 是 | `{ templates: TaskTemplate[] }` |
| PUT | `/api/templates/:id` | 是 | body TaskTemplate → `{ template }` |
| DELETE | `/api/templates/:id` | 是 | `{ ok: true }` |
| GET | `/api/batches` | 是 | `{ topics: {date,seq,fetchedAt}|null, hotspots: ... }` |
| POST | `/api/batches/:kind/refresh` | 是 | kind ∈ topics/hotspots；body `{ date }` → `{ kind, date, seq, fetchedAt }`（同一天 seq+1；跨天从 1 开始） |
| GET | `/api/saved` | 是 | `{ saved: SavedItem[] }`（**工作区共享**） |
| PUT | `/api/saved/:id` | 是 | body SavedItem → `{ saved }`（工作区任意成员可写） |
| DELETE | `/api/saved/:id` | 是 | `{ ok: true }` |
| GET | `/api/settings` | 是 | `{ settings: object }`（成员级） |
| PUT | `/api/settings` | 是 | body 任意 JSON（≤16KB）→ `{ settings }` |
| GET | `/api/export` | 是 | `{ app:'hms', version:1, workspace, me, tasks, templates, saved, batches }` |
| POST | `/api/leave` | 是 | 退出工作区：删除该成员的任务与模板，昵称脱敏；`{ ok: true }` |

## 3. 校验与安全

- token：32 字节随机 base64url，仅存 SHA-256 十六进制摘要；返回给客户端一次。
- 工作区码：6 位，字符集 `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`，碰撞重试 5 次。
- 频率限制（内存计数，按 IP）：`/api/sessions` 10 次/分钟，`/api/workspaces` 5 次/小时，其余写接口 120 次/分钟/IP。
- 所有写接口按 `workspace_id` 过滤；任务/模板额外按 `member_id`，越权返回 404（不泄露存在性）。
- 输入长度：昵称 ≤16、工作区名 ≤24、任务标题 ≤60、备注 ≤200、saved.title ≤120。
- 禁止在响应中返回 token、token_hash、其他成员的任务。

## 4. 本地开发与测试

```bash
node server/dev.mjs         # http://127.0.0.1:8787 ，JSON 文件存储在 server/.data/
node scripts/api-test.mjs   # 集成测试（10 人并发、隔离、越权、限流、批次）
```

## 5. 云上部署（Cloudflare Worker + D1）

见 `docs/06-后端部署.md`。
