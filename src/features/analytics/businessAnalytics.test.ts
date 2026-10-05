import { describe, it, expect } from 'vitest';
import type { ParkingTransaction } from '../../types/parking';
import { addDays, eachDay, startOfDay } from '../../lib/dates';
import {
  aggregateDays, buildBusinessSnapshot, compareValue, summarizeWindow,
} from './businessAnalytics';

let seq = 0;
const tx = (over: Partial<ParkingTransaction> = {}): ParkingTransaction => ({
  id: `t${++seq}`, plateNumber: 'X 1', checkInAt: 0, fee: 20, status: 'completed', paymentStatus: 'unpaid', ...over,
});
const at = (base: number, dayOffset: number, hour = 10): number => {
  const d = new Date(addDays(startOfDay(base), dayOffset));
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
};
const NOW = new Date(2026, 4, 15, 14, 30, 0).getTime(); // Fri 15 May 2026, 2:30 PM local
const money = (n: number) => `₱${n.toLocaleString('en-PH')}`;
/** A fully settled same-day record `daysAgo` days back. */
const settled = (daysAgo: number, fee: number, hour = 9) => tx({
  checkInAt: at(NOW, -daysAgo, 8), checkOutAt: at(NOW, -daysAgo, 9), fee,
  status: 'completed', paymentStatus: 'paid',
  paidAt: at(NOW, -daysAgo, hour), firstPaidAt: at(NOW, -daysAgo, hour),
});

describe('aggregation', () => {
  it('buckets revenue by settlement day, motorcycles by checkout day, entries by check-in day', () => {
    const { days } = aggregateDays([
      tx({ checkInAt: at(NOW, -2, 8), checkOutAt: at(NOW, -2, 9), fee: 50, paymentStatus: 'paid', paidAt: at(NOW, -1, 11), firstPaidAt: at(NOW, -1, 11) }),
    ]);
    expect(days.get(startOfDay(at(NOW, -2)))?.entries).toBe(1);
    expect(days.get(startOfDay(at(NOW, -2)))?.motorcycles).toBe(1);
    expect(days.get(startOfDay(at(NOW, -2)))?.revenue).toBe(0);
    expect(days.get(startOfDay(at(NOW, -1)))?.revenue).toBe(50);
  });
  it('falls back to paidAt for legacy rows without firstPaidAt', () => {
    const { days } = aggregateDays([tx({ checkInAt: at(NOW, -3, 8), checkOutAt: at(NOW, -3, 9), fee: 30, paymentStatus: 'paid', paidAt: at(NOW, -1, 9) })]);
    expect(days.get(startOfDay(at(NOW, -1)))?.revenue).toBe(30);
  });
  it('never relocates revenue when firstPaidAt differs from paidAt', () => {
    const { days } = aggregateDays([tx({ checkInAt: at(NOW, -5, 8), checkOutAt: at(NOW, -5, 9), fee: 40, paymentStatus: 'paid', paidAt: at(NOW, 0, 9), firstPaidAt: at(NOW, -5, 9) })]);
    expect(days.get(startOfDay(at(NOW, -5)))?.revenue).toBe(40);
    expect(days.get(startOfDay(at(NOW, 0)))?.revenue ?? 0).toBe(0);
  });
  it('excludes unpaid from revenue and totals it as outstanding', () => {
    const r = aggregateDays([
      tx({ checkInAt: at(NOW, -1, 8), checkOutAt: at(NOW, -1, 9), fee: 20, paymentStatus: 'unpaid' }),
      tx({ checkInAt: at(NOW, -1, 8), checkOutAt: at(NOW, -1, 9), fee: 35, paymentStatus: 'unpaid' }),
    ]);
    expect(r.unpaidAmount).toBe(55);
    expect(r.unpaidCount).toBe(2);
    expect([...r.days.values()].every(d => d.revenue === 0)).toBe(true);
  });
  it('counts unpaid records as active days but never as revenue', () => {
    const { days } = aggregateDays([tx({ checkInAt: at(NOW, -1, 8), checkOutAt: at(NOW, -1, 9), fee: 20, paymentStatus: 'unpaid' })]);
    const s = summarizeWindow(days, { from: addDays(startOfDay(NOW), -29), to: addDays(startOfDay(NOW), 1) });
    expect(s.activeDays).toBe(1);
    expect(s.revenue).toBe(0);
    expect(s.avgDailyRevenue).toBe(0);
  });
  it('quarantines paid records with no usable settlement timestamp', () => {
    const r = aggregateDays([tx({ checkInAt: at(NOW, -1, 8), checkOutAt: at(NOW, -1, 9), fee: 20, paymentStatus: 'paid' })]);
    expect(r.invalidRecords).toBe(1);
    expect([...r.days.values()].every(d => d.revenue === 0)).toBe(true);
  });
  it('quarantines non-finite fees and excludes them from every total', () => {
    const r = aggregateDays([
      tx({ checkInAt: at(NOW, -1, 8), checkOutAt: at(NOW, -1, 9), fee: Number.NaN, paymentStatus: 'paid', paidAt: at(NOW, -1, 9), firstPaidAt: at(NOW, -1, 9) }),
      tx({ checkInAt: at(NOW, -1, 8), checkOutAt: at(NOW, -1, 9), fee: Number.POSITIVE_INFINITY, paymentStatus: 'unpaid' }),
    ]);
    expect(r.invalidRecords).toBe(2);
    expect(r.unpaidAmount).toBe(0);
    expect(r.unpaidCount).toBe(0);
  });
  it('counts a completed record with no checkout timestamp as invalid but keeps its revenue', () => {
    const r = aggregateDays([tx({ checkInAt: at(NOW, -1, 8), fee: 60, paymentStatus: 'paid', paidAt: at(NOW, -1, 9), firstPaidAt: at(NOW, -1, 9) })]);
    expect(r.invalidRecords).toBe(1);
    expect([...r.days.values()].reduce((s, d) => s + d.revenue, 0)).toBe(60);
  });
  it('is safe on an empty list', () => {
    const r = aggregateDays([]);
    expect(r.days.size).toBe(0);
    expect(r.invalidRecords).toBe(0);
    expect(r.unpaidAmount).toBe(0);
    expect(r.earliestDay).toBeNull();
  });
  it('reports the earliest activity across entry, checkout and settlement', () => {
    const r = aggregateDays([tx({ checkInAt: at(NOW, -10, 8), checkOutAt: at(NOW, -1, 9), fee: 20, paymentStatus: 'paid', paidAt: at(NOW, 0, 9), firstPaidAt: at(NOW, 0, 9) })]);
    expect(r.earliestDay).toBe(startOfDay(at(NOW, -10)));
  });
});

