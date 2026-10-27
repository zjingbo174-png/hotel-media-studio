import { getDB } from './db';
import type {
  Hotspot,
  HotspotBatch,
  SavedItem,
  Settings,
  Task,
  TaskTemplate,
  Topic,
  TopicBatch,
} from '../types';
import { SCHEMA_VERSION } from '../types';
import { todayKey } from './clock';

const PRESET_TEMPLATES: Array<Pick<TaskTemplate, 'id' | 'title' | 'order'>> = [
  { id: 'tpl-room-rate', title: '离店房态价格', order: 0 },
  { id: 'tpl-room-assign', title: '排房', order: 1 },
];

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  navStyle: 'side',
  reminderTime: '18:00',
  browserNotify: false,
  lastRemindedDate: null,
  lastSeedDate: null,
  dataSource: 'mock',
  schemaVersion: SCHEMA_VERSION,
};

/* ---------------- tasks ---------------- */

export async function getTasksByDate(date: string): Promise<Task[]> {
  const db = await getDB();
  const rows = await db.getAllFromIndex('tasks', 'byDate', date);
  return rows.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export async function putTask(task: Task): Promise<void> {
  const db = await getDB();
  await db.put('tasks', task);
}

export async function deleteTask(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('tasks', id);
}

export async function getTasksBetween(start: string, end: string): Promise<Task[]> {
  const db = await getDB();
  const rows = await db.getAllFromIndex('tasks', 'byDate', IDBKeyRange.bound(start, end));
  return rows;
}

export async function getAllTasks(): Promise<Task[]> {
  const db = await getDB();
  return db.getAll('tasks');
}

/* ---------------- templates ---------------- */

export async function getTemplates(): Promise<TaskTemplate[]> {
  const db = await getDB();
  const rows = await db.getAll('templates');
  return rows.sort((a, b) => a.order - b.order);
}

export async function ensureTemplates(): Promise<TaskTemplate[]> {
  const existing = await getTemplates();
  if (existing.length > 0) return existing;
  const db = await getDB();
  const tx = db.transaction('templates', 'readwrite');
  for (const p of PRESET_TEMPLATES) {
    await tx.store.put({ ...p, note: '', active: true });
  }
  await tx.done;
  return getTemplates();
}

export async function putTemplate(tpl: TaskTemplate): Promise<void> {
  const db = await getDB();
  await db.put('templates', tpl);
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('templates', id);
}

/* ---------------- batches ---------------- */

export async function getTopicBatch(): Promise<TopicBatch | null> {
  const db = await getDB();
  const row = await db.get('topics', 'current');
  return row ? { meta: row.meta, items: row.items } : null;
}

export async function putTopicBatch(batch: TopicBatch): Promise<void> {
  const db = await getDB();
  await db.put('topics', { id: 'current', meta: batch.meta, items: batch.items });
}

export async function getHotspotBatch(): Promise<HotspotBatch | null> {
  const db = await getDB();
  const row = await db.get('hotspots', 'current');
  return row ? { meta: row.meta, items: row.items } : null;
}

export async function putHotspotBatch(batch: HotspotBatch): Promise<void> {
  const db = await getDB();
  await db.put('hotspots', { id: 'current', meta: batch.meta, items: batch.items });
}

/* ---------------- saved (内容库) ---------------- */

export async function getSavedItems(): Promise<SavedItem[]> {
  const db = await getDB();
  const rows = await db.getAll('saved');
  return rows.sort((a, b) => b.savedAt - a.savedAt);
}

export async function putSavedItem(item: SavedItem): Promise<void> {
  const db = await getDB();
  await db.put('saved', item);
}

export async function deleteSavedItem(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('saved', id);
}

/* ---------------- settings ---------------- */

export async function getSettings(): Promise<Settings> {
  const db = await getDB();
  const row = await db.get('settings', 'app');
  return row ? { ...DEFAULT_SETTINGS, ...row } : DEFAULT_SETTINGS;
}

export async function putSettings(next: Settings): Promise<void> {
  const db = await getDB();
  await db.put('settings', next);
}

/* ---------------- 首次初始化 ---------------- */

/** 首次打开：初始化模板与设置；并按模板生成当天清单（每天只种一次，删除后不会复活）。 */
export async function bootstrap(date: string = todayKey()): Promise<void> {
  await ensureTemplates();
  const settings = await getSettings();
  if (!settings.schemaVersion) {
    await putSettings({ ...settings, schemaVersion: SCHEMA_VERSION });
  }
  if (settings.lastSeedDate === date) return;
  const tasks = await getTasksByDate(date);
  if (tasks.length === 0) {
    const templates = await getTemplates();
    let order = 0;
    for (const tpl of templates) {
      if (!tpl.active) continue;
      await putTask({
        id: `${date}:${tpl.id}`,
        date,
        title: tpl.title,
        note: tpl.note,
        done: false,
        doneAt: null,
        isTemplate: true,
        order: order++,
        createdAt: Date.now(),
      });
    }
  }
  await putSettings({ ...settings, lastSeedDate: date });
}

/* ---------------- 导入 / 导出 ---------------- */

export interface BackupFile {
  app: 'hotel-media-studio';
  version: number;
  exportedAt: string;
  tasks: Task[];
  templates: TaskTemplate[];
  topics: TopicBatch | null;
  hotspots: HotspotBatch | null;
  saved: SavedItem[];
  settings: Settings;
}

export async function exportBackup(): Promise<BackupFile> {
  const db = await getDB();
  return {
    app: 'hotel-media-studio',
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks: await db.getAll('tasks'),
    templates: await db.getAll('templates'),
    topics: await getTopicBatch(),
    hotspots: await getHotspotBatch(),
    saved: await db.getAll('saved'),
    settings: await getSettings(),
  };
}

export interface ImportResult {
  tasks: number;
  templates: number;
  saved: number;
}

const MAX_TASKS = 5000;
const MAX_SAVED = 5000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanText(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, max);
}

