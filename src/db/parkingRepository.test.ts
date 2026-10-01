import { describe, it, expect, beforeEach } from 'vitest';
import { ParkingDB } from './database';
import * as R from './parkingRepository';
import { db } from './database';
import { startOfDay } from '../lib/dates';

describe('parking', () => {
  beforeEach(async () => { await db.delete(); await db.open(); await db.settings.put({ id: 'main', parkingFee: 20 }); });
  it('creates unpaid active tx with fee snapshot, no customer name', async () => { const t = await R.create({ plateNumber: ' abc 1234 ' }); expect(t.plateNumber).toBe('ABC 1234'); expect(t.status).toBe('parked'); expect(t.paymentStatus).toBe('unpaid'); expect(t.fee).toBe(20); expect('customerName' in t).toBe(false); });
  it('requires plate', async () => { await expect(R.create({ plateNumber: '   ' })).rejects.toThrow(); });
  it('rejects duplicate active plate', async () => { await R.create({ plateNumber: 'ABC 1' }); await expect(R.create({ plateNumber: 'abc 1' })).rejects.toThrow('already parked'); });
  it('markPaid while parked, checkout preserves it, unpaid excluded from revenue', async () => {
    const a = await R.create({ plateNumber: 'A1' }); const b = await R.create({ plateNumber: 'B2' });
    await R.markPaid(a.id);
    expect((await R.getById(a.id))?.paymentStatus).toBe('paid');
    await R.checkout(a.id); await R.checkout(b.id);
    const s = await R.getDailyStats(); expect(s.collectedToday).toBe(20); expect(s.completedToday).toBe(2);
    const h = await R.getHistory(); expect(h.find(t => t.id === b.id)?.paymentStatus).toBe('unpaid');
  });
  it('settle after checkout: markPaid on completed attributes revenue to settle day', async () => {
    const t = await R.create({ plateNumber: 'C9' }); await R.checkout(t.id);
    expect((await R.getDailyStats()).collectedToday).toBe(0);
    const s = await R.markPaid(t.id);
    expect(s.status).toBe('completed'); expect(s.paymentStatus).toBe('paid'); expect(s.paidAt).toBeDefined();
    expect((await R.getDailyStats()).collectedToday).toBe(20);
    await R.markUnpaid(t.id);
    expect((await R.getById(t.id))?.paymentStatus).toBe('unpaid');
    await expect(R.checkout(t.id)).rejects.toThrow();
  });
  it('fee snapshot survives setting change', async () => { const t = await R.create({ plateNumber: 'C3' }); await R.updateSettings({ parkingFee: 25 }); expect((await R.getById(t.id))?.fee).toBe(20); });
  it('fresh install defaults fee to 30', async () => {
    await db.settings.clear();
    expect((await R.getSettings()).parkingFee).toBe(30);
  });
  it('settings default fee and ignore legacy lot-hours backup', async () => {
    const s = await R.getSettings();
    expect(s.parkingFee).toBe(20);
    const b = await R.exportBackup();
    expect(b.settings).toEqual({ parkingFee: 20 });
    const legacy = { version: 1, exportedAt: 0, settings: { parkingFee: 20, openMin: 360, closeMin: 1350 }, transactions: [] };
    await R.importBackup(legacy);
    expect((await R.getSettings()).parkingFee).toBe(20);
  });
  it('renamePlate fixes typos with normalization', async () => {
    const t = await R.create({ plateNumber: 'ABC 1' });
    const r = await R.renamePlate(t.id, ' abx  12 ');
    expect(r.plateNumber).toBe('ABX 12');
  });
  it('renamePlate no-ops on self case-variant, rejects other dupe + bad input', async () => {
    const a = await R.create({ plateNumber: 'AAA 1' }); await R.create({ plateNumber: 'BBB 2' });
    await expect(R.renamePlate(a.id, 'aaa 1')).resolves.toMatchObject({ plateNumber: 'AAA 1' });
    await expect(R.renamePlate(a.id, 'bbb 2')).rejects.toThrow('already parked');
    await expect(R.renamePlate(a.id, '   ')).rejects.toThrow();
    await R.checkout(a.id);
    await expect(R.renamePlate(a.id, 'CCC 3')).rejects.toThrow();
  });
  it('removeParked deletes parked, rejects completed and missing', async () => {
    const t = await R.create({ plateNumber: 'DEL 1' });
    expect(await R.removeParked(t.id)).toBe('DEL 1');
    expect(await R.getById(t.id)).toBeUndefined();
    expect((await R.getActive()).length).toBe(0);
    await expect(R.removeParked(t.id)).rejects.toThrow('Record not found');
    const c = await R.create({ plateNumber: 'DEL 2' }); await R.checkout(c.id);
    await expect(R.removeParked(c.id)).rejects.toThrow('Only parked records');
  });
  it('backup v2 roundtrip, v1 legacy migrates, reject bad', async () => {
    await R.create({ plateNumber: 'D4' }); const b = await R.exportBackup(); expect(b.version).toBe(2);
    await R.clearAll(); expect((await R.getActive()).length).toBe(0);
    await R.importBackup(b); expect((await R.getActive()).length).toBe(1);
    const legacy = { version: 1, exportedAt: 0, settings: { businessName: 'Old', parkingFee: 20 }, transactions: [{ id: 'x1', plateNumber: 'Z9', customerName: 'Bob', checkInAt: Date.now(), fee: 20, status: 'parked', paymentStatus: 'unpaid' }] };
    await R.importBackup(legacy); const got = await R.getById('x1'); expect(got?.plateNumber).toBe('Z9'); expect('customerName' in (got ?? {})).toBe(false);
    await expect(R.importBackup({ bad: 1 })).rejects.toThrow();
    await expect(R.importBackup({ ...b, version: 99 })).rejects.toThrow();
  });
  it('week stats bucket paid-only revenue, zero-fill empty days', async () => {
    const a = await R.create({ plateNumber: 'W1' }); await R.markPaid(a.id); await R.checkout(a.id);
    const w = await R.getWeekStats();
    expect(w.length).toBe(7);
    expect(w[6].collected).toBe(20); expect(w[6].entries).toBe(1); expect(w[6].completed).toBe(1);
    expect(w.slice(0, 6).every(d => d.collected === 0 && d.entries === 0)).toBe(true);
    const tot = w.reduce((s, d) => s + d.collected, 0);
    expect(tot).toBe((await R.getDailyStats()).collectedToday);
  });
  it('range analytics: WoW deltas, peak hour, outstanding', async () => {
    const now = Date.now();
    const mk = (plate: string, inAt: number, outAt: number | undefined, fee: number, pay: boolean, parked = false) =>
      db.transactions.add({ id: plate, plateNumber: plate, checkInAt: inAt, checkOutAt: outAt, fee, status: parked ? 'parked' : 'completed', paymentStatus: pay ? 'paid' : 'unpaid', paidAt: pay && outAt ? outAt : undefined });
    const at = (dayOff: number, h: number) => { const d = new Date(now - dayOff * 86400000); d.setHours(h, 10, 0, 0); return d.getTime(); };
    await mk('C1', at(0, 8), at(0, 10), 20, true);
    await mk('C2', at(0, 8), at(0, 11), 30, true);
    await mk('C3', at(0, 9), at(0, 12), 20, false);
    await mk('P1', at(8, 8), at(8, 10), 20, true);
    await mk('O1', now - 3600000, undefined, 20, false, true);
    const r = await R.getRangeAnalytics(now);
    expect(r.totalCollected).toBe(50);
    expect(r.prevCollected).toBe(20);
    expect(r.revenueDeltaPct).toBe(150);
    expect(r.entriesDeltaPct).toBe(300);
    expect(r.prevDailyAvg).toBe(Math.round(20 / 7));
    expect(r.peakHour).toEqual({ hour: 8, count: 2 });
    expect(r.outstanding).toEqual({ count: 2, amount: 40 });
  });
  it('day buckets + range summary scope to range', async () => {
    const now = Date.now();
    const at = (dayOff: number, h: number) => { const d = new Date(now - dayOff * 86400000); d.setHours(h, 10, 0, 0); return d.getTime(); };
    await db.transactions.add({ id: 'B1', plateNumber: 'B1', checkInAt: at(1, 8), checkOutAt: at(1, 9), fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: at(1, 9) });
    await db.transactions.add({ id: 'B2', plateNumber: 'B2', checkInAt: at(9, 8), checkOutAt: at(9, 9), fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: at(9, 9) });
    const buckets = await R.getDayBuckets(now - 2 * 86400000, now);
    expect(buckets.length).toBe(3);
    expect(buckets[1].collected).toBe(20); expect(buckets[0].collected).toBe(0); expect(buckets[2].collected).toBe(0);
    const s = await R.getRangeSummary(now - 2 * 86400000, now);
    expect(s.totalCollected).toBe(20); expect(s.totalEntries).toBe(1);
    expect(s.peakHour).toEqual({ hour: 8, count: 1 });
    expect(s.outstanding).toEqual({ count: 0, amount: 0 });
    const old = await R.getRangeSummary(now - 10 * 86400000, now - 8 * 86400000);
    expect(old.totalCollected).toBe(20); expect(old.totalEntries).toBe(1);
  });
  it('range analytics empty-safe with null deltas', async () => {
    const r = await R.getRangeAnalytics();
    expect(r.totalCollected).toBe(0); expect(r.revenueDeltaPct).toBeNull(); expect(r.entriesDeltaPct).toBeNull();
    expect(r.peakHour).toBeNull(); expect(r.outstanding).toEqual({ count: 0, amount: 0 });
  });
  it('buckets count completed-unpaid per checkout day only', async () => {
    const now = Date.now();
    const at = (dayOff: number, h: number) => { const d = new Date(now - dayOff * 86400000); d.setHours(h, 10, 0, 0); return d.getTime(); };
    await db.transactions.add({ id: 'U1', plateNumber: 'U1', checkInAt: at(1, 8), checkOutAt: at(1, 9), fee: 20, status: 'completed', paymentStatus: 'unpaid' });
    await db.transactions.add({ id: 'U2', plateNumber: 'U2', checkInAt: at(1, 8), checkOutAt: at(1, 10), fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: at(1, 10) });
    await db.transactions.add({ id: 'U3', plateNumber: 'U3', checkInAt: at(0, 8), fee: 20, status: 'parked', paymentStatus: 'unpaid' });
    const buckets = await R.getDayBuckets(now - 1 * 86400000, now);
    expect(buckets[0].unpaid).toBe(1);
    expect(buckets[1].unpaid).toBe(0);
  });
  it('re-settle is a no-op: paidAt frozen, revenue stable', async () => {
    const t = await R.create({ plateNumber: 'NS1' }); await R.checkout(t.id);
    const first = await R.markPaid(t.id);
    const second = await R.markPaid(t.id);
    expect(second.paidAt).toBe(first.paidAt);
    expect((await R.getDailyStats()).collectedToday).toBe(20);
  });
  it('undo then settle moves revenue exactly once', async () => {
    const t = await R.create({ plateNumber: 'NS2' }); await R.checkout(t.id);
    await R.markPaid(t.id); await R.markUnpaid(t.id);
    expect((await R.getDailyStats()).collectedToday).toBe(0);
    await R.markPaid(t.id);
    expect((await R.getDailyStats()).collectedToday).toBe(20);
  });
  it('cross-day undo-settle cannot relocate revenue to today', async () => {
    const now = Date.now();
    const yest = (h: number) => { const d = new Date(now - 86400000); d.setHours(h, 10, 0, 0); return d.getTime(); };
    await db.transactions.add({ id: 'X1', plateNumber: 'X1', checkInAt: yest(8), checkOutAt: yest(9), fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: yest(9), firstPaidAt: yest(9) });
    expect((await R.getDailyStats(now)).collectedToday).toBe(0);
    await R.markUnpaid('X1');
    const re = await R.markPaid('X1');
    expect(re.firstPaidAt).toBe(yest(9));
    expect((await R.getDailyStats(now)).collectedToday).toBe(0);
    expect((await R.getDailyStats(yest(12))).collectedToday).toBe(20);
  });
  it('first-time settle still credits the settle day', async () => {
    const t = await R.create({ plateNumber: 'FS1' }); await R.checkout(t.id);
    const s = await R.markPaid(t.id);
    expect(s.firstPaidAt).toBe(s.paidAt);
    expect((await R.getDailyStats()).collectedToday).toBe(20);
  });
  it('legacy rows without firstPaidAt fall back to paidAt, backup preserves the field', async () => {
    const now = Date.now();
    await db.transactions.add({ id: 'L1', plateNumber: 'L1', checkInAt: now - 3600000, checkOutAt: now - 1800000, fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: now - 1800000 });
    expect((await R.getDailyStats()).collectedToday).toBe(20);
    const b = await R.exportBackup();
    expect(b.transactions.find(t => t.id === 'L1')?.paidAt).toBeDefined();
    await R.clearAll();
    await R.importBackup(b);
    expect((await R.getById('L1'))?.paymentStatus).toBe('paid');
  });
  it('settle then unsettle round-trips revenue to zero', async () => {
    const t = await R.create({ plateNumber: 'RT1' }); await R.checkout(t.id);
    await R.markPaid(t.id);
    expect((await R.getDailyStats()).collectedToday).toBe(20);
    await R.markUnpaid(t.id);
    expect((await R.getById(t.id))?.paymentStatus).toBe('unpaid');
    expect((await R.getDailyStats()).collectedToday).toBe(0);
  });
  it('getDayRecords unions completed + open entries without dupes', async () => {
    const now = Date.now();
    const at = (dayOff: number, h: number) => { const d = new Date(now - dayOff * 86400000); d.setHours(h, 10, 0, 0); return d.getTime(); };
    await db.transactions.add({ id: 'W1', plateNumber: 'W1', checkInAt: at(0, 8), checkOutAt: at(0, 9), fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: at(0, 9) });
    await db.transactions.add({ id: 'W2', plateNumber: 'W2', checkInAt: at(0, 8), fee: 20, status: 'parked', paymentStatus: 'unpaid' });
    await db.transactions.add({ id: 'W3', plateNumber: 'W3', checkInAt: at(3, 8), checkOutAt: at(3, 9), fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: at(3, 9) });
    const rows = await R.getDayRecords(now);
    expect(rows.map(t => t.id).sort()).toEqual(['W1', 'W2']);
  });
  it('getActiveDays lists distinct days newest-first', async () => {
    const now = Date.now();
    const at = (dayOff: number, h: number) => { const d = new Date(now - dayOff * 86400000); d.setHours(h, 10, 0, 0); return d.getTime(); };
    await db.transactions.add({ id: 'G1', plateNumber: 'G1', checkInAt: at(2, 8), checkOutAt: at(0, 9), fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: at(0, 9) });
    await db.transactions.add({ id: 'G2', plateNumber: 'G2', checkInAt: at(0, 8), fee: 20, status: 'parked', paymentStatus: 'unpaid' });
    const days = await R.getActiveDays();
    expect(days.length).toBe(2);
    expect(days[0] > days[1]).toBe(true);
  });
  it('paid-after-checkout never lists a day with no lot activity', async () => {
    const now = Date.now();
    const at = (dayOff: number, h: number) => { const d = new Date(now - dayOff * 86400000); d.setHours(h, 10, 0, 0); return d.getTime(); };
    await db.transactions.add({ id: 'P1', plateNumber: 'P1', checkInAt: at(3, 8), checkOutAt: at(3, 9), fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: at(0, 9), firstPaidAt: at(0, 9) });
    const today = startOfDay(now);
    expect((await R.getActiveDays()).includes(today)).toBe(false);
    expect(await R.getDayRecords(today)).toEqual([]);
    const checkoutDay = startOfDay(at(3, 9));
    expect((await R.getActiveDays()).includes(checkoutDay)).toBe(true);
    expect((await R.getDayRecords(checkoutDay)).map(t => t.id)).toEqual(['P1']);
  });
  it('day drill lists only that day checkouts', async () => {
    const a = await R.create({ plateNumber: 'D1' }); await R.checkout(a.id);
    const today = await R.getDayTransactions(Date.now());
    expect(today.find(t => t.id === a.id)).toBeTruthy();
    const old = await R.getDayTransactions(Date.now() - 86400000 * 3);
    expect(old.find(t => t.id === a.id)).toBeFalsy();
  });
  it('collectedHeld carries overnight parked-paid, never double-counts', async () => {
    const now = Date.now();
    const at = (dayOff: number, h: number) => { const d = new Date(now - dayOff * 86400000); d.setHours(h, 10, 0, 0); return d.getTime(); };
    await db.transactions.add({ id: 'H1', plateNumber: 'H1', checkInAt: at(1, 8), fee: 20, status: 'parked', paymentStatus: 'paid', paidAt: at(1, 9), firstPaidAt: at(1, 9) });
    await db.transactions.add({ id: 'H2', plateNumber: 'H2', checkInAt: at(0, 8), checkOutAt: at(0, 9), fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: at(0, 9), firstPaidAt: at(0, 9) });
    await db.transactions.add({ id: 'H3', plateNumber: 'H3', checkInAt: at(0, 7), fee: 20, status: 'parked', paymentStatus: 'paid', paidAt: at(0, 8), firstPaidAt: at(0, 8) });
    await db.transactions.add({ id: 'H4', plateNumber: 'H4', checkInAt: at(0, 7), fee: 20, status: 'parked', paymentStatus: 'unpaid' });
    const s = await R.getDailyStats(now);
    expect(s.collectedToday).toBe(40);
    expect(s.collectedHeld).toBe(20);
    await R.markUnpaid('H1');
    expect((await R.getDailyStats(now)).collectedHeld).toBe(0);
  });
  it('yesterday-paid checkout-today leaves today clean', async () => {
    const now = Date.now();
    const at = (dayOff: number, h: number) => { const d = new Date(now - dayOff * 86400000); d.setHours(h, 10, 0, 0); return d.getTime(); };
    await db.transactions.add({ id: 'C1', plateNumber: 'C1', checkInAt: at(1, 8), checkOutAt: at(0, 9), fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: at(1, 9), firstPaidAt: at(1, 9) });
    const s = await R.getDailyStats(now);
    expect(s.collectedToday).toBe(0); expect(s.collectedHeld).toBe(0);
    expect((await R.getDailyStats(at(1, 12))).collectedToday).toBe(20);
  });
  it('dashboard excludes prev-day', async () => {
    const t = await R.create({ plateNumber: 'E5' }); await R.markPaid(t.id); await R.checkout(t.id);
    const y = Date.now() - 86400000; const s = await R.getDailyStats(y); expect(s.collectedToday).toBe(0);
    void ParkingDB;
  });
});