describe('window summaries', () => {
  const days = aggregateDays([
    tx({ checkInAt: at(NOW, -4, 8), checkOutAt: at(NOW, -4, 9), fee: 100, paymentStatus: 'paid', paidAt: at(NOW, -4, 9), firstPaidAt: at(NOW, -4, 9) }),
    tx({ checkInAt: at(NOW, -1, 8), checkOutAt: at(NOW, -1, 9), fee: 20, paymentStatus: 'paid', paidAt: at(NOW, -1, 9), firstPaidAt: at(NOW, -1, 9) }),
    tx({ checkInAt: at(NOW, -2, 8), checkOutAt: at(NOW, -2, 9), fee: 20, paymentStatus: 'unpaid' }),
  ]).days;

  it('counts distinct active days and averages over them only', () => {
    const s = summarizeWindow(days, { from: addDays(startOfDay(NOW), -29), to: addDays(startOfDay(NOW), 1) });
    expect(s.revenue).toBe(120);
    expect(s.motorcycles).toBe(3);
    expect(s.activeDays).toBe(3);
    expect(s.avgDailyRevenue).toBe(40);
  });
  it('excludes everything outside the window', () => {
    const s = summarizeWindow(days, { from: startOfDay(at(NOW, 0)), to: addDays(startOfDay(NOW), 1) });
    expect(s.revenue).toBe(0);
    expect(s.activeDays).toBe(0);
    expect(s.avgDailyRevenue).toBe(0);
  });
});

describe('comparison text', () => {
  it('shows amount, one-decimal percentage and the baseline', () => {
    const r = compareValue(184620, 168280, 'previous 30 days', money);
    expect(r.tone).toBe('up');
    expect(r.deltaText).toBe('+₱16,340 · +9.7% vs previous 30 days');
  });
  it('flags decreases', () => {
    const r = compareValue(800, 835, 'previous week', money);
    expect(r.tone).toBe('down');
    expect(r.deltaText).toBe('-₱35 · -4.2% vs previous week');
  });
  it('never invents a percentage when the baseline is zero', () => {
    const r = compareValue(120, 0, 'previous 30 days', money, 'prior revenue');
    expect(r.tone).toBe('none');
    expect(r.deltaText).toBe('+₱120 · no prior revenue vs previous 30 days');
    expect(r.deltaText).not.toContain('%');
  });
  it('says nothing when both periods are empty', () => {
    expect(compareValue(0, 0, 'previous 30 days', money).deltaText).toBeNull();
  });
  it('reports a flat period', () => {
    const r = compareValue(500, 500, 'previous 90 days', money);
    expect(r.tone).toBe('flat');
    expect(r.deltaText).toBe('No change vs previous 90 days');
  });
  it('drops a percentage that rounds to zero', () => {
    const r = compareValue(1000001, 1000000, 'previous 30 days', money);
    expect(r.deltaText).toBe('+₱1 vs previous 30 days');
  });
  it('omits the comparison entirely when there is no baseline', () => {
    expect(compareValue(10, null, 'previous 30 days', money).deltaText).toBeNull();
  });
});

