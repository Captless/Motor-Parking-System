import { describe, it, expect } from 'vitest'; import { formatShortDate, formatFullDate, startOfDay, addDays, eachDay, isToday } from './dates';
describe('dates', () => {
  it('formatShortDate shows date without time', () => {
    const s = formatShortDate(new Date(2026, 8, 28, 15, 4).getTime());
    expect(s).toContain('Sep 28'); expect(s).not.toMatch(/\d{1,2}:\d{2}/);
  });
  it('formatFullDate stamps uppercase day labels', () => {
    const ts = new Date(2026, 8, 28, 12).getTime();
    expect(formatFullDate(ts)).toContain('SEP 28');
  });
  it('startOfDay and isToday pin local days', () => {
    const ts = new Date(2026, 8, 28, 15, 4).getTime();
    expect(new Date(startOfDay(ts)).getHours()).toBe(0);
    expect(isToday(Date.now())).toBe(true);
    expect(isToday(new Date(2026, 8, 28, 12).getTime(), new Date(2026, 8, 29, 12).getTime())).toBe(false);
  });
  it('addDays and eachDay enumerate calendar days without gaps', () => {
    const from = new Date(2026, 8, 28, 12).getTime();
    expect(new Date(addDays(from, 3)).getDate()).toBe(1);
    expect(new Date(addDays(from, 3)).getMonth()).toBe(9);
    expect(eachDay(from, addDays(from, 2)).length).toBe(3);
  });
});
