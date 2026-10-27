import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/ui';
import { IconCheckSquare, IconChevronLeft, IconChevronRight } from '../components/icons';
import { addDays, formatDay, todayKey, weekdayLabel } from '../lib/clock';
import { dayStat, monthGrid, shiftMonth, statsByDate, streakDays } from '../lib/stats';
import * as data from '../lib/data';
import type { Task } from '../types';
import { cn } from '../lib/format';

export function HistoryPage() {
  const today = todayKey();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setTasks(await data.getAllTasks());
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => statsByDate(tasks), [tasks]);
  const cells = useMemo(() => monthGrid(month), [month]);
  const streak = useMemo(() => streakDays(stats, today), [stats, today]);

  const monthStats = useMemo(() => {
    let full = 0;
    let counted = 0;
    for (const [date, stat] of stats) {
      if (!date.startsWith(month) || stat.rate === null) continue;
      counted += 1;
      if (stat.rate === 1) full += 1;
    }
    return { full, counted };
  }, [stats, month]);

  const dayTasks = tasks.filter((t) => t.date === selected).sort((a, b) => a.order - b.order);
  const selectedStat = dayStat(selected, dayTasks);

  const cellClass = (date: string) => {
    const stat = stats.get(date);
    if (!stat || stat.rate === null) return 'bg-white text-ink-mute/70 ring-line';
    if (stat.rate === 1) return 'bg-jade-500 text-white ring-jade-500';
    if (stat.rate >= 0.5) return 'bg-clay-200 text-clay-700 ring-clay-200';
    if (stat.rate > 0) return 'bg-clay-100 text-clay-600 ring-clay-100';
    return 'bg-white text-ink-mute ring-line';
  };

  return (
    <div className="animate-rise-in">
      <PageHeader
        title="历史与统计"
        sub={`连续全勤 ${streak} 天 · 本月完整完成 ${monthStats.full} 天`}
        actions={
          <Link to="/plan" className="flex items-center gap-1 rounded-full bg-white/80 px-3 py-2 text-[12.5px] text-ink-soft ring-1 ring-line">
            <IconChevronLeft width={15} height={15} />
            返回
          </Link>
        }
      />

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            aria-label="上个月"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="grid h-8 w-8 place-items-center rounded-full text-ink-soft ring-1 ring-line"
          >
            <IconChevronLeft width={16} height={16} />
          </button>
          <p className="text-[15px] font-semibold text-ink">{month.replace('-', ' 年 ')} 月</p>
          <button
            type="button"
            aria-label="下个月"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            className="grid h-8 w-8 place-items-center rounded-full text-ink-soft ring-1 ring-line"
          >
            <IconChevronRight width={16} height={16} />
          </button>
        </div>

        <div className="mb-1 grid grid-cols-7 text-center text-[11px] text-ink-mute">
          {['一', '二', '三', '四', '五', '六', '日'].map((w) => (
            <span key={w} className="py-1">
              {w}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((date, idx) =>
            date ? (
              <button
                key={date}
                type="button"
                onClick={() => setSelected(date)}
                className={cn(
                  'relative aspect-square rounded-xl text-[13px] ring-1 transition active:scale-95',
                  cellClass(date),
                  selected === date && 'ring-2 ring-ink/70 ring-offset-1 ring-offset-card',
                  date === today && 'font-semibold',
                )}
              >
                {Number(date.slice(8))}
              </button>
            ) : (
              <span key={`empty-${idx}`} />
            ),
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[11px] text-ink-mute">
          <span className="flex items-center gap-1 whitespace-nowrap">
            <span className="h-2.5 w-2.5 rounded bg-jade-500" />全部完成
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap">
            <span className="h-2.5 w-2.5 rounded bg-clay-200" />完成过半
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap">
            <span className="h-2.5 w-2.5 rounded bg-clay-100" />完成部分
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap">
            <span className="h-2.5 w-2.5 rounded bg-white ring-1 ring-line" />未完成
          </span>
        </div>
      </section>

      <div className="mb-2 mt-5 flex items-center justify-between">
        <h2 className="section-title">
          {formatDay(selected)} {weekdayLabel(selected)}
        </h2>
        <span className="text-[12px] text-ink-mute">
          {selectedStat.rate === null ? '无任务' : `${selectedStat.done}/${selectedStat.total} 已完成`}
        </span>
      </div>

      {loading ? (
        <div className="card h-24 animate-pulse bg-card/60" />
      ) : dayTasks.length === 0 ? (
        <EmptyState
          icon={<IconCheckSquare width={24} height={24} />}
          title="这天没有清单记录"
          desc="当日没有生成任务，不计入连续全勤。"
        />
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {dayTasks.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-3">
              <span
                className={cn(
                  'grid h-5 w-5 shrink-0 place-items-center rounded-md text-[11px] ring-1',
                  t.done ? 'bg-jade-500 text-white ring-jade-500' : 'bg-white text-transparent ring-line',
                )}
              >
                ✓
              </span>
              <span className={cn('flex-1 text-[14px]', t.done ? 'text-ink-mute line-through' : 'text-ink')}>
                {t.title}
              </span>
              {t.isTemplate ? <span className="text-[10.5px] text-ink-mute">每日</span> : null}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-center text-[11px] text-ink-mute/80">
        统计口径：分母为当日清单条数；空清单日不计入；修改「每日固定」只影响未来日期
      </p>
      <p className="mt-1 text-center text-[11px] text-ink-mute/60">最早可查看 {addDays(today, -365)} 起的记录</p>
    </div>
  );
}
