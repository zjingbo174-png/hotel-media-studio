import type {
  BatchMeta,
  ContentSource,
  Hotspot,
  HotspotBatch,
  Topic,
  TopicBatch,
} from '../../types';
import rawTopics from '../../data/topics.json';
import rawHotspots from '../../data/hotspots.json';

/**
 * Mock 数据源：演示用。
 * - batchKey = 日期 + 自增序号；同一次「采集」内内容稳定。
 * - 每次手动刷新会换一批（轮转 + 热度微调），模拟真实采集的「换了批数据」。
 */
const topics = rawTopics as Topic[];
const hotspots = (rawHotspots as Hotspot[]).slice().sort((a, b) => a.rank - b.rank);

function rotate<T>(items: T[], seq: number): T[] {
  if (items.length === 0) return items;
  const k = ((seq % items.length) + items.length) % items.length;
  return [...items.slice(k), ...items.slice(0, k)];
}

/** 稳定的伪随机（同一 seed + id 结果不变） */
function seeded(seed: number, id: string): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function jitter(base: number, seed: number, id: string): number {
  const factor = 0.88 + seeded(seed, id) * 0.28;
  return Math.max(1, Math.round(base * factor));
}

function meta(date: string, seq: number, kind: 'topic' | 'hotspot'): BatchMeta {
  return {
    id: `${date}#${kind}-${seq}`,
    date,
    seq,
    fetchedAt: Date.now(),
    sourceId: 'mock',
  };
}

export const mockSource: ContentSource = {
  id: 'mock',
  label: '内置演示数据',
  capabilities: {
    realtime: false,
    requiresAuth: false,
    note: '当前为内置演示数据（文案自写、账号虚构），刷新会换一批示例；接入真实数据源后接口不变。',
  },

  async fetchTopics(date: string, seq: number): Promise<TopicBatch> {
    const items = rotate(topics, seq).map((t) => ({
      ...t,
      metrics: {
        like: jitter(t.metrics.like, seq, t.id),
        collect: jitter(t.metrics.collect, seq, t.id + 'c'),
        comment: jitter(t.metrics.comment, seq, t.id + 'm'),
      },
    }));
    return { meta: meta(date, seq, 'topic'), items };
  },

  async fetchHotspots(date: string, seq: number): Promise<HotspotBatch> {
    const items = rotate(hotspots, seq).map((h, idx) => ({
      ...h,
      rank: idx + 1,
      rankDelta: seq === 0 ? h.rankDelta : Math.round((seeded(seq, h.id) - 0.5) * 6),
      isNew: seq !== 0 && seeded(seq, h.id + 'new') > 0.78,
    }));
    return { meta: meta(date, seq, 'hotspot'), items };
  },
};

/** 供 UI 显示的「演示链接」关键词 */
export function topicSearchKeyword(topic: Topic): string {
  return topic.keywords[0] ?? topic.title;
}

export function hotspotSearchKeyword(hotspot: Hotspot): string {
  return hotspot.title.slice(0, 12);
}
