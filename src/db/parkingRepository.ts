import { db, ensureSeed } from './database';
import type { AppSettings, BackupFile, DailyStats, ParkingTransaction } from '../types/parking';
import { normalizePlate, isValidPlate } from '../lib/validation';
import { inDay, startOfDay } from '../lib/dates';
export interface DayStats { day: number; entries: number; completed: number; collected: number; }
export async function getDayStats(day: number): Promise<DayStats> {
  const all = await db.transactions.toArray();
  return {
    day: startOfDay(day),
    entries: all.filter(t => inDay(t.checkInAt, day)).length,
    completed: all.filter(t => inDay(t.checkOutAt, day)).length,
    collected: all.filter(t => t.paymentStatus === 'paid' && inDay(t.paidAt, day)).reduce((s, t) => s + t.fee, 0),
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
      collected: all.filter(t => t.paymentStatus === 'paid' && inDay(t.paidAt, day)).reduce((s, t) => s + t.fee, 0),
    });
  }
  return out;
}
export async function getDayTransactions(day: number): Promise<ParkingTransaction[]> {
  const list = await db.transactions.where('status').equals('completed').reverse().sortBy('checkOutAt');
  return list.filter(t => inDay(t.checkOutAt, day));
}
export interface RangeAnalytics { days: DayStats[]; totalCollected: number; avgPerDay: number; paidRate: number; avgStayMin: number; bestDay: DayStats; worstDay: DayStats; totalEntries: number; totalCompleted: number; }
export async function getRangeAnalytics(now = Date.now()): Promise<RangeAnalytics> {
  const days = await getWeekStats(now);
  const all = await db.transactions.toArray();
  const from = startOfDay(now) - 6 * 86400000;
  const inRange = (ts: number | undefined): boolean => ts != null && ts >= from && ts < startOfDay(now) + 86400000;
  const completed = all.filter(t => t.status === 'completed' && inRange(t.checkOutAt));
  const paid = completed.filter(t => t.paymentStatus === 'paid').length;
  const stays = completed.filter(t => t.checkOutAt != null).map(t => t.checkOutAt! - t.checkInAt);
  const totalCollected = days.reduce((s, d) => s + d.collected, 0);
  let bestDay = days[0]; let worstDay = days[0];
  for (const d of days) { if (d.collected > bestDay.collected) bestDay = d; if (d.collected < worstDay.collected) worstDay = d; }
  return {
    days,
    totalCollected,
    avgPerDay: Math.round(totalCollected / 7),
    paidRate: completed.length === 0 ? 0 : paid / completed.length,
    avgStayMin: stays.length === 0 ? 0 : Math.round(stays.reduce((s, m) => s + m, 0) / stays.length / 60000),
    bestDay, worstDay,
    totalEntries: days.reduce((s, d) => s + d.entries, 0),
    totalCompleted: days.reduce((s, d) => s + d.completed, 0),
  };
}

export async function getSettings(): Promise<AppSettings> {
  await ensureSeed();
  const raw = (await db.settings.get('main')) as AppSettings & { businessName?: unknown };
  if (!Number.isInteger(raw.parkingFee)) { raw.parkingFee = 20; await db.settings.put({ id: 'main', parkingFee: 20 }); }
  return { id: 'main', parkingFee: raw.parkingFee };
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
export async function markPaid(id: string): Promise<ParkingTransaction> {
  const tx = await db.transactions.get(id); if (!tx) throw new Error('Record not found.');
  if (tx.status !== 'parked') throw new Error('Only parked motorcycles can be marked paid.');
  const next: ParkingTransaction = { ...tx, paymentStatus: 'paid', paidAt: Date.now() };
  await db.transactions.put(next); return next;
}
export async function markUnpaid(id: string): Promise<ParkingTransaction> {
  const tx = await db.transactions.get(id); if (!tx) throw new Error('Record not found.');
  if (tx.status !== 'parked') throw new Error('Only parked motorcycles can be marked unpaid.');
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
    collectedToday: all.filter(t => t.paymentStatus === 'paid' && inDay(t.paidAt, now)).reduce((s, t) => s + t.fee, 0),
  };
}
export async function exportBackup(): Promise<BackupFile> {
  const s = await getSettings(); const transactions = await db.transactions.toArray();
  return { version: 2, exportedAt: Date.now(), settings: { parkingFee: s.parkingFee }, transactions };
}
export function validateBackup(d: unknown): BackupFile {
  if (typeof d !== 'object' || d === null) throw new Error('Invalid backup file.');
  const b = d as BackupFile & { settings?: { businessName?: unknown; parkingFee?: unknown }; transactions?: Array<Record<string, unknown>> };
  if ((b.version as number) !== 1 && (b.version as number) !== 2) throw new Error('Unsupported backup version.');
  if (!Number.isInteger(b.settings?.parkingFee)) throw new Error('Invalid backup settings.');
  if (!Array.isArray(b.transactions)) throw new Error('Invalid backup transactions.');
  const txs: ParkingTransaction[] = b.transactions.map(t => {
    if (!t.id || !t.plateNumber || !t.checkInAt || !['parked', 'completed'].includes(t.status as string)) throw new Error('Invalid transaction in backup.');
    return { id: t.id, plateNumber: t.plateNumber, checkInAt: t.checkInAt, checkOutAt: t.checkOutAt, fee: t.fee, status: t.status, paymentStatus: t.paymentStatus === 'paid' ? 'paid' : 'unpaid', paidAt: t.paidAt } as ParkingTransaction;
  });
  return { version: 2, exportedAt: typeof b.exportedAt === 'number' ? b.exportedAt : Date.now(), settings: { parkingFee: b.settings!.parkingFee as number }, transactions: txs };
}
export async function importBackup(data: unknown): Promise<void> {
  const b = validateBackup(data);
  await db.transaction('rw', db.transactions, db.settings, async () => {
    await db.transactions.clear();
    await db.transactions.bulkAdd(b.transactions);
    await db.settings.put({ id: 'main', ...b.settings });
  });
}
export async function clearAll(): Promise<void> {
  await db.transaction('rw', db.transactions, db.settings, async () => { await db.transactions.clear(); await db.settings.clear(); });
  await ensureSeed();
}
