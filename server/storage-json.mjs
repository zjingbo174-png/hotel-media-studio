/**
 * Node 端 JSON 文件存储：实现与 D1 相同的 storage 接口。
 * - 数据常驻内存，每次变更整体写回；
 * - 先写临时文件再 rename，避免半个文件；
 * - 所有写操作走串行队列，避免并发覆盖；
 * - 默认 server/.data/db.json，可用 env HMS_DATA_FILE 覆盖。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_FILE = fileURLToPath(new URL('./.data/db.json', import.meta.url));

function emptyDb() {
  return {
    version: 1,
    workspaces: [],
    members: [],
    tasks: [],
    templates: [],
    saved: [],
    batches: [],
  };
}

/** 基础字段做一次浅拷贝，避免 handler 意外改到内存库。 */
const clone = (row) => (row ? { ...row } : null);
const cloneAll = (rows) => rows.map((row) => ({ ...row }));

export async function createJsonStorage({ file } = {}) {
  const dataFile = path.resolve(file || process.env.HMS_DATA_FILE || DEFAULT_FILE);
  const db = await load(dataFile);

  let tail = Promise.resolve();

  async function persist() {
    await writeAtomic(dataFile, `${JSON.stringify(db, null, 2)}\n`);
  }

  /** 串行执行写操作，返回操作结果。 */
  function mutate(fn) {
    const run = async () => {
      const result = await fn();
      await persist();
      return result;
    };
    const task = tail.then(run, run);
    tail = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  const workspaces = {
    create(workspace) {
      return mutate(() => {
        db.workspaces.push({ ...workspace });
      });
    },
    async getByCode(code) {
      return clone(db.workspaces.find((w) => w.code === code));
    },
    async getById(id) {
      return clone(db.workspaces.find((w) => w.id === id));
    },
  };

  const members = {
    create(member) {
      return mutate(() => {
        db.members.push({ ...member });
      });
    },
    async getById(id) {
      return clone(db.members.find((m) => m.id === id));
    },
    async getByTokenHash(tokenHash) {
      return clone(db.members.find((m) => m.tokenHash === tokenHash));
    },
    async listByWorkspace(workspaceId) {
      return cloneAll(
        db.members
          .filter((m) => m.workspaceId === workspaceId)
          .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)),
      );
    },
    update(id, patch) {
      return mutate(() => {
        const member = db.members.find((m) => m.id === id);
        if (!member) return null;
        for (const key of ['nickname', 'lastSeenAt', 'settings']) {
          if (patch[key] !== undefined) member[key] = patch[key];
        }
        return { ...member };
      });
    },
  };

  const tasks = {
    async getById(id) {
      return clone(db.tasks.find((t) => t.id === id));
    },
    async listByMemberDate(memberId, date) {
      return cloneAll(
        db.tasks
          .filter((t) => t.memberId === memberId && t.date === date)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt || a.id.localeCompare(b.id)),
      );
    },
    async listByMemberRange(memberId, from, to) {
      return cloneAll(
        db.tasks
          .filter((t) => t.memberId === memberId && t.date >= from && t.date <= to)
          .sort(
            (a, b) =>
              a.date.localeCompare(b.date) ||
              a.sortOrder - b.sortOrder ||
              a.createdAt - b.createdAt ||
              a.id.localeCompare(b.id),
          ),
      );
    },
    async listByMember(memberId) {
      return cloneAll(
        db.tasks
          .filter((t) => t.memberId === memberId)
          .sort(
            (a, b) =>
              a.date.localeCompare(b.date) ||
              a.sortOrder - b.sortOrder ||
              a.createdAt - b.createdAt ||
              a.id.localeCompare(b.id),
          ),
      );
    },
    put(task) {
      return mutate(() => {
        const index = db.tasks.findIndex((t) => t.id === task.id);
        if (index >= 0) db.tasks[index] = { ...task };
        else db.tasks.push({ ...task });
      });
    },
    createMany(rows) {
      return mutate(() => {
        for (const row of rows) {
          if (!db.tasks.some((t) => t.id === row.id)) db.tasks.push({ ...row });
        }
      });
    },
    delete(id, memberId, workspaceId) {
      return mutate(() => {
        const index = db.tasks.findIndex(
          (t) => t.id === id && t.memberId === memberId && t.workspaceId === workspaceId,
        );
        if (index < 0) return false;
        db.tasks.splice(index, 1);
        return true;
      });
    },
    deleteByMember(memberId) {
      return mutate(() => {
        const before = db.tasks.length;
        db.tasks = db.tasks.filter((t) => t.memberId !== memberId);
        return before - db.tasks.length;
      });
    },
  };

  const templates = {
    async getById(id) {
      return clone(db.templates.find((t) => t.id === id));
    },
    async listByMember(memberId) {
      return cloneAll(
        db.templates
          .filter((t) => t.memberId === memberId)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
      );
    },
    put(template) {
      return mutate(() => {
        const index = db.templates.findIndex((t) => t.id === template.id);
        if (index >= 0) db.templates[index] = { ...template };
        else db.templates.push({ ...template });
      });
    },
    createMany(rows) {
      return mutate(() => {
        for (const row of rows) {
          if (!db.templates.some((t) => t.id === row.id)) db.templates.push({ ...row });
        }
      });
    },
    delete(id, memberId, workspaceId) {
      return mutate(() => {
        const index = db.templates.findIndex(
          (t) => t.id === id && t.memberId === memberId && t.workspaceId === workspaceId,
        );
        if (index < 0) return false;
        db.templates.splice(index, 1);
        return true;
      });
    },
    deleteByMember(memberId) {
      return mutate(() => {
        const before = db.templates.length;
        db.templates = db.templates.filter((t) => t.memberId !== memberId);
        return before - db.templates.length;
      });
    },
  };

  const saved = {
    async getById(id) {
      return clone(db.saved.find((s) => s.id === id));
    },
    async listByWorkspace(workspaceId) {
      return cloneAll(
        db.saved
          .filter((s) => s.workspaceId === workspaceId)
          .sort((a, b) => b.savedAt - a.savedAt || a.id.localeCompare(b.id)),
      );
    },
    put(item) {
      return mutate(() => {
        const index = db.saved.findIndex((s) => s.id === item.id);
        if (index >= 0) db.saved[index] = { ...item };
        else db.saved.push({ ...item });
      });
    },
    delete(id, workspaceId) {
      return mutate(() => {
        const index = db.saved.findIndex((s) => s.id === id && s.workspaceId === workspaceId);
        if (index < 0) return false;
        db.saved.splice(index, 1);
        return true;
      });
    },
  };

  const batches = {
    async listByWorkspace(workspaceId) {
      return cloneAll(db.batches.filter((b) => b.workspaceId === workspaceId));
    },
    /** 同一天 seq+1，跨天从 1 开始；整个读改写在一把锁里完成。 */
    bump({ workspaceId, kind, date, fetchedAt }) {
      return mutate(() => {
        const row = db.batches.find((b) => b.workspaceId === workspaceId && b.kind === kind);
        if (!row) {
          const created = { workspaceId, kind, date, seq: 1, fetchedAt };
          db.batches.push(created);
          return { ...created };
        }
        if (row.date === date) row.seq += 1;
        else {
          row.date = date;
          row.seq = 1;
        }
        row.fetchedAt = fetchedAt;
        return { ...row };
      });
    },
  };

  return { file: dataFile, workspaces, members, tasks, templates, saved, batches };
}

async function load(dataFile) {
  try {
    const raw = await fs.readFile(dataFile, 'utf8');
    const parsed = JSON.parse(raw);
    const db = emptyDb();
    for (const key of Object.keys(db)) {
      if (Array.isArray(parsed[key])) db[key] = parsed[key];
    }
    return db;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw new Error(`读取数据文件失败（${dataFile}）：${err.message}`);
    }
    const db = emptyDb();
    await writeAtomic(dataFile, `${JSON.stringify(db, null, 2)}\n`);
    return db;
  }
}

/** 先写临时文件再 rename；Windows 上 rename 覆盖偶尔 EPERM，降级为重试。 */
async function writeAtomic(dataFile, content) {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  const tempFile = `${dataFile}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.writeFile(tempFile, content, 'utf8');
  try {
    await fs.rename(tempFile, dataFile);
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EEXIST' || err.code === 'EBUSY') {
      await fs.rm(dataFile, { force: true });
      await fs.rename(tempFile, dataFile);
      return;
    }
    await fs.rm(tempFile, { force: true });
    throw err;
  }
}
