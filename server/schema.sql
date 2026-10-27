-- 多人协作后端表结构（D1 / SQLite 可直接执行）

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
