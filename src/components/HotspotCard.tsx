import type { Hotspot } from '../types';
import { PlatformBadge } from './TopicCard';
import { IconBookmark } from './icons';
import { cn } from '../lib/format';

export function HotspotCard({ item, onOpen }: { item: Hotspot; onOpen: () => void }) {
  const rankTone =
    item.rank === 1
      ? 'bg-clay-500 text-white'
      : item.rank === 2
        ? 'bg-clay-400 text-white'
        : item.rank === 3
          ? 'bg-clay-300 text-white'
          : 'bg-white text-ink-soft ring-1 ring-line';

  return (
    <button
      type="button"
      onClick={onOpen}
      className="card flex w-full items-start gap-3 p-3.5 text-left transition active:scale-[.99]"
    >
      <div className="flex w-7 shrink-0 flex-col items-center gap-1 pt-0.5">
        <span className={cn('grid h-7 w-7 place-items-center rounded-lg text-[12.5px] font-semibold', rankTone)}>
          {item.rank}
        </span>
        <RankDelta delta={item.rankDelta} isNew={item.isNew} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-1.5">
          <PlatformBadge platform={item.platform} />
          <span className="truncate text-[11px] text-ink-mute">
            {item.account} · {item.followers}
          </span>
          <span className="ml-auto shrink-0 rounded-full bg-paper px-1.5 py-0.5 text-[10px] text-ink-mute">
            {item.track}
          </span>
        </div>
        <p className="clamp-2 text-[14.5px] font-medium leading-snug text-ink">{item.title}</p>
        <p className="mt-1 text-[11px] text-ink-mute">
          播放 {item.metrics.play} · 赞 {item.metrics.like} · 评 {item.metrics.comment}
        </p>
        <div className="mt-1.5 flex items-center gap-1 overflow-hidden">
          {item.styleTags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="shrink-0 rounded-full bg-paper px-1.5 py-0.5 text-[10px] text-ink-mute ring-1 ring-line/80"
            >
              {tag}
            </span>
          ))}
          <span className="ml-auto flex shrink-0 items-center gap-0.5 text-[10px] text-clay-600">
            <IconBookmark width={11} height={11} />3 套方案
          </span>
        </div>
      </div>
    </button>
  );
}

function RankDelta({ delta, isNew }: { delta: number; isNew: boolean }) {
  if (isNew) {
    return <span className="rounded bg-jade-50 px-1 text-[9px] font-semibold text-jade-600">NEW</span>;
  }
  if (delta === 0) return <span className="text-[9px] text-ink-mute/60">—</span>;
  const up = delta > 0;
  return (
    <span className={cn('text-[9.5px] font-medium', up ? 'text-clay-500' : 'text-ink-mute')}>
      {up ? '↑' : '↓'}
      {Math.abs(delta)}
    </span>
  );
}
