import { db, ensureSeed } from './database';
import type { AppSettings, BackupFile, DailyStats, ParkingTransaction } from '../types/parking';
import { normalizePlate, isValidPlate } from '../lib/validation';
import { inDay, startOfDay } from '../lib/dates';
export interface DayStats { day: number; entries: number; completed: number; collected: number; unpaid: number; }
export async function getDayStats(day: number): Promise<DayStats> {
  const all = await db.transactions.toArray();
  return {
    day: startOfDay(day),
    entries: all.filter(t => inDay(t.checkInAt, day)).length,
    completed: all.filter(t => inDay(t.checkOutAt, day)).length,
    collected: all.filter(t => t.paymentStatus === 'paid' && inDay(revenueDay(t), day)).reduce((s, t) => s + t.fee, 0),
    unpaid: all.filter(t => t.status === 'completed' && t.paymentStatus !== 'paid' && inDay(t.checkOutAt, day)).length,
  };
}
export async function getWeekStats(now = Date.now()): Promise<DayStats[]> {
  const all = await db.transactions.toArray();
  const out: DayStats[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = startOfDay(now) - i * 86400000;
    out.push({
      day,
      entries: all.filter(t => inDay(t.checkInAt, day)).length,
      completed: all.filter(t => inDay(t.checkOutAt, day)).length,
      collected: all.filter(t => t.paymentStatus === 'paid' && inDay(revenueDay(t), day)).reduce((s, t) => s + t.fee, 0),
      unpaid: all.filter(t => t.status === 'completed' && t.paymentStatus !== 'paid' && inDay(t.checkOutAt, day)).length,
    });
  }
  return out;
}
export async function getDayBuckets(fromDay: number, toDay: number): Promise<DayStats[]> {
  const all = await db.transactions.toArray();
  const out: DayStats[] = [];
  for (let day = startOfDay(fromDay); day <= startOfDay(toDay); day += 86400000) {
    out.push({
      day,
      entries: all.filter(t => inDay(t.checkInAt, day)).length,
      completed: all.filter(t => inDay(t.checkOutAt, day)).length,
      collected: all.filter(t => t.paymentStatus === 'paid' && inDay(revenueDay(t), day)).reduce((s, t) => s + t.fee, 0),
      unpaid: all.filter(t => t.status === 'completed' && t.paymentStatus !== 'paid' && inDay(t.checkOutAt, day)).length,
    });
  }
  return out;
}
export interface RangeSummary { days: DayStats[]; totalCollected: number; totalEntries: number; peakHour: PeakHour | null; outstanding: Outstanding; }
export async function getRangeSummary(from: number, to: number): Promise<RangeSummary> {
  const days = await getDayBuckets(from, to);
  const all = await db.transactions.toArray();
  const lo = startOfDay(from); const hi = startOfDay(to) + 86400000;
  const hours = new Array(24).fill(0);
  for (const t of all) {
    if (t.checkInAt >= lo && t.checkInAt < hi) hours[new Date(t.checkInAt).getHours()]++;
  }
  let peakHour: PeakHour | null = null;
  hours.forEach((c, h) => { if (c > 0 && (!peakHour || c > peakHour.count)) peakHour = { hour: h, count: c }; });
  const open = all.filter(t => t.paymentStatus !== 'paid');
  return {
    days,
    totalCollected: days.reduce((s, d) => s + d.collected, 0),
    totalEntries: days.reduce((s, d) => s + d.entries, 0),
    peakHour,
    outstanding: { count: open.length, amount: open.reduce((s, t) => s + t.fee, 0) },
  };
}
export async function getActiveDays(): Promise<number[]> {
  const all = await db.transactions.toArray();
  const set = new Set<number>();
  for (const t of all) {
    set.add(startOfDay(t.checkInAt));
    if (t.checkOutAt != null) set.add(startOfDay(t.checkOutAt));
    if (t.paidAt != null) set.add(startOfDay(t.paidAt));
    if (t.firstPaidAt != null) set.add(startOfDay(t.firstPaidAt));
  }
  return [...set].sort((a, b) => b - a);
}
export async function getDayTransactions(day: number): Promise<ParkingTransaction[]> {
  const list = await db.transactions.where('status').equals('completed').reverse().sortBy('checkOutAt');
  return list.filter(t => inDay(t.checkOutAt, day));
}
export async function getDayRecords(day: number): Promise<ParkingTransaction[]> {
  const [done, active] = await Promise.all([getDayTransactions(day), getActive()]);
  const seen = new Set(done.map(t => t.id));
  return [...done, ...active.filter(t => inDay(t.checkInAt, day) && !seen.has(t.id))];
}
export interface PeakHour { hour: number; count: number; }
export interface Outstanding { count: number; amount: number; }
export interface RangeAnalytics { days: DayStats[]; totalCollected: number; totalEntries: number; totalCompleted: number; prevCollected: number; prevEntries: number; revenueDeltaPct: number | null; entriesDeltaPct: number | null; prevDailyAvg: number; peakHour: PeakHour | null; outstanding: Outstanding; }
const deltaPct = (cur: number, prev: number): number | null => prev === 0 ? null : Math.round(((cur - prev) / prev) * 100);
export async function getRangeAnalytics(now = Date.now()): Promise<RangeAnalytics> {
  const [days, all] = await Promise.all([getWeekStats(now), db.transactions.toArray()]);
  const weekAgo = now - 7 * 86400000;
  const prev = await getWeekStats(weekAgo);
  const prevCollected = prev.reduce((s, d) => s + d.collected, 0);
  const prevEntries = prev.reduce((s, d) => s + d.entries, 0);
  const from = startOfDay(now) - 6 * 86400000;
  const to = startOfDay(now) + 86400000;
  const hours = new Array(24).fill(0);
  for (const t of all) {
    if (t.checkInAt >= from && t.checkInAt < to) hours[new Date(t.checkInAt).getHours()]++;
  }
  let peakHour: PeakHour | null = null;
  hours.forEach((c, h) => { if (c > 0 && (!peakHour || c > peakHour.count)) peakHour = { hour: h, count: c }; });
  const open = all.filter(t => t.paymentStatus !== 'paid');
  const totalCollected = days.reduce((s, d) => s + d.collected, 0);
  const totalEntries = days.reduce((s, d) => s + d.entries, 0);
  return {
    days,
    totalCollected,
    totalEntries,
    totalCompleted: days.reduce((s, d) => s + d.completed, 0),
    prevCollected, prevEntries,
    revenueDeltaPct: deltaPct(totalCollected, prevCollected),
    entriesDeltaPct: deltaPct(totalEntries, prevEntries),
    prevDailyAvg: Math.round(prevCollected / 7),
    peakHour,
    outstanding: { count: open.length, amount: open.reduce((s, t) => s + t.fee, 0) },
  };
}

