import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { Drawer } from '../components/Drawer';
import { ConfirmDialog, EmptyState, ProgressRing } from '../components/ui';
import { IconCheckSquare, IconHistory, IconPlus, IconTrash } from '../components/icons';
import { toast } from '../components/Toast';
import { formatDay, formatTime, todayKey, weekdayLabel, addDays } from '../lib/clock';
import { dayStat, recentRate, statsByDate, streakDays } from '../lib/stats';
import * as data from '../lib/data';
import { usePlanStore } from '../store/plan';
import { useSessionStore } from '../store/session';
import type { Task } from '../types';
import { cn } from '../lib/format';

export function PlanPage() {
  const { date, tasks, loading, error, toggle, add, update, remove, restoreLast, templates, removeTemplate } =
    usePlanStore();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [rangeTasks, setRangeTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [asTemplate, setAsTemplate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'todo' | 'done'>('all');
  const [quickTitle, setQuickTitle] = useState('');
  const online = useSessionStore((s) => s.session?.mode === 'online');

  const today = todayKey();
  const stat = dayStat(date, tasks);
  const pct = stat.rate;

  useEffect(() => {
    void (async () => {
      const rows = await data.getTasksBetween(addDays(today, -120), today);
      setRangeTasks(rows);
    })();
  }, [today, tasks]);

  const stats = useMemo(() => statsByDate(rangeTasks), [rangeTasks]);
  const streak = useMemo(() => streakDays(stats, today), [stats, today]);
  const week = useMemo(() => recentRate(stats, today, 7), [stats, today]);
  const visibleTasks = useMemo(
    () => (filter === 'all' ? tasks : tasks.filter((t) => (filter === 'done' ? t.done : !t.done))),
    [tasks, filter],
  );

  const openAdd = () => {
    setEditing(null);
    setTitle('');
    setNote('');
    setAsTemplate(false);
    setSheetOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditing(task);
    setTitle(task.title);
    setNote(task.note);
    setAsTemplate(task.isTemplate);
    setSheetOpen(true);
  };

  const submit = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      if (editing) {
        await update(editing.id, { title: title.trim(), note: note.trim() });
      } else {
        await add({ title, note, isTemplate: asTemplate });
      }
      setSheetOpen(false);
      toast.success(editing ? '已保存' : '任务已添加');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    setConfirmId(null);
    const task = tasks.find((t) => t.id === id);
    await remove(id);
    // 每日固定任务：同时删掉对应模板，否则明天还会被种回
    if (task?.isTemplate) {
      const tplId = id.split(':')[1];
      if (tplId && templates.some((tpl) => tpl.id === tplId)) await removeTemplate(tplId);
    }
    toast.show('任务已删除', {
      action: {
        label: '撤销',
        onClick: () => {
          void restoreLast();
        },
      },
    });
  };

  return (
    <div className="animate-rise-in">
      <PageHeader
        title="每日计划"
        sub={
          date === today
            ? `今天 · ${formatDay(date)} ${weekdayLabel(date)}`
            : `${formatDay(date)} ${weekdayLabel(date)}`
        }
        actions={
          <Link
            to="/plan/history"
            aria-label="历史与统计"
            className="flex items-center gap-1 rounded-full bg-white/80 px-3 py-2 text-[12.5px] text-ink-soft ring-1 ring-line"
          >
            <IconHistory width={16} height={16} />
            历史
          </Link>
        }
      />

      {error ? (
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-clay-50 px-3 py-2 text-[12px] leading-relaxed text-clay-700 ring-1 ring-clay-100">
          <span className="flex-1">
            {error}（{online ? '在线模式需要网络' : '本地存储可能不可用，建议检查浏览器隐私设置'}）
          </span>
          <button type="button" className="shrink-0 underline underline-offset-2" onClick={() => void usePlanStore.getState().load()}>
            重试
          </button>
        </div>
      ) : null}

      <section className="card mb-4 flex items-center gap-4 p-4">
        <ProgressRing value={pct} size={72} stroke={7}>
          <div>
            <div className="text-[17px] font-semibold leading-none text-ink">
              {stat.done}
              <span className="text-[12px] font-normal text-ink-mute">/{stat.total}</span>
            </div>
            <div className="mt-0.5 text-[10px] text-ink-mute">
              {pct === null ? '无任务' : `${Math.round(pct * 100)}%`}
            </div>
          </div>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-ink">
            {pct === null ? '今天还没有任务' : pct >= 1 ? '今天的动作都完成了' : '按顺序收掉今天的动作'}
          </p>
          <p className="muted mt-0.5">
            {pct === null ? '先加一条要做的任务' : pct >= 1 ? '可以提前准备明天的选题了' : '完成后点一下复选框即可打卡'}
          </p>
          <div className="mt-2 flex gap-4">
            <div>
              <p className="text-[11px] text-ink-mute">连续全勤</p>
              <p className="text-[17px] font-semibold leading-tight text-clay-600">
                {streak}
                <span className="ml-0.5 text-[11px] font-normal text-ink-mute">天</span>
              </p>
            </div>
            <div>
              <p className="text-[11px] text-ink-mute">近 7 天完成率</p>
              <p className="text-[17px] font-semibold leading-tight text-jade-600">
                {week === null ? '—' : `${Math.round(week * 100)}%`}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="section-title shrink-0">今日清单</h2>
        <div className="flex items-center gap-1">
          {(
            [
              { key: 'all', label: '全部' },
              { key: 'todo', label: '待完成' },
              { key: 'done', label: '已完成' },
            ] as Array<{ key: 'all' | 'todo' | 'done'; label: string }>
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn('chip px-2.5 py-1 text-[11.5px]', filter === f.key ? 'chip-on' : 'bg-white/70 text-ink-mute')}
            >
              {f.label}
              {f.key === 'todo' && tasks.some((t) => !t.done)
                ? ` ${tasks.filter((t) => !t.done).length}`
                : ''}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="card h-24 animate-pulse bg-card/60" />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<IconCheckSquare width={26} height={26} />}
          title="还没有任务"
          desc="添加今天要完成的事，比如房态核对、排房、发一条内容。"
          action={
            <button type="button" className="btn-primary" onClick={openAdd}>
              <IconPlus width={16} height={16} />
              添加第一条任务
            </button>
          }
        />
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {visibleTasks.map((task) => (
            <li key={task.id} className="flex items-start gap-3 px-3.5 py-3">
              <button
                type="button"
                aria-label={task.done ? `取消完成：${task.title}` : `完成：${task.title}`}
                aria-pressed={task.done}
                onClick={() => void toggle(task.id)}
                className={cn(
                  'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg ring-1 transition active:scale-90',
                  task.done
                    ? 'bg-jade-500 text-white ring-jade-500'
                    : 'bg-white text-transparent ring-line hover:ring-clay-300',
                )}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M5 12.5l4.2 4.2L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <button
                type="button"
                onClick={() => openEdit(task)}
                className="min-w-0 flex-1 text-left"
              >
                <p
                  className={cn(
                    'text-[15px] leading-snug transition',
                    task.done ? 'text-ink-mute line-through' : 'text-ink',
                  )}
                >
                  {task.title}
                </p>
                {task.note ? <p className="mt-0.5 text-[12px] leading-relaxed text-ink-mute">{task.note}</p> : null}
                <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-mute">
                  {task.isTemplate ? (
                    <span className="rounded-full bg-clay-50 px-1.5 py-0.5 text-clay-600 ring-1 ring-clay-100">每日固定</span>
                  ) : null}
                  {task.done && task.doneAt ? <span>{formatTime(task.doneAt)} 完成</span> : null}
                </div>
              </button>

              <button
                type="button"
                aria-label={`删除：${task.title}`}
                onClick={() => setConfirmId(task.id)}
                className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-mute/70 transition hover:bg-clay-50 hover:text-clay-600"
              >
                <IconTrash width={17} height={17} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && tasks.length > 0 && visibleTasks.length === 0 ? (
        <p className="mt-2 text-center text-[12px] text-ink-mute">
          {filter === 'todo' ? '今天的任务都完成了 🎉' : '还没有已完成的任务'}
        </p>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const value = quickTitle.trim();
          if (!value) return;
          setQuickTitle('');
          void add({ title: value });
        }}
        className="mt-3 flex items-center gap-2 rounded-2xl border border-dashed border-line bg-white/60 px-3 py-2"
      >
        <IconPlus width={16} height={16} className="shrink-0 text-ink-mute" />
        <input
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          placeholder="快速添加任务，回车保存"
          maxLength={30}
          className="min-w-0 flex-1 bg-transparent py-1 text-[14px] text-ink outline-none placeholder:text-ink-mute/70"
        />
        <button
          type="button"
          onClick={openAdd}
          className="shrink-0 rounded-full px-2.5 py-1 text-[11.5px] text-ink-mute ring-1 ring-line"
        >
          详细
        </button>
      </form>

      <p className="mt-3 text-center text-[11px] leading-relaxed text-ink-mute/80">
        {online
          ? `清单只属于你 · 内容库与团队共享 · 在线协作中`
          : '清单与打卡记录只保存在本机 · 每天按上海时间 00:00 自动切换'}
      </p>

      <Drawer
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? '编辑任务' : '新增任务'}
        subtitle={editing ? '修改只影响今天，历史记录不变' : '每天重复的动作建议设为每日固定'}
        footer={
          <div className="flex gap-2">
            <button type="button" className="btn-ghost flex-1" onClick={() => setSheetOpen(false)}>
              取消
            </button>
            <button type="button" className="btn-primary flex-1" disabled={!title.trim() || saving} onClick={() => void submit()}>
              {saving ? '保存中…' : editing ? '保存' : '添加'}
            </button>
          </div>
        }
      >
        <div className="space-y-4 pb-2">
          <label className="block">
            <span className="label">任务名称</span>
            <input
              value={title}
              maxLength={30}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：核对离店房态价格"
              autoFocus
              className="mt-1.5 w-full rounded-xl border border-line bg-white px-3.5 py-3 text-[15px] text-ink outline-none placeholder:text-ink-mute/60 focus:border-clay-300 focus:ring-4 focus:ring-clay-50"
            />
            <span className="mt-1 block text-right text-[11px] text-ink-mute">{title.length}/30</span>
          </label>
          <label className="block">
            <span className="label">备注（选填）</span>
            <textarea
              value={note}
              maxLength={100}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
              placeholder="补充说明，例如：退房前先核对价格是否与渠道一致"
              className="mt-1.5 w-full resize-none rounded-xl border border-line bg-white px-3.5 py-3 text-[14px] leading-relaxed text-ink outline-none placeholder:text-ink-mute/60 focus:border-clay-300 focus:ring-4 focus:ring-clay-50"
            />
          </label>
          {!editing ? (
            <button
              type="button"
              onClick={() => setAsTemplate((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl bg-white px-3.5 py-3 ring-1 ring-line"
            >
              <span className="text-left">
                <span className="block text-[14px] text-ink">设为每日固定</span>
                <span className="block text-[11.5px] text-ink-mute">明天起每天自动出现在清单里</span>
              </span>
              <span
                className={cn(
                  'relative h-6 w-11 shrink-0 rounded-full transition',
                  asTemplate ? 'bg-clay-500' : 'bg-line',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
                    asTemplate ? 'left-[22px]' : 'left-0.5',
                  )}
                />
              </span>
            </button>
          ) : null}
        </div>
      </Drawer>

      <ConfirmDialog
        open={!!confirmId}
        title="删除这条任务？"
        desc="删除后 5 秒内可以撤销；每日固定任务删除后明天不会再自动出现。"
        confirmText="删除"
        onCancel={() => setConfirmId(null)}
        onConfirm={() => confirmId && void onDelete(confirmId)}
      />
    </div>
  );
}
