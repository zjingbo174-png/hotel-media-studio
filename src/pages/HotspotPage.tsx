import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, SkeletonCard } from '../components/ui';
import { IconBookmark, IconFlame, IconRefresh } from '../components/icons';
import { HotspotCard } from '../components/HotspotCard';
import { HotspotDetail } from '../components/HotspotDetail';
import { toast } from '../components/Toast';
import { useContentStore } from '../store/content';
import { openExternal } from '../lib/format';
import * as data from '../lib/data';
import { formatDateTime, formatDay } from '../lib/clock';
import type { Hotspot } from '../types';
import { cn } from '../lib/format';

const COOLDOWN_MS = 8000;

export function HotspotPage() {
  const batch = useContentStore((s) => s.hotspots);
  const refreshing = useContentStore((s) => s.refreshing);
  const error = useContentStore((s) => s.error);
  const refresh = useContentStore((s) => s.refresh);
  const saved = useContentStore((s) => s.saved);
  const toggleSaved = useContentStore((s) => s.toggleSaved);

  const [track, setTrack] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  const cooling = nowTick < cooldownUntil;
  const remaining = Math.ceil((cooldownUntil - nowTick) / 1000);

  const tracks = useMemo(() => {
    const set = new Set((batch?.items ?? []).map((h) => h.track));
    return ['all', ...Array.from(set)];
  }, [batch]);

  const items = useMemo(() => {
    const list = (batch?.items ?? []).filter((h) => track === 'all' || h.track === track);
    return [...list].sort((a, b) => a.rank - b.rank);
  }, [batch, track]);

  const openItem = items.find((h) => h.id === openId) ?? null;

  const savedStateOf = (item: Hotspot) => {
    const id = data.savedItemId('hotspot', item.platform, item.title);
    return saved.find((s) => s.id === id)?.status ?? null;
  };

  const doRefresh = async () => {
    if (cooling || refreshing) return;
    setCooldownUntil(Date.now() + COOLDOWN_MS);
    await refresh('hotspots');
    toast.success('榜单已刷新');
  };

  const jump = (url: string) => {
    if (!navigator.onLine) {
      toast.danger('当前网络不可用，可复制标题后到平台搜索');
      return;
    }
    if (!openExternal(url)) {
      toast.danger('链接不在平台白名单内，已阻止打开');
    }
  };

  const meta = batch?.meta;

  return (
    <div className="animate-rise-in">
      <PageHeader
        title="爆款热点 / 二创"
        sub={
          meta
            ? `${formatDay(meta.date)} · 第 ${meta.seq + 1} 批 · 更新于 ${formatDateTime(meta.fetchedAt).slice(-5)}`
            : '正在准备今日热榜'
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
              aria-label="刷新榜单"
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
                className={refreshing === 'hotspots' || refreshing === 'all' ? 'animate-spin' : undefined}
              />
              {cooling ? `${remaining}s` : '刷新'}
            </button>
          </>
        }
      />

      <div className="mb-3 flex items-start gap-2 rounded-xl bg-white/70 px-3 py-2 text-[11.5px] leading-relaxed text-ink-mute ring-1 ring-line/70">
        <span className="mt-0.5 shrink-0 rounded bg-clay-50 px-1.5 py-0.5 text-[10px] font-medium text-clay-600">
          抖音 / 小红书
        </span>
        <span>
          演示榜单（账号与数据均为虚构示例）。每条含风格拆解与 3 套可执行二创方案，点开即看分镜与拍摄清单。
        </span>
      </div>

      <div className="mb-3 flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
        {tracks.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTrack(t)}
            className={cn('chip', track === t ? 'chip-on' : 'bg-white/80 text-ink-soft')}
          >
            {t === 'all' ? '全部赛道' : t}
          </button>
        ))}
      </div>

      {error ? (
        <div className="card mb-3 px-4 py-3 text-[13px] text-clay-700">
          {error}
          <button type="button" className="ml-2 underline" onClick={() => void refresh('hotspots')}>
            重试
          </button>
        </div>
      ) : null}

      <div className="space-y-2.5">
        {!batch ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : items.length === 0 ? (
          <EmptyState
            icon={<IconFlame width={26} height={26} />}
            title="这个赛道今天没有上榜内容"
            desc="换个赛道，或点右上角刷新一批。"
          />
        ) : (
          items.map((item) => (
            <HotspotCard key={item.id} item={item} onOpen={() => setOpenId(item.id)} />
          ))
        )}
      </div>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-ink-mute/70">
        Top 10 · 排名变化为演示数据 · 二创前请确认不搬运原片
      </p>

      <HotspotDetail
        item={openItem}
        open={!!openItem}
        onClose={() => setOpenId(null)}
        savedState={openItem ? savedStateOf(openItem) : null}
        onToggleSaved={(status) => {
          if (!openItem) return;
          void toggleSaved('hotspot', openItem, status);
        }}
        onJump={jump}
      />
    </div>
  );
}
