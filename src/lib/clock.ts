/**
 * 统一时区：Asia/Shanghai，不随设备时区漂移。
 * 时钟可注入（测试用时间旅行）。
 */

export const TZ = 'Asia/Shanghai';

let clock: () => Date = () => new Date();

export function setClock(fn: () => Date): void {
  clock = fn;
}

export function resetClock(): void {
  clock = () => new Date();
}

export function now(): Date {
  return clock();
}

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export interface ShanghaiParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = 周日 */
  weekday: number;
}

export function shanghaiParts(date: Date = now()): ShanghaiParts {
  const parts = partsFormatter.formatToParts(date);
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const year = pick('year');
  const month = pick('month');
  const day = pick('day');
  const hour = pick('hour') % 24;
  const minute = pick('minute');
  const second = pick('second');
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, hour, minute, second, weekday };
}

/** YYYY-MM-DD（上海时区） */
export function dateKey(date: Date = now()): string {
  const { year, month, day } = shanghaiParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function todayKey(): string {
  return dateKey(now());
}

/** HH:mm */
export function timeKey(date: Date = now()): string {
  const { hour, minute } = shanghaiParts(date);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** 当前上海时间是否已到达某个 HH:mm 提醒点 */
export function isPastTime(hhmm: string, date: Date = now()): boolean {
  const { hour, minute } = shanghaiParts(date);
  const [h, m] = hhmm.split(':').map(Number);
  return hour * 60 + minute >= h * 60 + m;
}

/** 日期加减（按日历日，不涉及时区换算） */
export function addDays(dayKey: string, delta: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dt.getUTCDate(),
  ).padStart(2, '0')}`;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function weekdayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function formatDay(dayKey: string): string {
  const [, m, d] = dayKey.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

export function formatDateTime(ts: number): string {
  const p = shanghaiParts(new Date(ts));
  return `${p.month}月${p.day}日 ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

export function formatTime(ts: number): string {
  const p = shanghaiParts(new Date(ts));
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}
