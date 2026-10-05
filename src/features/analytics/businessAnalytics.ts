import type { ParkingTransaction } from '../../types/parking';
import { formatPeso } from '../../lib/currency';
import { normalizePlate } from '../../lib/validation';
import { addDays, eachDay, startOfDay, weekStart } from '../../lib/dates';

export type Tone = 'up' | 'down' | 'flat' | 'none';

/** Half-open local-day window `[from, to)`. */
export interface BusinessWindow { from: number; to: number }

export interface BusinessDayMetrics { day: number; revenue: number; motorcycles: number; entries: number; }
export interface BusinessSummary { revenue: number; motorcycles: number; activeDays: number; avgDailyRevenue: number; }

export interface DayTotal { revenue: number; bikes: number; }
export interface WeekTotal { revenue: number; bikes: number; avgTicket: number; }
export interface Debtor { id: string; plate: string; days: number; amount: string; repeat: boolean; }

export interface BusinessSnapshot {
  now: number;
  today: DayTotal;
  todayDelta: string | null;
  todayTone: Tone;
  week: WeekTotal;
  weekDelta: string | null;
  weekTone: Tone;
  unpaid: { amount: string; count: number; oldestDays: number | null; debtors: Debtor[] };
  parkedNow: number;
  invalidRecords: number;
  hasRecords: boolean;
}

/** Local day number for a timestamp, or null when the value is missing or unusable. */
const dayOf = (ts: number | undefined | null): number | null =>
  ts != null && Number.isFinite(ts) ? startOfDay(ts) : null;

export interface AggregateResult {
  days: Map<number, BusinessDayMetrics>;
  invalidRecords: number;
  unpaidAmount: number;
  unpaidCount: number;
  earliestDay: number | null;
}

/** Single pass over every record, bucketed by local day. */
export function aggregateDays(txs: readonly ParkingTransaction[]): AggregateResult {
  const acc = new Map<number, { revenue: number; motorcycles: number; entries: number }>();
  const touch = (day: number) => {
    let e = acc.get(day);
    if (!e) { e = { revenue: 0, motorcycles: 0, entries: 0 }; acc.set(day, e); }
    return e;
  };
  let invalidRecords = 0, unpaidAmount = 0, unpaidCount = 0, earliestDay: number | null = null;
  for (const t of txs) {
    const feeOk = Number.isFinite(t.fee);
    const entryDay = dayOf(t.checkInAt);
    const exitDay = t.status === 'completed' ? dayOf(t.checkOutAt) : null;
    const settleDay = t.paymentStatus === 'paid' ? dayOf(t.firstPaidAt ?? t.paidAt) : null;
    const defects =
      (feeOk ? 0 : 1) +
      (entryDay == null ? 1 : 0) +
      (t.status === 'completed' && exitDay == null ? 1 : 0) +
      (t.paymentStatus === 'paid' && settleDay == null ? 1 : 0);
    if (defects > 0) invalidRecords++;
    if (entryDay != null) { touch(entryDay).entries += 1; if (earliestDay == null || entryDay < earliestDay) earliestDay = entryDay; }
    if (t.status === 'completed' && exitDay != null) { touch(exitDay).motorcycles += 1; if (earliestDay == null || exitDay < earliestDay) earliestDay = exitDay; }
    if (t.paymentStatus === 'paid' && settleDay != null && feeOk) { touch(settleDay).revenue += t.fee; if (earliestDay == null || settleDay < earliestDay) earliestDay = settleDay; }
    if (t.paymentStatus !== 'paid' && feeOk) { unpaidAmount += t.fee; unpaidCount += 1; }
  }
  const days = new Map<number, BusinessDayMetrics>();
  for (const [day, v] of acc) days.set(day, { day, revenue: v.revenue, motorcycles: v.motorcycles, entries: v.entries });
  return { days, invalidRecords, unpaidAmount, unpaidCount, earliestDay };
}

const sumIn = (days: Map<number, BusinessDayMetrics>, w: BusinessWindow, pick: (m: BusinessDayMetrics) => number): number => {
  let total = 0;
  for (const [day, m] of days) if (day >= w.from && day < w.to) total += pick(m);
  return total;
};

export function summarizeWindow(days: Map<number, BusinessDayMetrics>, w: BusinessWindow): BusinessSummary {
  const revenue = sumIn(days, w, m => m.revenue);
  const motorcycles = sumIn(days, w, m => m.motorcycles);
  let activeDays = 0;
  for (const [day, m] of days) {
    if (day < w.from || day >= w.to) continue;
    if (m.entries > 0 || m.motorcycles > 0 || m.revenue > 0) activeDays += 1;
  }
  return { revenue, motorcycles, activeDays, avgDailyRevenue: activeDays > 0 ? Math.round(revenue / activeDays) : 0 };
}