function asTask(raw: unknown): Task {
  const t = raw as Partial<Task>;
  if (!t || typeof t.id !== 'string' || typeof t.date !== 'string' || !DATE_RE.test(t.date)) {
    throw new Error('备份里的任务格式不正确');
  }
  return {
    id: cleanText(t.id, 80),
    date: t.date,
    title: cleanText(t.title, 60) || '未命名任务',
    note: cleanText(t.note, 200),
    done: !!t.done,
    doneAt: typeof t.doneAt === 'number' ? t.doneAt : null,
    isTemplate: !!t.isTemplate,
    order: Number.isFinite(t.order) ? Number(t.order) : 0,
    createdAt: Number.isFinite(t.createdAt) ? Number(t.createdAt) : Date.now(),
  };
}

/** 导入前做结构与体量校验，避免坏文件/超大文件把页面卡死 */
export async function importBackup(raw: unknown): Promise<ImportResult> {
  const data = raw as Partial<BackupFile>;
  if (!data || data.app !== 'hotel-media-studio') {
    throw new Error('不是本工作台的备份文件');
  }
  if (!Array.isArray(data.tasks)) throw new Error('备份文件缺少 tasks 字段');
  if (data.tasks.length > MAX_TASKS) throw new Error(`任务数量超过上限（${MAX_TASKS}）`);
  if (Array.isArray(data.saved) && data.saved.length > MAX_SAVED) {
    throw new Error(`收藏数量超过上限（${MAX_SAVED}）`);
  }

  const tasks = data.tasks.map(asTask);
  const templates: TaskTemplate[] = Array.isArray(data.templates)
    ? data.templates.slice(0, 200).map((t) => ({
        id: cleanText(t.id, 80) || `tpl-${Math.random().toString(36).slice(2, 8)}`,
        title: cleanText(t.title, 60) || '未命名任务',
        note: cleanText(t.note, 200),
        order: Number.isFinite(t.order) ? Number(t.order) : 0,
        active: t.active !== false,
      }))
    : [];

  const saved: SavedItem[] = Array.isArray(data.saved)
    ? data.saved
        .slice(0, MAX_SAVED)
        .filter((s): s is SavedItem => {
          if (!s || typeof s.id !== 'string') return false;
          if (s.kind !== 'topic' && s.kind !== 'hotspot') return false;
          const snap = s.snapshot as unknown as Record<string, unknown> | undefined;
          if (!snap || typeof snap !== 'object' || typeof snap.title !== 'string') return false;
          if (!Array.isArray(snap.tags)) return false;
          if (s.kind === 'topic' && !(snap.analysis && Array.isArray(snap.ideas))) return false;
          if (s.kind === 'hotspot' && !Array.isArray(snap.plans)) return false;
          return true;
        })
        .map((s) => ({
          ...s,
          id: cleanText(s.id, 120),
          title: cleanText(s.title, 120),
          status: s.status === 'used' ? 'used' : 'saved',
        }))
    : [];

  const db = await getDB();
  const tx = db.transaction(['tasks', 'templates', 'saved', 'settings', 'topics', 'hotspots'], 'readwrite');
  await tx.objectStore('tasks').clear();
  await tx.objectStore('saved').clear();
  for (const t of tasks) await tx.objectStore('tasks').put(t);
  if (templates.length > 0) {
    await tx.objectStore('templates').clear();
    for (const t of templates) await tx.objectStore('templates').put(t);
  }
  for (const s of saved) await tx.objectStore('saved').put(s);
  if (data.settings) await tx.objectStore('settings').put({ ...DEFAULT_SETTINGS, ...data.settings });
  if (data.topics?.meta && Array.isArray(data.topics.items)) {
    await tx.objectStore('topics').put({ id: 'current', meta: data.topics.meta, items: data.topics.items.slice(0, 100) });
  }
  if (data.hotspots?.meta && Array.isArray(data.hotspots.items)) {
    await tx
      .objectStore('hotspots')
      .put({ id: 'current', meta: data.hotspots.meta, items: data.hotspots.items.slice(0, 100) });
  }
  await tx.done;
  return { tasks: tasks.length, templates: templates.length, saved: saved.length };
}

export async function clearAll(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['tasks', 'templates', 'topics', 'hotspots', 'saved', 'settings'], 'readwrite');
  await Promise.all([
    tx.objectStore('tasks').clear(),
    tx.objectStore('templates').clear(),
    tx.objectStore('topics').clear(),
    tx.objectStore('hotspots').clear(),
    tx.objectStore('saved').clear(),
    tx.objectStore('settings').clear(),
  ]);
  await tx.done;
}

export type { Hotspot, Topic };
