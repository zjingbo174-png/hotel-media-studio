/**
 * Cloudflare D1 storage 适配器：接口与 server/storage-json.mjs 完全一致。
 * 表结构见 server/schema.sql；行内 snake_case 在这里转换成 camelCase。
 */

const workspaceRow = (row) =>
  row
    ? { id: row.id, code: row.code, name: row.name, createdAt: row.created_at }
    : null;

const memberRow = (row) =>
  row
    ? {
        id: row.id,
        workspaceId: row.workspace_id,
        nickname: row.nickname,
        tokenHash: row.token_hash,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
        settings: row.settings,
      }
    : null;

const taskRow = (row) =>
  row
    ? {
        id: row.id,
        workspaceId: row.workspace_id,
        memberId: row.member_id,
        date: row.date,
        title: row.title,
        note: row.note,
        done: row.done,
        doneAt: row.done_at,
        isTemplate: row.is_template,
        sortOrder: row.sort_order,
        createdAt: row.created_at,
      }
    : null;

const templateRow = (row) =>
  row
    ? {
        id: row.id,
        workspaceId: row.workspace_id,
        memberId: row.member_id,
        title: row.title,
        note: row.note,
        sortOrder: row.sort_order,
        active: row.active,
      }
    : null;

const savedRow = (row) =>
  row
    ? {
        id: row.id,
        workspaceId: row.workspace_id,
        kind: row.kind,
        status: row.status,
        title: row.title,
        platform: row.platform,
        snapshot: row.snapshot,
        savedAt: row.saved_at,
        addedBy: row.added_by,
      }
    : null;

const batchRow = (row) =>
  row
    ? {
        workspaceId: row.workspace_id,
        kind: row.kind,
        date: row.date,
        seq: row.seq,
        fetchedAt: row.fetched_at,
      }
    : null;