export interface ComparisonResult { deltaText: string | null; tone: Tone; }

const signed = (n: number, fmt: (v: number) => string): string => `${n > 0 ? '+' : n < 0 ? '-' : ''}${fmt(Math.abs(n))}`;
const count = (v: number): string => v.toLocaleString('en-PH');

export function compareValue(
  cur: number, prev: number | null, baseline: string,
  fmt: (v: number) => string = count, zeroBaselineNote?: string,
): ComparisonResult {
  if (prev == null) return { deltaText: null, tone: 'none' };
  if (cur === 0 && prev === 0) return { deltaText: null, tone: 'none' };
  const delta = cur - prev;
  if (delta === 0) return { deltaText: `No change vs ${baseline}`, tone: 'flat' };
  if (prev === 0) {
    return { deltaText: `${signed(cur, fmt)} · no ${zeroBaselineNote ?? 'prior total'} vs ${baseline}`, tone: 'none' };
  }
  const rounded = Math.round(((delta / prev) * 100) * 10) / 10;
  const body = rounded === 0 ? signed(delta, fmt) : `${signed(delta, fmt)} · ${signed(rounded, v => `${v.toFixed(1)}%`)}`;
  return { deltaText: `${body} vs ${baseline}`, tone: delta > 0 ? 'up' : 'down' };
}

/** Today vs yesterday, amount only — percentages lie on small daily numbers. */
function compareDay(cur: number, prev: number): ComparisonResult {
  if (cur === prev) return { deltaText: cur === 0 ? null : 'No change vs yesterday', tone: cur === 0 ? 'none' : 'flat' };
  const delta = cur - prev;
  return { deltaText: `${signed(delta, formatPeso)} vs yesterday`, tone: delta > 0 ? 'up' : 'down' };
}

export function buildBusinessSnapshot(input: { txs: readonly ParkingTransaction[]; now?: number }): BusinessSnapshot {
  const now = input.now ?? Date.now();
  const { days, invalidRecords, unpaidAmount, unpaidCount } = aggregateDays(input.txs);
  const today = startOfDay(now);
  const yesterday = addDays(today, -1);
  const t = days.get(today);
  const y = days.get(yesterday);
  const todayRev = t?.revenue ?? 0;
  const todayBikes = t?.motorcycles ?? 0;
  const dayCmp = compareDay(todayRev, y?.revenue ?? 0);

  const ws = weekStart(now);
  const weekW: BusinessWindow = { from: ws, to: addDays(today, 1) };
  const prevW: BusinessWindow = { from: addDays(ws, -7), to: ws };
  const weekRev = sumIn(days, weekW, m => m.revenue);
  const weekBikes = sumIn(days, weekW, m => m.motorcycles);
  const prevRev = sumIn(days, prevW, m => m.revenue);
  const weekCmp = compareValue(weekRev, prevRev, 'last week', formatPeso, 'prior revenue');

  let oldestDays: number | null = null;
  const debtors: Debtor[] = [];
  {
    let oldest: number | null = null;
    const lifetime = new Map<string, number>();
    const open: { id: string; plate: string; entry: number; fee: number }[] = [];
    for (const tx of input.txs) {
      if (tx.paymentStatus === 'paid' || !Number.isFinite(tx.fee)) continue;
      lifetime.set(normalizePlate(tx.plateNumber), (lifetime.get(normalizePlate(tx.plateNumber)) ?? 0) + 1);
      const entry = dayOf(tx.checkInAt);
      if (entry == null) continue;
      if (oldest == null || entry < oldest) oldest = entry;
      open.push({ id: tx.id, plate: tx.plateNumber, entry, fee: tx.fee });
    }
    if (oldest != null) oldestDays = eachDay(oldest, today).length - 1;
    open.sort((a, b) => a.entry - b.entry);
    for (const o of open.slice(0, 3)) {
      debtors.push({
        id: o.id,
        plate: o.plate,
        days: eachDay(o.entry, today).length - 1,
        amount: formatPeso(o.fee),
        repeat: (lifetime.get(normalizePlate(o.plate)) ?? 0) >= 2,
      });
    }
  }

  return {
    now,
    today: { revenue: todayRev, bikes: todayBikes },
    todayDelta: dayCmp.deltaText,
    todayTone: dayCmp.tone,
    week: { revenue: weekRev, bikes: weekBikes, avgTicket: weekBikes > 0 ? Math.round(weekRev / weekBikes) : 0 },
    weekDelta: weekCmp.deltaText,
    weekTone: weekCmp.tone,
    unpaid: { amount: formatPeso(unpaidAmount), count: unpaidCount, oldestDays, debtors },
    parkedNow: input.txs.filter(tx => tx.status === 'parked').length,
    invalidRecords,
    hasRecords: input.txs.length > 0,
  };
}
