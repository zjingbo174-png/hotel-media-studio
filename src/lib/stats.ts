import type { Task } from '../types';
import { addDays } from './clock';

export interface DayStat {
  date: string;
  total: number;
  done: number;
  /** null 表示该日清单为空（不计入连续天数与完成率） */
  rate: number | null;
}

export const EMPTY_STAT: DayStat = { date: '', total: 0, done: 0, rate: null };

/** 单日进度：分母 = 当日任务条数（当日快照） */
export function dayStat(date: string, tasks: Task[]): DayStat {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  return { date, total, done, rate: total === 0 ? null : done / total };
}

/** 把任务按日期聚合 */
export function statsByDate(tasks: Task[]): Map<string, DayStat> {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    const list = map.get(t.date);
    if (list) list.push(t);
    else map.set(t.date, [t]);
  }
  const result = new Map<string, DayStat>();
  for (const [date, list] of map) result.set(date, dayStat(date, list));
  return result;
}

/**
 * 连续全勤天数：
 * - 今天全部完成 → 从今天往前数；
 * - 今天未完成（或还没开始）→ 从昨天往前数，今天不打断连续；
 * - 0 任务日不计入、也不打断；
 * - 历史上没有记录的日子（应用没打开）不打断，但也没有贡献。
 */
export function streakDays(stats: Map<string, DayStat>, today: string, maxLookback = 365): number {
  const todayStat = stats.get(today);
  let cursor = todayStat && todayStat.rate === 1 ? today : addDays(today, -1);
  let streak = 0;
  for (let i = 0; i < maxLookback; i++) {
    const stat = stats.get(cursor);
    if (!stat) {
      // 没有任何记录（当天没用过应用）视为中断，避免「很久没打开却显示长连续」
      break;
    }
    if (stat.rate === null) {
      // 明确记录为空的清单日（任务被删光）：不计数、也不打断
      cursor = addDays(cursor, -1);
      continue;
    }
    if (stat.rate < 1) break;
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** 最近 N 天（含今天）的平均完成率，空清单日不计入分母 */
export function recentRate(stats: Map<string, DayStat>, today: string, days = 7): number | null {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < days; i++) {
    const stat = stats.get(addDays(today, -i));
    if (!stat || stat.rate === null) continue;
    sum += stat.rate;
    count += 1;
  }
  return count === 0 ? null : sum / count;
}

/** 月历网格：返回 6*7 个格子（周一开头），非本月的格子为 null */
export function monthGrid(monthKey: string): Array<string | null> {
  const [y, m] = monthKey.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const cells: Array<string | null> = [];
  for (let i = 0; i < mondayOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  while (cells.length < 42) cells.push(null);
  return cells.slice(0, 42);
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}
