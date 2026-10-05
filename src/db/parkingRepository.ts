import { db, ensureSeed } from './database';
import type { AppSettings, BackupFile, DailyStats, ParkingTransaction } from '../types/parking';
import { buildBusinessSnapshot, type BusinessSnapshot } from '../features/analytics/businessAnalytics';
import { normalizePlate, isValidPlate } from '../lib/validation';
import { inDay, startOfDay } from '../lib/dates';
/** Day a transaction's revenue is recognized: the first settlement, never relocated by undo/re-settle. */
export const revenueDay = (t: ParkingTransaction): number | undefined => t.firstPaidAt ?? t.paidAt;
/** One read, one aggregation pass — every Analytics surface derives from this snapshot. */
export async function getBusinessOverview(now = Date.now()): Promise<BusinessSnapshot> {
  return buildBusinessSnapshot({ txs: await db.transactions.toArray(), now });
}
export async function getActiveDays(): Promise<number[]> {
  const all = await db.transactions.toArray();
  const set = new Set<number>();
  for (const t of all) {
    set.add(startOfDay(t.checkInAt));
    if (t.checkOutAt != null) set.add(startOfDay(t.checkOutAt));
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

export async function getSettings(): Promise<AppSettings> {
  await ensureSeed();
  const raw = (await db.settings.get('main')) as AppSettings & { businessName?: unknown; openMin?: unknown; closeMin?: unknown };
  let dirty = false;
  if (!Number.isInteger(raw.parkingFee)) { raw.parkingFee = 30; dirty = true; }
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
export async function removeParked(id: string): Promise<string> {
  const tx = await db.transactions.get(id); if (!tx) throw new Error('Record not found.');
  if (tx.status !== 'parked') throw new Error('Only parked records can be removed.');
  await db.transactions.delete(id); return tx.plateNumber;
}
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
  if (payment === 'unpaid') {
    // Still-parked bikes can owe too; they sort by check-in day alongside checkouts.
    const parked = await db.transactions.where('status').equals('parked').toArray();
    const seen = new Set(list.map(t => t.id));
    list = [...list, ...parked.filter(t => !seen.has(t.id))]
      .sort((a, b) => (b.checkOutAt ?? b.checkInAt) - (a.checkOutAt ?? a.checkInAt));
  }
  const q = normalizePlate(search);
  if (q) list = list.filter(t => t.plateNumber.includes(q));
  if (payment !== 'all') list = list.filter(t => t.paymentStatus === payment);
  return list;
}
export async function getDailyStats(now = Date.now()): Promise<DailyStats> {
  const all = await db.transactions.toArray();
  const lot = all.filter(t => t.status === 'parked');
  const dayStart = startOfDay(now);
  return {
    parked: lot.length,
    entriesToday: all.filter(t => inDay(t.checkInAt, now)).length,
    completedToday: all.filter(t => inDay(t.checkOutAt, now)).length,
    collectedToday: all.filter(t => t.paymentStatus === 'paid' && inDay(revenueDay(t), now)).reduce((s, t) => s + t.fee, 0),
    collectedHeld: lot.filter(t => t.paymentStatus === 'paid' && (revenueDay(t) ?? Infinity) < dayStart).reduce((s, t) => s + t.fee, 0),
    outstanding: all.filter(t => t.paymentStatus !== 'paid' && Number.isFinite(t.fee)).reduce((s, t) => s + t.fee, 0),
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
