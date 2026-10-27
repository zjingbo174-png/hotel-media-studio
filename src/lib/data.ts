import type {
  BatchMeta,
  HotspotBatch,
  SavedItem,
  Settings,
  Task,
  TaskTemplate,
  TopicBatch,
} from '../types';
import { DEFAULT_SETTINGS, type BackupFile, type ImportResult } from './repo';
import * as local from './repo';
import * as api from './api';
import { getSource } from './source';
import { getSession, isOnline } from '../store/session';
import { addDays, todayKey } from './clock';
import { fingerprint } from './format';

/** 内容库条目 id：在线模式带上工作区码，避免同一内容在不同工作区主键冲突 */
export function savedItemId(kind: 'topic' | 'hotspot', platform: string, title: string): string {
  const session = getSession();
  const scope = session?.mode === 'online' ? session.code : 'local';
  return `${kind}:${scope}:${fingerprint(platform, title)}`;
}

/**
 * 数据访问统一入口：
 * - local 模式 → IndexedDB（repo.ts），离线可用；
 * - online 模式 → 协作服务（api.ts），工作区共享内容库，任务按成员隔离。
 * 页面对 store 的调用不关心底层模式。
 */

export type BatchKind = 'topics' | 'hotspots';

export { DEFAULT_SETTINGS };
export type { BackupFile, ImportResult };

function requireSession() {
  const session = getSession();
  if (!session || session.mode !== 'online') {
    throw new api.ApiError('NOT_ONLINE', '当前不是在线协作模式');
  }
  return session;
}

/* ---------------- 初始化与清单 ---------------- */

export async function bootstrap(date: string = todayKey()): Promise<void> {
  if (isOnline()) {
    requireSession();
    await api.seed(date);
    return;
  }
  await local.bootstrap(date);
}

export async function getTasksByDate(date: string): Promise<Task[]> {
  if (isOnline()) return api.getTasks({ date });
  return local.getTasksByDate(date);
}

export async function putTask(task: Task): Promise<void> {
  if (isOnline()) {
    await api.putTask(task);
    return;
  }
  await local.putTask(task);
}

export async function deleteTask(id: string): Promise<void> {
  if (isOnline()) {
    await api.deleteTaskRemote(id);
    return;
  }
  await local.deleteTask(id);
}

export async function getTasksBetween(start: string, end: string): Promise<Task[]> {
  if (isOnline()) return api.getTasks({ from: start, to: end });
  return local.getTasksBetween(start, end);
}

export async function getAllTasks(): Promise<Task[]> {
  if (isOnline()) {
    const today = todayKey();
    return api.getTasks({ from: addDays(today, -395), to: today });
  }
  return local.getAllTasks();
}

/* ---------------- 每日固定模板 ---------------- */

export async function getTemplates(): Promise<TaskTemplate[]> {
  if (isOnline()) return api.getTemplates();
  return local.getTemplates();
}

export async function ensureTemplates(): Promise<TaskTemplate[]> {
  if (isOnline()) {
    await api.seed(todayKey());
    return api.getTemplates();
  }
  return local.ensureTemplates();
}

export async function putTemplate(tpl: TaskTemplate): Promise<void> {
  if (isOnline()) {
    await api.putTemplateRemote(tpl);
    return;
  }
  await local.putTemplate(tpl);
}

export async function deleteTemplate(id: string): Promise<void> {
  if (isOnline()) {
    await api.deleteTemplateRemote(id);
    return;
  }
  await local.deleteTemplate(id);
}

/* ---------------- 内容批次 ---------------- */

/** 生成下一批（本地：seq+1；在线：服务端 seq+1，保证所有人看到同一批） */
export async function nextBatchMeta(kind: BatchKind, date: string): Promise<BatchMeta> {
  if (isOnline()) {
    requireSession();
    const res = await api.refreshBatchRemote(kind, date);
    return { id: `${date}#${kind}-${res.seq}`, date: res.date, seq: res.seq, fetchedAt: res.fetchedAt, sourceId: 'mock' };
  }
  const current = kind === 'topics' ? await local.getTopicBatch() : await local.getHotspotBatch();
  const seq = current && current.meta.date === date ? current.meta.seq + 1 : 0;
  return { id: `${date}#${kind}-${seq}`, date, seq, fetchedAt: Date.now(), sourceId: 'mock' };
}

export async function buildBatch(kind: BatchKind, date: string, seq: number): Promise<TopicBatch | HotspotBatch> {
  const source = getSource();
  return kind === 'topics' ? source.fetchTopics(date, seq) : source.fetchHotspots(date, seq);
}

export async function getTopicBatch(): Promise<TopicBatch | null> {
  if (isOnline()) {
    const { topics } = await api.getBatches();
    if (!topics) return null;
    return getSource().fetchTopics(topics.date, topics.seq);
  }
  return local.getTopicBatch();
}

export async function putTopicBatch(batch: TopicBatch): Promise<void> {
  if (isOnline()) return; // 在线模式的批次由服务端 seq 决定，内容本地确定性生成
  await local.putTopicBatch(batch);
}

export async function getHotspotBatch(): Promise<HotspotBatch | null> {
  if (isOnline()) {
    const { hotspots } = await api.getBatches();
    if (!hotspots) return null;
    return getSource().fetchHotspots(hotspots.date, hotspots.seq);
  }
  return local.getHotspotBatch();
}

export async function putHotspotBatch(batch: HotspotBatch): Promise<void> {
  if (isOnline()) return;
  await local.putHotspotBatch(batch);
}

/* ---------------- 内容库（在线为工作区共享） ---------------- */

export async function getSavedItems(): Promise<SavedItem[]> {
  if (isOnline()) return api.getSaved();
  return local.getSavedItems();
}

export async function putSavedItem(item: SavedItem): Promise<void> {
  if (isOnline()) {
    await api.putSavedRemote(item);
    return;
  }
  await local.putSavedItem(item);
}

export async function deleteSavedItem(id: string): Promise<void> {
  if (isOnline()) {
    await api.deleteSavedRemote(id);
    return;
  }
  await local.deleteSavedItem(id);
}

/* ---------------- 设置 ---------------- */

export async function getSettings(): Promise<Settings> {
  if (isOnline()) {
    const remote = await api.getSettingsRemote();
    return { ...DEFAULT_SETTINGS, ...remote, id: 'app' };
  }
  return local.getSettings();
}

export async function putSettings(next: Settings): Promise<void> {
  if (isOnline()) {
    await api.putSettingsRemote(next);
    return;
  }
  await local.putSettings(next);
}

/* ---------------- 备份 / 清空 ---------------- */

export async function exportBackup(): Promise<BackupFile> {
  if (isOnline()) return api.exportRemote();
  return local.exportBackup();
}

export async function importBackup(raw: unknown): Promise<ImportResult> {
  if (isOnline()) {
    throw new api.ApiError('UNSUPPORTED', '在线协作模式下不支持导入；请先退出工作区，切回本地模式再导入');
  }
  return local.importBackup(raw);
}

export async function clearAll(): Promise<void> {
  if (isOnline()) {
    throw new api.ApiError('UNSUPPORTED', '在线模式下请使用「退出工作区」');
  }
  await local.clearAll();
}

export async function leaveWorkspace(): Promise<void> {
  requireSession();
  await api.leaveWorkspace();
}
