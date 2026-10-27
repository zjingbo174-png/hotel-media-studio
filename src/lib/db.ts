import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
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

interface HMSDB extends DBSchema {
  tasks: {
    key: string;
    value: Task;
    indexes: { byDate: string };
  };
  templates: {
    key: string;
    value: TaskTemplate;
  };
  topics: {
    key: string;
    value: { id: 'current'; meta: TopicBatch['meta']; items: Topic[] };
  };
  hotspots: {
    key: string;
    value: { id: 'current'; meta: HotspotBatch['meta']; items: Hotspot[] };
  };
  saved: {
    key: string;
    value: SavedItem;
  };
  settings: {
    key: string;
    value: Settings;
  };
}

export type HMSDatabase = IDBPDatabase<HMSDB>;

let dbPromise: Promise<HMSDatabase> | null = null;

export function getDB(): Promise<HMSDatabase> {
  if (!dbPromise) {
    dbPromise = openDB<HMSDB>('hotel-media-studio', 1, {
      upgrade(db) {
        const tasks = db.createObjectStore('tasks', { keyPath: 'id' });
        tasks.createIndex('byDate', 'date');
        db.createObjectStore('templates', { keyPath: 'id' });
        db.createObjectStore('topics', { keyPath: 'id' });
        db.createObjectStore('hotspots', { keyPath: 'id' });
        db.createObjectStore('saved', { keyPath: 'id' });
        db.createObjectStore('settings', { keyPath: 'id' });
      },
    }).catch((err) => {
      // 隐私模式/配额异常时不要把失败的 Promise 永久缓存，下次重试还能再打开
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

/** 测试用：关闭并重置连接 */
export async function resetDB(): Promise<void> {
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
