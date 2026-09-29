import { describe, it, expect, beforeEach } from 'vitest';
import { ParkingDB } from './database';
import * as R from './parkingRepository';
import { db } from './database';

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
  it('range analytics empty-safe with null deltas', async () => {
    const r = await R.getRangeAnalytics();
    expect(r.totalCollected).toBe(0); expect(r.revenueDeltaPct).toBeNull(); expect(r.entriesDeltaPct).toBeNull();
    expect(r.peakHour).toBeNull(); expect(r.outstanding).toEqual({ count: 0, amount: 0 });
  });
  it('day drill lists only that day checkouts', async () => {
    const a = await R.create({ plateNumber: 'D1' }); await R.checkout(a.id);
    const today = await R.getDayTransactions(Date.now());
    expect(today.find(t => t.id === a.id)).toBeTruthy();
    const old = await R.getDayTransactions(Date.now() - 86400000 * 3);
    expect(old.find(t => t.id === a.id)).toBeFalsy();
  });
  it('dashboard excludes prev-day', async () => {
    const t = await R.create({ plateNumber: 'E5' }); await R.markPaid(t.id); await R.checkout(t.id);
    const y = Date.now() - 86400000; const s = await R.getDailyStats(y); expect(s.collectedToday).toBe(0);
    void ParkingDB;
  });
});
