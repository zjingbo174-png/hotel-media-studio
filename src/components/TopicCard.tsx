import type { Topic } from '../types';
import { PLATFORM_LABEL } from '../types';
import { coverGradient, formatMetrics } from '../lib/format';
import { IconBookmark } from './icons';
import { cn } from '../lib/format';

export function PlatformBadge({ platform }: { platform: Topic['platform'] }) {
  const isDouyin = platform === 'douyin';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-medium leading-none ring-1',
        isDouyin ? 'bg-ink text-white ring-ink' : 'bg-[#fdecec] text-[#c0392b] ring-[#f6d5d2]',
      )}
    >
      {PLATFORM_LABEL[platform]}
    </span>
  );
}

export function TopicCard({
  topic,
  saved,
  onOpen,
}: {
  topic: Topic;
  saved: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card flex w-full gap-3 p-3 text-left transition active:scale-[.99]"
    >
      <div
        className={cn(
          'relative grid h-[86px] w-[68px] shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br',
          coverGradient(topic.coverSeed),
        )}
      >
        <span className="text-[22px] font-semibold text-white/85">{topic.title.slice(0, 1)}</span>
        <span className="absolute bottom-1 left-1 rounded bg-black/25 px-1 py-0.5 text-[9px] text-white/90">
          {topic.scene}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-1.5">
          <PlatformBadge platform={topic.platform} />
          <span className="truncate text-[11px] text-ink-mute">{topic.author}</span>
          {saved ? <IconBookmark width={12} height={12} className="shrink-0 text-clay-500" /> : null}
          <span className="ml-auto shrink-0 text-[10.5px] text-ink-mute">{topic.publishedAt}</span>
        </div>
        <p className="clamp-2 text-[14.5px] font-medium leading-snug text-ink">{topic.title}</p>
        <p className="mt-1 text-[11.5px] text-ink-mute">{formatMetrics(topic.metrics)}</p>
        <div className="mt-1.5 flex gap-1 overflow-hidden">
          {topic.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="shrink-0 rounded-full bg-paper px-1.5 py-0.5 text-[10px] text-ink-mute ring-1 ring-line/80">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}