export function createD1Storage(db) {
  if (!db) throw new Error('createD1Storage: 缺少 D1 binding');

  const all = async (statement) => (await statement.all()).results ?? [];
  const first = async (statement) => (await statement.first()) ?? null;

  const workspaces = {
    async create(workspace) {
      await db
        .prepare('INSERT INTO workspaces (id, code, name, created_at) VALUES (?, ?, ?, ?)')
        .bind(workspace.id, workspace.code, workspace.name, workspace.createdAt)
        .run();
    },
    async getByCode(code) {
      return workspaceRow(
        await first(db.prepare('SELECT * FROM workspaces WHERE code = ?').bind(code)),
      );
    },
    async getById(id) {
      return workspaceRow(
        await first(db.prepare('SELECT * FROM workspaces WHERE id = ?').bind(id)),
      );
    },
  };

  const members = {
    async create(member) {
      await db
        .prepare(
          `INSERT INTO members (id, workspace_id, nickname, token_hash, created_at, last_seen_at, settings)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          member.id,
          member.workspaceId,
          member.nickname,
          member.tokenHash,
          member.createdAt,
          member.lastSeenAt,
          member.settings,
        )
        .run();
    },
    async getById(id) {
      return memberRow(await first(db.prepare('SELECT * FROM members WHERE id = ?').bind(id)));
    },
    async getByTokenHash(tokenHash) {
      return memberRow(
        await first(db.prepare('SELECT * FROM members WHERE token_hash = ?').bind(tokenHash)),
      );
    },
    async listByWorkspace(workspaceId) {
      return (
        await all(
          db
            .prepare('SELECT * FROM members WHERE workspace_id = ? ORDER BY created_at ASC, id ASC')
            .bind(workspaceId),
        )
      ).map(memberRow);
    },
    async update(id, patch) {
      const sets = [];
      const values = [];
      const columns = { nickname: 'nickname', lastSeenAt: 'last_seen_at', settings: 'settings' };
      for (const [key, column] of Object.entries(columns)) {
        if (patch[key] !== undefined) {
          sets.push(`${column} = ?`);
          values.push(patch[key]);
        }
      }
      if (sets.length === 0) return members.getById(id);
      values.push(id);
      await db.prepare(`UPDATE members SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
      return members.getById(id);
    },
  };

  const tasks = {
    async getById(id) {
      return taskRow(await first(db.prepare('SELECT * FROM tasks WHERE id = ?').bind(id)));
    },
    async listByMemberDate(memberId, date) {
      return (
        await all(
          db
            .prepare(
              `SELECT * FROM tasks WHERE member_id = ? AND date = ?
               ORDER BY sort_order ASC, created_at ASC, id ASC`,
            )
            .bind(memberId, date),
        )
      ).map(taskRow);
    },
    async listByMemberRange(memberId, from, to) {
      return (
        await all(
          db
            .prepare(
              `SELECT * FROM tasks WHERE member_id = ? AND date >= ? AND date <= ?
               ORDER BY date ASC, sort_order ASC, created_at ASC, id ASC`,
            )
            .bind(memberId, from, to),
        )
      ).map(taskRow);
    },
    async listByMember(memberId) {
      return (
        await all(
          db
            .prepare(
              `SELECT * FROM tasks WHERE member_id = ?
               ORDER BY date ASC, sort_order ASC, created_at ASC, id ASC`,
            )
            .bind(memberId),
        )
      ).map(taskRow);
    },
    async put(task) {
      await db
        .prepare(
          `INSERT INTO tasks
             (id, workspace_id, member_id, date, title, note, done, done_at, is_template, sort_order, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             workspace_id = excluded.workspace_id,
             member_id = excluded.member_id,
             date = excluded.date,
             title = excluded.title,
             note = excluded.note,
             done = excluded.done,
             done_at = excluded.done_at,
             is_template = excluded.is_template,
             sort_order = excluded.sort_order,
             created_at = excluded.created_at`,
        )
        .bind(
          task.id,
          task.workspaceId,
          task.memberId,
          task.date,
          task.title,
          task.note,
          task.done,
          task.doneAt,
          task.isTemplate,
          task.sortOrder,
          task.createdAt,
        )
        .run();
    },
    async createMany(rows) {
      if (rows.length === 0) return;
      await db.batch(
        rows.map((task) =>
          db
            .prepare(
              `INSERT OR IGNORE INTO tasks
                 (id, workspace_id, member_id, date, title, note, done, done_at, is_template, sort_order, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              task.id,
              task.workspaceId,
              task.memberId,
              task.date,
              task.title,
              task.note,
              task.done,
              task.doneAt,
              task.isTemplate,
              task.sortOrder,
              task.createdAt,
            ),
        ),
      );
    },
    async delete(id, memberId, workspaceId) {
      const result = await db
        .prepare('DELETE FROM tasks WHERE id = ? AND member_id = ? AND workspace_id = ?')
        .bind(id, memberId, workspaceId)
        .run();
      return (result.meta?.changes ?? 0) > 0;
    },
    async deleteByMember(memberId) {
      const result = await db.prepare('DELETE FROM tasks WHERE member_id = ?').bind(memberId).run();
      return result.meta?.changes ?? 0;
    },
  };

  const templates = {
    async getById(id) {
      return templateRow(await first(db.prepare('SELECT * FROM templates WHERE id = ?').bind(id)));
    },
    async listByMember(memberId) {
      return (
        await all(
          db
            .prepare(
              'SELECT * FROM templates WHERE member_id = ? ORDER BY sort_order ASC, id ASC',
            )
            .bind(memberId),
        )
      ).map(templateRow);
    },
    async put(template) {
      await db
        .prepare(
          `INSERT INTO templates (id, workspace_id, member_id, title, note, sort_order, active)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             workspace_id = excluded.workspace_id,
             member_id = excluded.member_id,
             title = excluded.title,
             note = excluded.note,
             sort_order = excluded.sort_order,
             active = excluded.active`,
        )
        .bind(
          template.id,
          template.workspaceId,
          template.memberId,
          template.title,
          template.note,
          template.sortOrder,
          template.active,
        )
        .run();
    },
    async createMany(rows) {
      if (rows.length === 0) return;
      await db.batch(
        rows.map((template) =>
          db
            .prepare(
              `INSERT OR IGNORE INTO templates
                 (id, workspace_id, member_id, title, note, sort_order, active)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              template.id,
              template.workspaceId,
              template.memberId,
              template.title,
              template.note,
              template.sortOrder,
              template.active,
            ),
        ),
      );
    },
    async delete(id, memberId, workspaceId) {
      const result = await db
        .prepare('DELETE FROM templates WHERE id = ? AND member_id = ? AND workspace_id = ?')
        .bind(id, memberId, workspaceId)
        .run();
      return (result.meta?.changes ?? 0) > 0;
    },
    async deleteByMember(memberId) {
      const result = await db
        .prepare('DELETE FROM templates WHERE member_id = ?')
        .bind(memberId)
        .run();
      return result.meta?.changes ?? 0;
    },
  };

  const saved = {
    async getById(id) {
      return savedRow(await first(db.prepare('SELECT * FROM saved WHERE id = ?').bind(id)));
    },
    async listByWorkspace(workspaceId) {
      return (
        await all(
          db
            .prepare(
              'SELECT * FROM saved WHERE workspace_id = ? ORDER BY saved_at DESC, id ASC',
            )
            .bind(workspaceId),
        )
      ).map(savedRow);
    },
    async put(item) {
      await db
        .prepare(
          `INSERT INTO saved
             (id, workspace_id, kind, status, title, platform, snapshot, saved_at, added_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             workspace_id = excluded.workspace_id,
             kind = excluded.kind,
             status = excluded.status,
             title = excluded.title,
             platform = excluded.platform,
             snapshot = excluded.snapshot,
             saved_at = excluded.saved_at,
             added_by = excluded.added_by`,
        )
        .bind(
          item.id,
          item.workspaceId,
          item.kind,
          item.status,
          item.title,
          item.platform,
          item.snapshot,
          item.savedAt,
          item.addedBy,
        )
        .run();
    },
    async delete(id, workspaceId) {
      const result = await db
        .prepare('DELETE FROM saved WHERE id = ? AND workspace_id = ?')
        .bind(id, workspaceId)
        .run();
      return (result.meta?.changes ?? 0) > 0;
    },
  };

  const batches = {
    async listByWorkspace(workspaceId) {
      return (
        await all(db.prepare('SELECT * FROM batches WHERE workspace_id = ?').bind(workspaceId))
      ).map(batchRow);
    },
    async bump({ workspaceId, kind, date, fetchedAt }) {
      // upsert + select 放在同一个 batch（隐式事务）里，读回真的 seq
      const results = await db.batch([
        db
          .prepare(
            `INSERT INTO batches (workspace_id, kind, date, seq, fetched_at)
             VALUES (?, ?, ?, 1, ?)
             ON CONFLICT(workspace_id, kind) DO UPDATE SET
               date = excluded.date,
               seq = CASE WHEN batches.date = excluded.date THEN batches.seq + 1 ELSE 1 END,
               fetched_at = excluded.fetched_at`,
          )
          .bind(workspaceId, kind, date, fetchedAt),
        db
          .prepare('SELECT * FROM batches WHERE workspace_id = ? AND kind = ?')
          .bind(workspaceId, kind),
      ]);
      const row = results?.[1]?.results?.[0];
      if (!row) throw new Error('批次写入后读取失败');
      return batchRow(row);
    },
  };

  return { workspaces, members, tasks, templates, saved, batches };
}
