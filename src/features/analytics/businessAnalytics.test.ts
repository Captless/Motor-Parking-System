import { describe, it, expect } from 'vitest';
import type { ParkingTransaction } from '../../types/parking';
import { addDays, eachDay, monthStart, startOfDay } from '../../lib/dates';
import {
  aggregateDays, buildBusinessSnapshot, buildMonthCells, resolveScope,
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

describe('scope windows', () => {
  const span = (scope: 'today' | '7d' | '30d' | 'all') => {
    const w = resolveScope(scope, NOW, null);
    return eachDay(w.from, w.to - 1).length;
  };
  it('today covers exactly one local day', () => {
    const w = resolveScope('today', NOW, null);
    expect(w.from).toBe(startOfDay(NOW));
    expect(w.to).toBe(addDays(startOfDay(NOW), 1));
    expect(span('today')).toBe(1);
  });
  it('7d covers today plus the previous 6 local days', () => {
    const w = resolveScope('7d', NOW, null);
    expect(w.from).toBe(addDays(startOfDay(NOW), -6));
    expect(w.to).toBe(addDays(startOfDay(NOW), 1));
    expect(span('7d')).toBe(7);
  });
  it('30d covers today plus the previous 29 local days', () => {
    const w = resolveScope('30d', NOW, null);
    expect(w.from).toBe(addDays(startOfDay(NOW), -29));
    expect(span('30d')).toBe(30);
  });
  it('all starts at the earliest activity and falls back to today', () => {
    const earliest = addDays(startOfDay(NOW), -400);
    expect(resolveScope('all', NOW, earliest).from).toBe(earliest);
    expect(resolveScope('all', NOW, null).from).toBe(startOfDay(NOW));
  });
});

describe('overview snapshot', () => {
  it('reports each scope with labels and per-scope averages', () => {
    const txs = [settled(0, 60), settled(6, 40), settled(29, 25), settled(30, 999)];
    const today = buildBusinessSnapshot({ txs, scope: 'today', now: NOW });
    expect(today.scope).toBe('today');
    expect(today.summary).toMatchObject({ label: 'today', revenue: 60, bikes: 1, avgTicket: 60 });
    const d7 = buildBusinessSnapshot({ txs, scope: '7d', now: NOW });
    expect(d7.summary).toMatchObject({ label: 'last 7 days', revenue: 100, bikes: 2, avgTicket: 50 });
    const d30 = buildBusinessSnapshot({ txs, scope: '30d', now: NOW });
    expect(d30.summary).toMatchObject({ label: 'last 30 days', revenue: 125, bikes: 3 });
    const all = buildBusinessSnapshot({ txs, scope: 'all', now: NOW });
    expect(all.summary).toMatchObject({ label: 'all time', revenue: 1124, bikes: 4 });
  });
  it('averages zero bikes as zero, not NaN', () => {
    const s = buildBusinessSnapshot({ txs: [], scope: '7d', now: NOW });
    expect(s.summary).toMatchObject({ revenue: 0, bikes: 0, avgTicket: 0 });
    expect(s.hasRecords).toBe(false);
  });
  it('scopes unpaid to the whole lot with the oldest age in days', () => {
    const s = buildBusinessSnapshot({
      txs: [
        settled(0, 60),
        tx({ checkInAt: at(NOW, -12, 8), fee: 25, status: 'completed', checkOutAt: at(NOW, -12, 9), paymentStatus: 'unpaid' }),
        tx({ checkInAt: at(NOW, -3, 8), fee: 20, status: 'parked', paymentStatus: 'unpaid' }),
      ],
      scope: 'today', now: NOW,
    });
    expect(s.unpaid.amount).toBe(money(45));
    expect(s.unpaid.count).toBe(2);
    expect(s.unpaid.oldestDays).toBe(12);
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
      scope: 'today', now: NOW,
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
      scope: 'today', now: NOW,
    });
    expect(s.unpaid.debtors.map(d => d.id).sort()).toEqual(['e1', 'e2']);
  });
  it('counts currently parked motorcycles regardless of scope', () => {
    for (const scope of ['today', '7d', '30d', 'all'] as const) {
      const s = buildBusinessSnapshot({
        txs: [settled(0, 60), tx({ checkInAt: at(NOW, 0, 8), fee: 20, status: 'parked', paymentStatus: 'unpaid' })],
        scope, now: NOW,
      });
      expect(s.parkedNow).toBe(1);
    }
  });
  it('handles a completely empty database', () => {
    const s = buildBusinessSnapshot({ txs: [], scope: 'all', now: NOW });
    expect(s.hasRecords).toBe(false);
    expect(s.summary).toMatchObject({ revenue: 0, bikes: 0, avgTicket: 0 });
    expect(s.unpaid).toEqual({ amount: money(0), count: 0, oldestDays: null, debtors: [] });
    expect(s.parkedNow).toBe(0);
  });
  it('splits settle-later revenue from its checkout day', () => {
    const settledTx = tx({ checkInAt: at(NOW, -6, 8), checkOutAt: at(NOW, -6, 9), fee: 90, paymentStatus: 'paid', paidAt: at(NOW, -1, 15), firstPaidAt: at(NOW, -1, 15) });
    const s = buildBusinessSnapshot({ txs: [settledTx], scope: 'today', now: NOW });
    expect(s.summary).toMatchObject({ revenue: 0, bikes: 0 });
    const week = buildBusinessSnapshot({ txs: [settledTx], scope: '7d', now: NOW });
    expect(week.summary.revenue).toBe(90);
  });
  it('keeps corrupt future-dated revenue out of every scope', () => {
    const future = tx({ checkInAt: at(NOW, 0, 8), fee: 999, paymentStatus: 'paid', paidAt: addDays(startOfDay(NOW), 3), firstPaidAt: addDays(startOfDay(NOW), 3) });
    for (const scope of ['today', '7d', '30d', 'all'] as const) {
      const s = buildBusinessSnapshot({ txs: [settled(0, 50), future], scope, now: NOW });
      expect(s.summary.revenue).toBe(50);
    }
  });
});

