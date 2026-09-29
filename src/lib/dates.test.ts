import { describe, it, expect } from 'vitest'; import { formatDateTime, formatDayLabel, formatFullDate, monthStart, addMonths, formatMonth } from './dates';
describe('dates', () => {
  it('formatDateTime combines short date and time', () => {
    const ts = new Date(2026, 8, 28, 15, 4).getTime();
    const s = formatDateTime(ts);
    expect(s).toContain('Sep 28'); expect(s).toContain('3:04 PM');
  });
  it('day labels stay intact', () => {
    const ts = new Date(2026, 8, 28, 12).getTime();
    expect(formatDayLabel(ts)).toContain('28'); expect(formatFullDate(ts)).toContain('SEP 28');
  });
  it('month helpers navigate calendar months', () => {
    const ts = new Date(2026, 8, 15, 12).getTime();
    const start = new Date(monthStart(ts));
    expect(start.getDate()).toBe(1); expect(start.getMonth()).toBe(8);
    expect(formatMonth(ts)).toBe('September 2026');
    expect(new Date(addMonths(ts, 1)).getMonth()).toBe(9);
    expect(new Date(addMonths(ts, -1)).getMonth()).toBe(7);
  });
});
