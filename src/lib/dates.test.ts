import { describe, it, expect } from 'vitest'; import { formatDateTime, formatDayLabel, formatFullDate } from './dates';
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
});
