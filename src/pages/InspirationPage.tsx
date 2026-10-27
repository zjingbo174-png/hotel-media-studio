import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, SkeletonCard } from '../components/ui';
import { IconBookmark, IconBulb, IconRefresh } from '../components/icons';
import { TopicCard } from '../components/TopicCard';
import { TopicDetail } from '../components/TopicDetail';
import { toast } from '../components/Toast';
import { useContentStore } from '../store/content';
import { openExternal } from '../lib/format';
import * as data from '../lib/data';
import { formatDateTime, formatDay } from '../lib/clock';
import type { Platform, Topic } from '../types';
import { cn } from '../lib/format';

const COOLDOWN_MS = 8000;

type PlatformFilter = 'all' | Platform;

export function InspirationPage() {
  const topics = useContentStore((s) => s.topics);
  const refreshing = useContentStore((s) => s.refreshing);
  const error = useContentStore((s) => s.error);
  const refresh = useContentStore((s) => s.refresh);
  const saved = useContentStore((s) => s.saved);
  const toggleSaved = useContentStore((s) => s.toggleSaved);

  const [platform, setPlatform] = useState<PlatformFilter>('all');
  const [sort, setSort] = useState<'hot' | 'new'>('hot');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  const cooling = nowTick < cooldownUntil;
  const remaining = Math.ceil((cooldownUntil - nowTick) / 1000);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (topics?.items ?? []).filter((t) => {
      if (platform !== 'all' && t.platform !== platform) return false;
      if (!q) return true;
      const haystack = [t.title, t.copy, t.scene, ...t.tags, ...t.keywords, t.author].join(' ').toLowerCase();
      return haystack.includes(q);
    });
    if (sort === 'hot') return [...list].sort((a, b) => b.metrics.like - a.metrics.like);
    return list;
  }, [topics, platform, sort, query]);

  const openTopic = items.find((t) => t.id === openId) ?? null;

  const savedStateOf = (topic: Topic) => {
    const id = data.savedItemId('topic', topic.platform, topic.title);
    return saved.find((s) => s.id === id)?.status ?? null;
  };

  const doRefresh = async () => {
    if (cooling || refreshing) return;
    setCooldownUntil(Date.now() + COOLDOWN_MS);
    await refresh('topics');
    toast.success('已刷新一批示例选题');
  };

  const jump = (url: string) => {
    if (!navigator.onLine) {
      toast.danger('当前网络不可用，可复制关键词后到平台打开');
      return;
    }
    if (!openExternal(url)) {
      toast.danger('链接不在平台白名单内，已阻止打开');
    }
  };

  const meta = topics?.meta;

  return (
    <div className="animate-rise-in">
      <PageHeader
        title="选题灵感"
        sub={
          meta
            ? `${formatDay(meta.date)} · 第 ${meta.seq + 1} 批 · 更新于 ${formatDateTime(meta.fetchedAt).slice(-5)}`
            : '正在准备今日选题'
        }
        actions={
          <>
            <Link
              to="/library"
              aria-label="内容库"
              className="grid h-9 w-9 place-items-center rounded-full bg-white/80 text-ink-soft ring-1 ring-line"
            >
              <IconBookmark width={17} height={17} />
            </Link>
            <button
              type="button"
              aria-label="刷新选题"
              disabled={cooling || !!refreshing}
              onClick={() => void doRefresh()}
              className={cn(
                'flex items-center gap-1 rounded-full bg-white/80 px-3 py-2 text-[12.5px] ring-1 ring-line transition',
                cooling || refreshing ? 'text-ink-mute' : 'text-clay-600 active:scale-95',
              )}
            >
              <IconRefresh
                width={15}
                height={15}
                className={refreshing === 'topics' || refreshing === 'all' ? 'animate-spin' : undefined}
              />
              {cooling ? `${remaining}s` : '刷新'}
            </button>
          </>
        }
      />

      <div className="mb-3 flex items-start gap-2 rounded-xl bg-white/70 px-3 py-2 text-[11.5px] leading-relaxed text-ink-mute ring-1 ring-line/70">
        <span className="mt-0.5 shrink-0 rounded bg-clay-50 px-1.5 py-0.5 text-[10px] font-medium text-clay-600">
          演示数据
        </span>
        <span>
          内置示例内容（文案自写、账号虚构），点「刷新」会换一批示例；点开可看逐条火爆原因与原创思路。
        </span>
      </div>

      <div className="mb-2.5 flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 ring-1 ring-line/70">
        <span className="shrink-0 text-[13px] text-ink-mute">🔍</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜标题、关键词、话题、场景"
          className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-mute/70"
        />
        {query ? (
          <button type="button" onClick={() => setQuery('')} aria-label="清空搜索" className="shrink-0 text-[12px] text-ink-mute">
            清空
          </button>
        ) : null}
      </div>

      <div className="mb-3 flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
        {(
          [
            { key: 'all', label: '全部' },
            { key: 'douyin', label: '抖音' },
            { key: 'xiaohongshu', label: '小红书' },
          ] as Array<{ key: PlatformFilter; label: string }>
        ).map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setPlatform(f.key)}
            className={cn('chip', platform === f.key ? 'chip-on' : 'bg-white/80 text-ink-soft')}
          >
            {f.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        <button
          type="button"
          onClick={() => setSort('hot')}
          className={cn('chip', sort === 'hot' ? 'chip-on' : 'bg-white/80 text-ink-soft')}
        >
          按热度
        </button>
        <button
          type="button"
          onClick={() => setSort('new')}
          className={cn('chip', sort === 'new' ? 'chip-on' : 'bg-white/80 text-ink-soft')}
        >
          按批次
        </button>
      </div>

      {error ? (
        <div className="card mb-3 px-4 py-3 text-[13px] text-clay-700">
          {error}
          <button type="button" className="ml-2 underline" onClick={() => void refresh('topics')}>
            重试
          </button>
        </div>
      ) : null}

      <div className="space-y-2.5">
        {!topics
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : items.length === 0
            ? (
              <EmptyState
                icon={<IconBulb width={26} height={26} />}
                title={platform === 'all' ? '这一批暂无选题' : '这个平台这一批没有内容'}
                desc="点右上角「刷新」换一批看看。"
              />
            )
            : items.map((topic) => (
                <TopicCard key={topic.id} topic={topic} saved={!!savedStateOf(topic)} onOpen={() => setOpenId(topic.id)} />
              ))}
      </div>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-ink-mute/70">
        数据为演示样例 · 收藏与「已用」会存进内容库，换批次也不会丢
      </p>

      <TopicDetail
        topic={openTopic}
        open={!!openTopic}
        onClose={() => setOpenId(null)}
        savedState={openTopic ? savedStateOf(openTopic) : null}
        onToggleSaved={(status) => {
          if (!openTopic) return;
          void toggleSaved('topic', openTopic, status);
        }}
        onJump={jump}
      />
    </div>
  );
}
