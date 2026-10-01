import { describe, it, expect } from 'vitest'; import { formatDateTime, formatShortDate, formatDayLabel, formatFullDate, monthStart, weekStart, yearStart, addMonths, formatMonth } from './dates';
describe('dates', () => {
  it('formatDateTime combines short date and time', () => {
    const ts = new Date(2026, 8, 28, 15, 4).getTime();
    const s = formatDateTime(ts);
    expect(s).toContain('Sep 28'); expect(s).toContain('3:04 PM');
  });
  it('formatShortDate shows date without time', () => {
    const s = formatShortDate(new Date(2026, 8, 28, 15, 4).getTime());
    expect(s).toContain('Sep 28'); expect(s).not.toMatch(/\d{1,2}:\d{2}/);
  });
  it('day labels stay intact', () => {
    const ts = new Date(2026, 8, 28, 12).getTime();
    expect(formatDayLabel(ts)).toContain('28'); expect(formatFullDate(ts)).toContain('SEP 28');
  });
  it('weekStart snaps to Monday 00:00', () => {
    const wed = new Date(2026, 8, 30, 15, 4).getTime();
    const mon = new Date(weekStart(wed));
    expect(mon.getDay()).toBe(1); expect(mon.getHours()).toBe(0); expect(mon.getMinutes()).toBe(0);
    expect(mon.getDate()).toBe(28);
    const monday = new Date(2026, 8, 28, 0, 30).getTime();
    expect(new Date(weekStart(monday)).getDate()).toBe(28);
    const sun = new Date(2026, 9, 4, 23, 59).getTime();
    expect(new Date(weekStart(sun)).getDate()).toBe(28);
    expect(new Date(weekStart(sun)).getMonth()).toBe(8);
  });
  it('month helpers navigate calendar months', () => {
    const ts = new Date(2026, 8, 15, 12).getTime();
    const start = new Date(monthStart(ts));
    expect(start.getDate()).toBe(1); expect(start.getMonth()).toBe(8);
    expect(formatMonth(ts)).toBe('September 2026');
    expect(new Date(addMonths(ts, 1)).getMonth()).toBe(9);
    expect(new Date(addMonths(ts, -1)).getMonth()).toBe(7);
    const ys = new Date(yearStart(ts));
    expect(ys.getMonth()).toBe(0); expect(ys.getDate()).toBe(1);
    expect(ys.getHours()).toBe(0); expect(ys.getMinutes()).toBe(0);
  });
});
