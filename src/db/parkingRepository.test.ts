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
  it('markPaid on completed throws, double checkout throws', async () => {
    const t = await R.create({ plateNumber: 'C9' }); await R.checkout(t.id);
    await expect(R.markPaid(t.id)).rejects.toThrow();
    await expect(R.checkout(t.id)).rejects.toThrow();
  });
  it('fee snapshot survives setting change', async () => { const t = await R.create({ plateNumber: 'C3' }); await R.updateSettings({ parkingFee: 25 }); expect((await R.getById(t.id))?.fee).toBe(20); });
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
  it('range analytics aggregates correctly', async () => {
    const now = Date.now();
    const mk = (plate: string, inOff: number, outOff: number, fee: number, pay: boolean) =>
      db.transactions.add({ id: plate, plateNumber: plate, checkInAt: now - inOff, checkOutAt: now - outOff, fee, status: 'completed', paymentStatus: pay ? 'paid' : 'unpaid', paidAt: pay ? now - outOff : undefined });
    await mk('R1', 7200000, 3600000, 20, true);
    await mk('R2', 10800000, 7200000, 30, true);
    await mk('R3', 14400000, 10800000, 20, false);
    const r = await R.getRangeAnalytics(now);
    expect(r.totalCollected).toBe(50);
    expect(r.avgPerDay).toBe(Math.round(50 / 7));
    expect(r.paidRate).toBeCloseTo(2 / 3);
    expect(r.avgStayMin).toBe(60);
    expect(r.totalEntries + r.totalCompleted >= 3).toBe(true);
    expect(r.bestDay.collected >= r.worstDay.collected).toBe(true);
  });
  it('range analytics empty-safe', async () => {
    const r = await R.getRangeAnalytics();
    expect(r.totalCollected).toBe(0); expect(r.paidRate).toBe(0); expect(r.avgStayMin).toBe(0);
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
