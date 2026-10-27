import type { Hotspot, HotspotBatch, SavedItem, Settings, Task, TaskTemplate, Topic, TopicBatch } from '../types';
import { getSession, useSessionStore } from '../store/session';
import { DEFAULT_SETTINGS, type BackupFile } from './repo';

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/** 后端返回的 snake_case DTO */
interface TaskDTO {
  id: string;
  date: string;
  title: string;
  note?: string;
  done: number | boolean;
  done_at: number | null;
  is_template: number | boolean;
  sort_order: number;
  created_at: number;
}
interface TemplateDTO {
  id: string;
  title: string;
  note?: string;
  sort_order: number;
  active: number | boolean;
}
interface SavedDTO {
  id: string;
  kind: 'topic' | 'hotspot';
  status: 'saved' | 'used';
  title: string;
  platform: 'douyin' | 'xiaohongshu';
  snapshot: unknown;
  saved_at: number;
}

async function requestWithBase<T>(
  apiBase: string,
  path: string,
  init: RequestInit = {},
  timeoutMs = 15000,
): Promise<T> {
  const session = getSession();
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBase.replace(/\/$/, '')}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const err = json?.error ?? {};
      // token 失效：清掉会话，提示重新加入，避免所有请求持续 401
      if (res.status === 401 && !path.startsWith('/api/sessions')) {
        useSessionStore.getState().setSession(null);
        throw new ApiError('UNAUTHORIZED', '登录状态已失效，请重新加入工作区', 401);
      }
      throw new ApiError(err.code ?? `HTTP_${res.status}`, err.message ?? `请求失败（${res.status}）`, res.status);
    }
    return json as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('TIMEOUT', '服务响应超时，请检查网络或服务地址');
    }
    throw new ApiError('NETWORK', '连接不上协作服务，请检查网络与服务地址');
  } finally {
    window.clearTimeout(timer);
  }
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 15000): Promise<T> {
  const session = getSession();
  const base = session?.apiBase?.replace(/\/$/, '');
  if (!base) throw new ApiError('NO_SERVER', '还没有配置后端服务地址');
  return requestWithBase<T>(base, path, init, timeoutMs);
}

/* ---------------- 健康检查 / 会话 ---------------- */

export async function health(apiBase: string): Promise<{ ok: boolean; version: string }> {
  const res = await fetch(`${apiBase.replace(/\/$/, '')}/api/health`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new ApiError('HEALTH_FAIL', '服务地址不可用');
  return (await res.json()) as { ok: boolean; version: string };
}

export interface SessionResponse {
  token: string;
  memberId: string;
  workspaceId: string;
  code: string;
  nickname: string;
  workspaceName: string;
  settings?: Settings;
}

export function createWorkspace(name: string, apiBase: string): Promise<{ workspaceId: string; code: string; name: string }> {
  return requestWithBase(apiBase, '/api/workspaces', { method: 'POST', body: JSON.stringify({ name }) });
}

export function joinWorkspace(code: string, nickname: string, apiBase: string): Promise<SessionResponse> {
  return requestWithBase(apiBase, '/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ code, nickname }),
  });
}

export interface MemberInfo {
  id: string;
  nickname: string;
  lastSeenAt: number;
  online: boolean;
}

export interface MeResponse {
  me: { id: string; nickname: string };
  workspace: { id: string; code: string; name: string };
  members: MemberInfo[];
  onlineCount: number;
}

export function getMe(): Promise<MeResponse> {
  return request('/api/me');
}

export function heartbeat(): Promise<MeResponse> {
  return request('/api/heartbeat');
}

export function leaveWorkspace(): Promise<{ ok: boolean }> {
  return request('/api/leave', { method: 'POST' });
}

/* ---------------- 任务 / 模板 ---------------- */

const taskFromDto = (d: TaskDTO): Task => ({
  id: d.id,
  date: d.date,
  title: d.title,
  note: d.note ?? '',
  done: !!d.done,
  doneAt: d.done_at ?? null,
  isTemplate: !!d.is_template,
  order: d.sort_order ?? 0,
  createdAt: d.created_at ?? 0,
});

const taskToDto = (t: Task): TaskDTO => ({
  id: t.id,
  date: t.date,
  title: t.title,
  note: t.note,
  done: t.done ? 1 : 0,
  done_at: t.doneAt,
  is_template: t.isTemplate ? 1 : 0,
  sort_order: t.order,
  created_at: t.createdAt,
});

export async function getTasks(query: { date: string } | { from: string; to: string }): Promise<Task[]> {
  const qs =
    'date' in query ? `date=${query.date}` : `from=${query.from}&to=${query.to}`;
  const res = await request<{ tasks: TaskDTO[] }>(`/api/tasks?${qs}`);
  return (res.tasks ?? []).map(taskFromDto);
}