describe('month calendar cells', () => {
  // NOW is Fri 15 May 2026; May 1 is a Friday -> Monday-first lead of 4.
  const grid = (txs: Parameters<typeof buildBusinessSnapshot>[0]['txs'], cursor: number, now = NOW) => {
    const { days } = aggregateDays(txs);
    const unpaidByDay = new Map<number, { count: number; amount: number }>();
    for (const t of txs) {
      if (t.paymentStatus === 'paid') continue;
      const d = startOfDay(t.checkInAt);
      const u = unpaidByDay.get(d) ?? { count: 0, amount: 0 };
      u.count += 1; u.amount += t.fee;
      unpaidByDay.set(d, u);
    }
    return buildMonthCells(days, unpaidByDay, cursor, now);
  };
  const may = monthStart(NOW);

  it('lays out the month Monday-first with revenue, bikes and unpaid per day', () => {
    const g = grid([settled(0, 60), settled(1, 40)], may);
    expect(g.lead).toBe(4);
    expect(g.cells.length).toBe(31);
    expect(g.total).toBe(100);
    expect(g.earningDays).toBe(2);
    const today = g.cells.find(c => c.today)!;
    expect(today.revenue).toBe(60);
    expect(g.cells.find(c => c.day === addDays(startOfDay(NOW), -1))).toMatchObject({ revenue: 40, bikes: 1 });
  });
  it('marks the best revenue day, earliest on ties', () => {
    const g = grid([settled(0, 60), settled(2, 60), settled(5, 20)], may);
    expect(g.bestDay).toBe(addDays(startOfDay(NOW), -2));
  });
  it('blanks future days and keeps corrupt future revenue out of the total', () => {
    const future = tx({ checkInAt: at(NOW, 0, 8), fee: 999, paymentStatus: 'paid', paidAt: addDays(startOfDay(NOW), 3), firstPaidAt: addDays(startOfDay(NOW), 3) });
    const g = grid([settled(0, 50), future], may);
    const futureCells = g.cells.filter(c => c.future);
    expect(futureCells.length).toBeGreaterThan(0);
    expect(futureCells.every(c => c.revenue === 0)).toBe(true);
    expect(g.total).toBe(50);
    expect(g.earningDays).toBe(1);
  });
  it('scopes the total to the viewed month only', () => {
    const g = grid([settled(0, 50), settled(40, 5000)], may);
    expect(g.total).toBe(50);
    const apr = grid([settled(0, 50), settled(40, 5000)], addDays(may, -30));
    expect(apr.total).toBe(5000);
  });
  it('counts per-day unpaid by check-in day', () => {
    const g = grid([tx({ checkInAt: at(NOW, -2, 8), fee: 20, status: 'parked', paymentStatus: 'unpaid' })], may);
    expect(g.cells.find(c => c.day === addDays(startOfDay(NOW), -2))!.unpaid).toBe(1);
    expect(g.cells.find(c => c.today)!.unpaid).toBe(0);
  });
});
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
    const s = buildBusinessSnapshot({ txs: [settled2(now, 0, 50)], scope: 'today', now });
    expect(s.summary.revenue).toBe(50);
    const d7 = buildBusinessSnapshot({ txs: [settled2(now, 0, 50)], scope: '7d', now });
    expect(d7.summary.revenue).toBe(50);
  });

  it('first day of a month counts only today', () => {
    const now = new Date(2026, 2, 1, 14, 0, 0, 0).getTime(); // Sun 1 Mar 2026
    const s = buildBusinessSnapshot({ txs: [settled2(now, 0, 40)], scope: 'today', now });
    expect(s.summary).toMatchObject({ revenue: 40, bikes: 1 });
  });

  it('leap day is a real calendar day', () => {
    const now = new Date(2028, 1, 29, 14, 0, 0, 0).getTime(); // Tue 29 Feb 2028
    const s = buildBusinessSnapshot({ txs: [settled2(now, 0, 60)], scope: 'today', now });
    expect(s.summary.revenue).toBe(60);
  });

  it('every day of leap February 2028 is enumerable without gaps or duplicates', () => {
    const days = eachDay(day0(2028, 1, 1), day0(2028, 2, 1) - 1);
    expect(days.length).toBe(29);
    expect(new Set(days).size).toBe(29);
  });
});