describe('overview snapshot', () => {
  it('reports today against yesterday with an amount-only delta', () => {
    const s = buildBusinessSnapshot({ txs: [settled(0, 60), settled(1, 40)], now: NOW });
    expect(s.today).toEqual({ revenue: 60, bikes: 1 });
    expect(s.todayDelta).toBe('+₱20 vs yesterday');
    expect(s.todayTone).toBe('up');
  });
  it('reports a down day and a flat day', () => {
    const down = buildBusinessSnapshot({ txs: [settled(0, 30), settled(1, 50)], now: NOW });
    expect(down.todayDelta).toBe('-₱20 vs yesterday');
    expect(down.todayTone).toBe('down');
    const flat = buildBusinessSnapshot({ txs: [settled(0, 40), settled(1, 40)], now: NOW });
    expect(flat.todayDelta).toBe('No change vs yesterday');
    expect(flat.todayTone).toBe('flat');
  });
  it('compares the week to date against the equivalent prior stretch', () => {
    // NOW is Fri 15 May 2026; the week started Mon 11 May.
    const s = buildBusinessSnapshot({
      txs: [settled(0, 60), settled(4, 40), settled(10, 30)],
      now: NOW,
    });
    expect(s.week.revenue).toBe(100);
    expect(s.week.bikes).toBe(2);
    expect(s.week.avgTicket).toBe(50);
    expect(s.weekDelta).toBe('+₱70 · +233.3% vs last week');
    expect(s.weekTone).toBe('up');
  });
  it('lists the oldest debtors first with repeat flags, capped at three', () => {
    const s = buildBusinessSnapshot({
      txs: [
        tx({ id: 'd1', plateNumber: 'AAA 1', checkInAt: at(NOW, -12, 8), checkOutAt: at(NOW, -12, 9), fee: 20, status: 'completed', paymentStatus: 'unpaid' }),
        tx({ id: 'd2', plateNumber: 'BBB 2', checkInAt: at(NOW, -3, 8), fee: 40, status: 'parked', paymentStatus: 'unpaid' }),
        tx({ id: 'd3', plateNumber: 'AAA 1', checkInAt: at(NOW, -1, 8), fee: 20, status: 'parked', paymentStatus: 'unpaid' }),
        tx({ id: 'd4', plateNumber: 'CCC 3', checkInAt: at(NOW, -5, 8), checkOutAt: at(NOW, -5, 9), fee: 25, status: 'completed', paymentStatus: 'unpaid' }),
        settled(0, 60),
      ],
      now: NOW,
    });
    expect(s.unpaid.count).toBe(4);
    expect(s.unpaid.debtors.length).toBe(3);
    expect(s.unpaid.debtors[0]).toMatchObject({ plate: 'AAA 1', days: 12, amount: money(20), repeat: true });
    expect(s.unpaid.debtors[1]).toMatchObject({ plate: 'CCC 3', days: 5, repeat: false });
    expect(s.unpaid.debtors[2]).toMatchObject({ plate: 'BBB 2', days: 3, repeat: false });
  });
  it('keeps same-plate same-day debts as distinct rows', () => {
    const s = buildBusinessSnapshot({
      txs: [
        tx({ id: 'e1', plateNumber: 'SAME 1', checkInAt: at(NOW, -2, 8), fee: 20, status: 'parked', paymentStatus: 'unpaid' }),
        tx({ id: 'e2', plateNumber: 'SAME 1', checkInAt: at(NOW, -2, 9), fee: 20, status: 'parked', paymentStatus: 'unpaid' }),
      ],
      now: NOW,
    });
    expect(s.unpaid.debtors.map(d => d.id).sort()).toEqual(['e1', 'e2']);
  });
  it('scopes unpaid to the whole lot with the oldest age in days', () => {
    const s = buildBusinessSnapshot({
      txs: [
        settled(0, 60),
        tx({ checkInAt: at(NOW, -12, 8), fee: 25, status: 'completed', checkOutAt: at(NOW, -12, 9), paymentStatus: 'unpaid' }),
        tx({ checkInAt: at(NOW, -3, 8), fee: 20, status: 'parked', paymentStatus: 'unpaid' }),
      ],
      now: NOW,
    });
    expect(s.unpaid.amount).toBe(money(45));
    expect(s.unpaid.count).toBe(2);
    expect(s.unpaid.oldestDays).toBe(12);
  });
  it('counts currently parked motorcycles', () => {
    const s = buildBusinessSnapshot({
      txs: [settled(0, 60), tx({ checkInAt: at(NOW, 0, 8), fee: 20, status: 'parked', paymentStatus: 'unpaid' })],
      now: NOW,
    });
    expect(s.parkedNow).toBe(1);
  });
  it('handles a completely empty database', () => {
    const s = buildBusinessSnapshot({ txs: [], now: NOW });
    expect(s.hasRecords).toBe(false);
    expect(s.today).toEqual({ revenue: 0, bikes: 0 });
    expect(s.todayDelta).toBeNull();
    expect(s.weekDelta).toBeNull();
    expect(s.unpaid).toEqual({ amount: money(0), count: 0, oldestDays: null, debtors: [] });
    expect(s.parkedNow).toBe(0);
  });
  it('splits settle-later revenue from its checkout day', () => {
    const settledTx = tx({ checkInAt: at(NOW, -6, 8), checkOutAt: at(NOW, -6, 9), fee: 90, paymentStatus: 'paid', paidAt: at(NOW, -1, 15), firstPaidAt: at(NOW, -1, 15) });
    const s = buildBusinessSnapshot({ txs: [settledTx], now: NOW });
    expect(s.today).toEqual({ revenue: 0, bikes: 0 });
    expect(s.week.revenue).toBe(90);
    expect(s.todayDelta).toBe('-₱90 vs yesterday');
  });
  it('keeps corrupt future-dated revenue out of today and the week', () => {
    const future = tx({ checkInAt: at(NOW, 0, 8), fee: 999, paymentStatus: 'paid', paidAt: addDays(startOfDay(NOW), 3), firstPaidAt: addDays(startOfDay(NOW), 3) });
    const s = buildBusinessSnapshot({ txs: [settled(0, 50), future], now: NOW });
    expect(s.today.revenue).toBe(50);
    expect(s.week.revenue).toBe(50);
  });
});