export async function getSettings(): Promise<AppSettings> {
  await ensureSeed();
  const raw = (await db.settings.get('main')) as AppSettings & { businessName?: unknown; openMin?: unknown; closeMin?: unknown };
  let dirty = false;
  if (!Number.isInteger(raw.parkingFee)) { raw.parkingFee = 20; dirty = true; }
  if (dirty) await db.settings.put({ id: 'main', parkingFee: raw.parkingFee, lastBackupAt: raw.lastBackupAt });
  return { id: 'main', parkingFee: raw.parkingFee, lastBackupAt: raw.lastBackupAt };
}
export async function updateSettings(p: Partial<Omit<AppSettings, 'id'>>): Promise<AppSettings> {
  await ensureSeed(); const cur = await getSettings();
  const next = { ...cur, ...p };
  if (!Number.isInteger(next.parkingFee) || next.parkingFee <= 0) throw new Error('Parking fee must be a positive whole peso amount.');
  await db.settings.put(next); return next;
}
export async function create(input: { plateNumber: string }): Promise<ParkingTransaction> {
  const plate = normalizePlate(input.plateNumber);
  if (!isValidPlate(input.plateNumber)) throw new Error('Enter a valid plate number.');
  const dup = await db.transactions.where({ status: 'parked', plateNumber: plate }).first();
  if (dup) throw new Error('This motorcycle is already parked.');
  const s = await getSettings();
  const tx: ParkingTransaction = { id: crypto.randomUUID(), plateNumber: plate, checkInAt: Date.now(), fee: s.parkingFee, status: 'parked', paymentStatus: 'unpaid' };
  await db.transactions.add(tx); return tx;
}
export const getActive = (search = ''): Promise<ParkingTransaction[]> =>
  db.transactions.where('status').equals('parked').reverse().sortBy('checkInAt').then(list => {
    const q = normalizePlate(search); return q ? list.filter(t => t.plateNumber.includes(q)) : list;
  });
