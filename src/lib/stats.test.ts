import { afterEach, describe, expect, it } from 'vitest';
import { addDays, dateKey, isPastTime, resetClock, setClock, shanghaiParts, timeKey, weekdayLabel } from '../lib/clock';
import { dayStat, monthGrid, recentRate, shiftMonth, statsByDate, streakDays } from '../lib/stats';
import type { Task } from '../types';

afterEach(() => resetClock());

function task(date: string, done: boolean, id = `${date}-${Math.random()}`): Task {
  return {
    id,
    date,
    title: 't',
    note: '',
    done,
    doneAt: done ? 1 : null,
    isTemplate: false,
    order: 0,
    createdAt: 0,
  };
}

describe('时区口径（Asia/Shanghai）', () => {
  it('UTC 16:00 已是上海次日 00:00', () => {
    setClock(() => new Date('2026-10-27T15:59:00Z'));
    expect(dateKey()).toBe('2026-10-27');
    setClock(() => new Date('2026-10-27T16:00:00Z'));
    expect(dateKey()).toBe('2026-10-28');
  });

  it('设备时区不影响「今天」', () => {
    setClock(() => new Date('2026-10-27T23:30:00Z'));
    expect(dateKey()).toBe('2026-10-28');
    expect(timeKey()).toBe('07:30');
  });

  it('parts 与提醒时间比较', () => {
    setClock(() => new Date('2026-10-27T10:00:00Z'));
    const p = shanghaiParts();
    expect(p.hour).toBe(18);
    expect(isPastTime('18:00')).toBe(true);
    expect(isPastTime('18:01')).toBe(false);
  });

  it('日期加减与星期', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(weekdayLabel('2026-10-27')).toBe('周二');
  });
});

describe('每日统计口径', () => {
  it('进度分母是当日任务数', () => {
    const stat = dayStat('2026-10-27', [task('2026-10-27', true), task('2026-10-27', false)]);
    expect(stat.done).toBe(1);
    expect(stat.total).toBe(2);
    expect(stat.rate).toBe(0.5);
  });

  it('缺失记录的日子会中断连续（避免长期不打开仍显示长连续）', () => {
    const tasks = [task('2026-10-27', true), task('2026-10-25', true), task('2026-10-24', true)];
    const stats = statsByDate(tasks);
    expect(stats.get('2026-10-26')).toBeUndefined();
    expect(streakDays(stats, '2026-10-27')).toBe(1);
  });

  it('今天未完成时从昨天往前数，今天不打断', () => {
    const tasks = [task('2026-10-27', false), task('2026-10-26', true), task('2026-10-25', true)];
    const stats = statsByDate(tasks);
    expect(streakDays(stats, '2026-10-27')).toBe(2);
  });

  it('昨天未完成则连续中断', () => {
    const tasks = [task('2026-10-27', true), task('2026-10-26', false), task('2026-10-25', true)];
    expect(streakDays(statsByDate(tasks), '2026-10-27')).toBe(1);
  });

  it('空清单日不打断连续', () => {
    const tasks = [task('2026-10-27', true), task('2026-10-25', true)];
    // 10-26 有一条被删光的记录 → 空清单
    const stats = statsByDate(tasks);
    stats.set('2026-10-26', { date: '2026-10-26', total: 0, done: 0, rate: null });
    expect(streakDays(stats, '2026-10-27')).toBe(2);
  });

  it('近 7 天完成率忽略空清单日', () => {
    const tasks = [task('2026-10-27', true), task('2026-10-26', false)];
    const stats = statsByDate(tasks);
    expect(recentRate(stats, '2026-10-27', 7)).toBeCloseTo(0.5);
  });

  it('月历网格周一起始且固定 42 格', () => {
    const cells = monthGrid('2026-10');
    expect(cells.length).toBe(42);
    expect(cells.filter(Boolean).length).toBe(31);
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});
