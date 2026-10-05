import type { ParkingTransaction } from '../../types/parking';
import { formatPeso } from '../../lib/currency';
import { normalizePlate } from '../../lib/validation';
import { addDays, eachDay, startOfDay } from '../../lib/dates';

export type ScopeId = 'today' | '7d' | '30d' | 'all';
export const SCOPES: readonly { id: ScopeId; tab: string; label: string }[] = [
  { id: 'today', tab: 'Today', label: 'today' },
  { id: '7d', tab: '7D', label: 'last 7 days' },
  { id: '30d', tab: '30D', label: 'last 30 days' },
  { id: 'all', tab: 'All', label: 'all time' },
];

/** Half-open local-day window `[from, to)`. */
export interface BusinessWindow { from: number; to: number }

export interface BusinessDayMetrics { day: number; revenue: number; motorcycles: number; entries: number; }

export interface ScopeSummary { id: ScopeId; label: string; revenue: number; bikes: number; avgTicket: number; }
export interface Debtor { id: string; plate: string; days: number; amount: string; repeat: boolean; }

export interface BusinessSnapshot {
  now: number;
  scope: ScopeId;
  summary: ScopeSummary;
  unpaid: { amount: string; count: number; oldestDays: number | null; debtors: Debtor[] };
  parkedNow: number;
  invalidRecords: number;
  hasRecords: boolean;
}

/** Trailing scopes always include today; `all` starts at the earliest activity. */
export function resolveScope(scope: ScopeId, now: number, earliestDay: number | null): BusinessWindow {
  const today = startOfDay(now);
  const to = addDays(today, 1);
  switch (scope) {
    case 'today': return { from: today, to };
    case '7d': return { from: addDays(today, -6), to };
    case '30d': return { from: addDays(today, -29), to };
    case 'all': return { from: earliestDay ?? today, to };
  }
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

export function buildBusinessSnapshot(input: { txs: readonly ParkingTransaction[]; scope: ScopeId; now?: number }): BusinessSnapshot {
  const now = input.now ?? Date.now();
  const { days, invalidRecords, unpaidAmount, unpaidCount, earliestDay } = aggregateDays(input.txs);
  const today = startOfDay(now);
  const window = resolveScope(input.scope, now, earliestDay);
  const label = SCOPES.find(s => s.id === input.scope)!.label;
  const revenue = sumIn(days, window, m => m.revenue);
  const bikes = sumIn(days, window, m => m.motorcycles);

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
    scope: input.scope,
    summary: { id: input.scope, label, revenue, bikes, avgTicket: bikes > 0 ? Math.round(revenue / bikes) : 0 },
    unpaid: { amount: formatPeso(unpaidAmount), count: unpaidCount, oldestDays, debtors },
    parkedNow: input.txs.filter(tx => tx.status === 'parked').length,
    invalidRecords,
    hasRecords: input.txs.length > 0,
  };
}
