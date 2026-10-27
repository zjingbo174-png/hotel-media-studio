import { create } from 'zustand';
import type { Hotspot, HotspotBatch, SavedItem, Topic, TopicBatch } from '../types';
import { todayKey } from '../lib/clock';
import * as data from '../lib/data';
import { getSource } from '../lib/source';

export type RefreshTarget = 'topics' | 'hotspots' | 'all';

interface ContentState {
  topics: TopicBatch | null;
  hotspots: HotspotBatch | null;
  saved: SavedItem[];
  loading: boolean;
  refreshing: RefreshTarget | null;
  error: string | null;
  lastRefreshAt: number | null;
  load: () => Promise<void>;
  refresh: (target: RefreshTarget) => Promise<void>;
  /** 在线协作：静默拉取服务端最新批次（别人刷新后同步过来） */
  syncBatches: () => Promise<void>;
  toggleSaved: (kind: 'topic' | 'hotspot', item: Topic | Hotspot, status?: 'saved' | 'used') => Promise<void>;
  reloadSaved: () => Promise<void>;
}

export const useContentStore = create<ContentState>()((set, get) => ({
  topics: null,
  hotspots: null,
  saved: [],
  loading: true,
  refreshing: null,
  error: null,
  lastRefreshAt: null,

  async load() {
    set({ loading: true, error: null });
    try {
      const [topics, hotspots, saved] = await Promise.all([
        data.getTopicBatch(),
        data.getHotspotBatch(),
        data.getSavedItems(),
      ]);
      set({ topics, hotspots, saved, loading: false });
      const today = todayKey();
      const stale = !topics || !hotspots || topics.meta.date !== today || hotspots.meta.date !== today;
      if (stale && !get().refreshing) await get().refresh('all');
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : '内容加载失败' });
    }
  },

  async refresh(target) {
    const date = todayKey();
    if (get().refreshing) return;
    set({ refreshing: target, error: null });
    try {
      if (target === 'topics' || target === 'all') {
        const meta = await data.nextBatchMeta('topics', date);
        const batch = (await getSource().fetchTopics(meta.date, meta.seq)) as TopicBatch;
        await data.putTopicBatch(batch);
        set({ topics: batch });
      }
      if (target === 'hotspots' || target === 'all') {
        const meta = await data.nextBatchMeta('hotspots', date);
        const batch = (await getSource().fetchHotspots(meta.date, meta.seq)) as HotspotBatch;
        await data.putHotspotBatch(batch);
        set({ hotspots: batch });
      }
      set({ lastRefreshAt: Date.now() });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '刷新失败，请重试' });
    } finally {
      set({ refreshing: null });
    }
  },

  async syncBatches() {
    try {
      const [topics, hotspots] = await Promise.all([data.getTopicBatch(), data.getHotspotBatch()]);
      if (topics && topics.meta.seq !== get().topics?.meta.seq) set({ topics });
      if (hotspots && hotspots.meta.seq !== get().hotspots?.meta.seq) set({ hotspots });
    } catch {
      /* 离线时忽略 */
    }
  },

  async toggleSaved(kind, item, status = 'saved') {
    const platform = item.platform;
    const id = data.savedItemId(kind, platform, item.title);
    const existing = get().saved.find((s) => s.id === id);
    try {
      if (existing && existing.status === status) {
        await data.deleteSavedItem(id);
        set({ saved: get().saved.filter((s) => s.id !== id) });
        return;
      }
      const record: SavedItem = {
        id,
        kind,
        status,
        title: item.title,
        platform,
        snapshot: item,
        savedAt: Date.now(),
      };
      await data.putSavedItem(record);
      set({ saved: [record, ...get().saved.filter((s) => s.id !== id)] });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '内容库同步失败' });
    }
  },

  async reloadSaved() {
    try {
      set({ saved: await data.getSavedItems() });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '内容库加载失败' });
    }
  },
}));