export const getById = (id: string): Promise<ParkingTransaction | undefined> => db.transactions.get(id);
export async function renamePlate(id: string, newPlate: string): Promise<ParkingTransaction> {
  const tx = await db.transactions.get(id); if (!tx) throw new Error('Record not found.');
  if (tx.status !== 'parked') throw new Error('Only parked records can be edited.');
  const plate = normalizePlate(newPlate);
  if (!isValidPlate(newPlate)) throw new Error('Enter a valid plate number.');
  if (plate === tx.plateNumber) return tx;
  const dup = await db.transactions.where({ status: 'parked', plateNumber: plate }).first();
  if (dup && dup.id !== id) throw new Error('This motorcycle is already parked.');
  const next: ParkingTransaction = { ...tx, plateNumber: plate };
  await db.transactions.put(next); return next;
}
export const revenueDay = (t: ParkingTransaction): number | undefined => t.firstPaidAt ?? t.paidAt;
export async function markPaid(id: string): Promise<ParkingTransaction> {
  const tx = await db.transactions.get(id); if (!tx) throw new Error('Record not found.');
  if (tx.paymentStatus === 'paid') return tx;
  const now = Date.now();
  const next: ParkingTransaction = { ...tx, paymentStatus: 'paid', paidAt: now, firstPaidAt: tx.firstPaidAt ?? now };
  await db.transactions.put(next); return next;
}
export async function markUnpaid(id: string): Promise<ParkingTransaction> {
  const tx = await db.transactions.get(id); if (!tx) throw new Error('Record not found.');
  const next: ParkingTransaction = { ...tx, paymentStatus: 'unpaid', paidAt: undefined };
  await db.transactions.put(next); return next;
}
export async function checkout(id: string): Promise<ParkingTransaction> {
  const tx = await db.transactions.get(id); if (!tx) throw new Error('Record not found.');
  if (tx.status === 'completed') throw new Error('Already checked out.');
  const next: ParkingTransaction = { ...tx, status: 'completed', checkOutAt: Date.now() };
  await db.transactions.put(next); return next;
}
export async function getHistory(search = '', payment: 'all' | 'paid' | 'unpaid' = 'all'): Promise<ParkingTransaction[]> {
  let list = await db.transactions.where('status').equals('completed').reverse().sortBy('checkOutAt');
  const q = normalizePlate(search);
  if (q) list = list.filter(t => t.plateNumber.includes(q));
  if (payment !== 'all') list = list.filter(t => t.paymentStatus === payment);
  return list;
}
export async function getDailyStats(now = Date.now()): Promise<DailyStats> {
  const [parked, all] = await Promise.all([db.transactions.where('status').equals('parked').count(), db.transactions.toArray()]);
  return {
    parked,
    entriesToday: all.filter(t => inDay(t.checkInAt, now)).length,
    completedToday: all.filter(t => inDay(t.checkOutAt, now)).length,
    collectedToday: all.filter(t => t.paymentStatus === 'paid' && inDay(revenueDay(t), now)).reduce((s, t) => s + t.fee, 0),
  };
}
export async function exportBackup(): Promise<BackupFile> {
  const s = await getSettings(); const transactions = await db.transactions.toArray();
  return { version: 2, exportedAt: Date.now(), settings: { parkingFee: s.parkingFee }, transactions };
}
export function validateBackup(d: unknown): BackupFile {
  if (typeof d !== 'object' || d === null) throw new Error('Invalid backup file.');
  const b = d as BackupFile & { settings?: { businessName?: unknown; parkingFee?: unknown; openMin?: unknown; closeMin?: unknown }; transactions?: Array<Record<string, unknown>> };
  if ((b.version as number) !== 1 && (b.version as number) !== 2) throw new Error('Unsupported backup version.');
  if (!Number.isInteger(b.settings?.parkingFee)) throw new Error('Invalid backup settings.');
  if (!Array.isArray(b.transactions)) throw new Error('Invalid backup transactions.');
  const txs: ParkingTransaction[] = b.transactions.map(t => {
    if (!t.id || !t.plateNumber || !t.checkInAt || !['parked', 'completed'].includes(t.status as string)) throw new Error('Invalid transaction in backup.');
    return { id: t.id, plateNumber: t.plateNumber, checkInAt: t.checkInAt, checkOutAt: t.checkOutAt, fee: t.fee, status: t.status, paymentStatus: t.paymentStatus === 'paid' ? 'paid' : 'unpaid', paidAt: t.paidAt, firstPaidAt: (t as ParkingTransaction).firstPaidAt } as ParkingTransaction;
  });
  return { version: 2, exportedAt: typeof b.exportedAt === 'number' ? b.exportedAt : Date.now(), settings: { parkingFee: b.settings!.parkingFee as number }, transactions: txs };
}
export async function importBackup(data: unknown): Promise<void> {
  const b = validateBackup(data);
  await db.transaction('rw', db.transactions, db.settings, async () => {
    await db.transactions.clear();
    await db.transactions.bulkAdd(b.transactions);
    await db.settings.put({ id: 'main', parkingFee: b.settings.parkingFee });
  });
}
export async function clearAll(): Promise<void> {
  await db.transaction('rw', db.transactions, db.settings, async () => { await db.transactions.clear(); await db.settings.clear(); });
  await ensureSeed();
}