/** Calendar boundaries are the classic source of off-by-one bugs, so pin them explicitly. */
describe('date boundaries', () => {
  const day0 = (y: number, m: number, d: number) => new Date(y, m, d, 0, 0, 0, 0).getTime();
  const at2 = (base: number, dayOffset: number, hour: number) => { const d = new Date(addDays(startOfDay(base), dayOffset)); d.setHours(hour, 0, 0, 0); return d.getTime(); };
  /** A fully valid settled record, so the window is not skewed by the tx() defaults. */
  const settled2 = (base: number, dayOffset: number, fee: number) => tx({
    checkInAt: at2(base, dayOffset, 8), checkOutAt: at2(base, dayOffset, 9), fee,
    status: 'completed', paymentStatus: 'paid', paidAt: at2(base, dayOffset, 10), firstPaidAt: at2(base, dayOffset, 10),
  });

  it('last day of a 31 day month attributes revenue to today', () => {
    const now = new Date(2026, 0, 31, 14, 0, 0, 0).getTime(); // Sat 31 Jan 2026
    const s = buildBusinessSnapshot({ txs: [settled2(now, 0, 50)], now });
    expect(s.today.revenue).toBe(50);
    expect(s.week.revenue).toBe(50);
  });

  it('first day of a month counts only today', () => {
    const now = new Date(2026, 2, 1, 14, 0, 0, 0).getTime(); // Sun 1 Mar 2026
    const s = buildBusinessSnapshot({ txs: [settled2(now, 0, 40)], now });
    expect(s.today).toEqual({ revenue: 40, bikes: 1 });
  });

  it('leap day is a real calendar day', () => {
    const now = new Date(2028, 1, 29, 14, 0, 0, 0).getTime(); // Tue 29 Feb 2028
    const s = buildBusinessSnapshot({ txs: [settled2(now, 0, 60)], now });
    expect(s.today.revenue).toBe(60);
  });

  it('every day of leap February 2028 is enumerable without gaps or duplicates', () => {
    const days = eachDay(day0(2028, 1, 1), day0(2028, 2, 1) - 1);
    expect(days.length).toBe(29);
    expect(new Set(days).size).toBe(29);
  });
});
