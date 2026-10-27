import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isPastTime, todayKey } from '../lib/clock';
import { usePlanStore } from '../store/plan';
import { useSettingsStore } from '../store/settings';
import { IconBell, IconChevronRight } from './icons';

/** 同一天只弹一次系统通知（页面刷新不重复） */
const notified = new Set<string>();

/**
 * 下班前未打卡提醒：
 * - 应用打开时判断当前上海时间是否已过提醒点；
 * - 仍有未完成任务 → 顶部提醒条；
 * - 若用户在设置里开启浏览器通知且有权限，同时弹一条系统通知；
 * - 纯前端无法在应用完全关闭时定时推送（见需求文档提醒能力边界）。
 */
export function ReminderBanner() {
  const tasks = usePlanStore((s) => s.tasks);
  const date = usePlanStore((s) => s.date);
  const reminderTime = useSettingsStore((s) => s.settings.reminderTime);
  const browserNotify = useSettingsStore((s) => s.settings.browserNotify);
  const save = useSettingsStore((s) => s.save);
  const lastRemindedDate = useSettingsStore((s) => s.settings.lastRemindedDate);
  const [dismissed, setDismissed] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const today = todayKey();
  const pending = tasks.filter((t) => !t.done).length;
  const active =
    !!reminderTime &&
    !dismissed &&
    date === today &&
    tasks.length > 0 &&
    pending > 0 &&
    isPastTime(reminderTime) &&
    lastRemindedDate !== today;

  useEffect(() => {
    if (!active || !browserNotify) return;
    if (notified.has(today)) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    notified.add(today);
    const title = '酒店自媒体创作工作台';
    const body = `今天还有 ${pending} 项没打卡，别忘了：${tasks
      .filter((t) => !t.done)
      .slice(0, 2)
      .map((t) => t.title)
      .join('、')}`;
    void (async () => {
      try {
        new Notification(title, { body, tag: 'hms-reminder' });
        return;
      } catch {
        /* iOS/PWA 下构造函数可能不可用，改用 Service Worker 通知 */
      }
      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.ready;
          await reg.showNotification(title, { body, tag: 'hms-reminder' });
        }
      } catch {
        /* 忽略通知失败，应用内提醒条仍在 */
      }
    })();
    // tick 只用于周期性重新判定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, browserNotify, tick]);

  if (!active) return null;

  return (
    <div className="mb-3 animate-rise-in">
      <div className="flex items-center gap-3 rounded-2xl bg-clay-50 px-4 py-3 ring-1 ring-clay-100">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-clay-600 ring-1 ring-clay-100">
          <IconBell width={18} height={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium text-clay-700">还有 {pending} 项没打卡</p>
          <p className="text-[12px] text-clay-600/80">下班前记得收尾，别把今天的动作留到明天。</p>
        </div>
        <Link
          to="/plan"
          className="flex shrink-0 items-center gap-0.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-medium text-clay-700 ring-1 ring-clay-100"
        >
          去打卡
          <IconChevronRight width={14} height={14} />
        </Link>
        <button
          type="button"
          aria-label="今天不再提醒"
          className="shrink-0 text-[11px] text-clay-600/70 underline decoration-clay-300 underline-offset-2"
          onClick={() => {
            setDismissed(true);
            void save({ lastRemindedDate: today });
          }}
        >
          今天不再提醒
        </button>
      </div>
    </div>
  );
}