export async function putTask(task: Task): Promise<Task> {
  const res = await request<{ task: TaskDTO }>(`/api/tasks/${encodeURIComponent(task.id)}`, {
    method: 'PUT',
    body: JSON.stringify(taskToDto(task)),
  });
  return taskFromDto(res.task ?? taskToDto(task));
}

export function deleteTaskRemote(id: string): Promise<{ ok: boolean }> {
  return request(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

const templateFromDto = (d: TemplateDTO): TaskTemplate => ({
  id: d.id,
  title: d.title,
  note: d.note ?? '',
  order: d.sort_order ?? 0,
  active: !!d.active,
});

const templateToDto = (t: TaskTemplate): TemplateDTO => ({
  id: t.id,
  title: t.title,
  note: t.note,
  sort_order: t.order,
  active: t.active ? 1 : 0,
});

export async function getTemplates(): Promise<TaskTemplate[]> {
  const res = await request<{ templates: TemplateDTO[] }>('/api/templates');
  return (res.templates ?? []).map(templateFromDto);
}

export async function putTemplateRemote(tpl: TaskTemplate): Promise<void> {
  await request(`/api/templates/${encodeURIComponent(tpl.id)}`, {
    method: 'PUT',
    body: JSON.stringify(templateToDto(tpl)),
  });
}

export function deleteTemplateRemote(id: string): Promise<{ ok: boolean }> {
  return request(`/api/templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function seed(date: string): Promise<{ tasks: Task[]; templates: TaskTemplate[] }> {
  const res = await request<{ tasks: TaskDTO[]; templates: TemplateDTO[] }>('/api/seed', {
    method: 'POST',
    body: JSON.stringify({ date }),
  });
  return {
    tasks: (res.tasks ?? []).map(taskFromDto),
    templates: (res.templates ?? []).map(templateFromDto),
  };
}

/* ---------------- 批次 ---------------- */

export interface BatchMetaDTO {
  date: string;
  seq: number;
  fetchedAt: number;
}

export async function getBatches(): Promise<{ topics: BatchMetaDTO | null; hotspots: BatchMetaDTO | null }> {
  return request('/api/batches');
}

export function refreshBatchRemote(kind: 'topics' | 'hotspots', date: string): Promise<BatchMetaDTO & { kind: string }> {
  return request(`/api/batches/${kind}/refresh`, { method: 'POST', body: JSON.stringify({ date }) });
}

/* ---------------- 内容库 ---------------- */

const savedFromDto = (d: SavedDTO): SavedItem => ({
  id: d.id,
  kind: d.kind,
  status: d.status,
  title: d.title,
  platform: d.platform,
  snapshot: (typeof d.snapshot === 'string' ? JSON.parse(d.snapshot) : d.snapshot) as Topic | Hotspot,
  savedAt: d.saved_at,
});

export async function getSaved(): Promise<SavedItem[]> {
  const res = await request<{ saved: SavedDTO[] }>('/api/saved');
  return (res.saved ?? []).map(savedFromDto);
}

export async function putSavedRemote(item: SavedItem): Promise<void> {
  await request(`/api/saved/${encodeURIComponent(item.id)}`, {
    method: 'PUT',
    body: JSON.stringify({
      id: item.id,
      kind: item.kind,
      status: item.status,
      title: item.title,
      platform: item.platform,
      snapshot: item.snapshot,
      saved_at: item.savedAt,
    }),
  });
}

export function deleteSavedRemote(id: string): Promise<{ ok: boolean }> {
  return request(`/api/saved/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/* ---------------- 设置 ---------------- */

export async function getSettingsRemote(): Promise<Partial<Settings>> {
  const res = await request<{ settings: Partial<Settings> }>('/api/settings');
  return res.settings ?? {};
}

export function putSettingsRemote(settings: Settings): Promise<{ settings: Settings }> {
  return request('/api/settings', { method: 'PUT', body: JSON.stringify(settings) });
}

/* ---------------- 导出 ---------------- */

export async function exportRemote(): Promise<BackupFile> {
  const res = await request<{
    tasks?: TaskDTO[];
    templates?: TemplateDTO[];
    saved?: SavedDTO[];
    settings?: Partial<Settings>;
  }>('/api/export');
  return {
    app: 'hotel-media-studio',
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks: (res.tasks ?? []).map(taskFromDto),
    templates: (res.templates ?? []).map(templateFromDto),
    // 在线批次由服务端 seq 决定，导出不携带内容；导入后会自动重新拉取
    topics: null,
    hotspots: null,
    saved: (res.saved ?? []).map(savedFromDto),
    settings: { ...DEFAULT_SETTINGS, ...(res.settings ?? {}) },
  };
}

export type { TopicBatch, HotspotBatch };
