import { describe, it, expect } from 'vitest'; import { groupByDay } from './history';
import type { ParkingTransaction } from '../types/parking';
const tx = (over: Partial<ParkingTransaction> & { id: string }): ParkingTransaction => ({
  plateNumber: 'A1', checkInAt: 0, fee: 20, status: 'completed', paymentStatus: 'paid', ...over,
});
describe('groupByDay', () => {
  it('groups newest-first with paid-only sums', () => {
    const day = new Date(2026, 8, 25, 12).getTime();
    const list = [
      tx({ id: '1', checkInAt: day - 3600000, checkOutAt: day, fee: 20, paymentStatus: 'paid' }),
      tx({ id: '2', checkInAt: day - 7200000, checkOutAt: day + 1000, fee: 20, paymentStatus: 'unpaid' }),
      tx({ id: '3', checkInAt: day - 90000000, checkOutAt: day - 86400000, fee: 25, paymentStatus: 'paid' }),
    ];
    const g = groupByDay(list);
    expect(g.length).toBe(2);
    expect(g[0].items.map(t => t.id)).toEqual(['1', '2']);
    expect(g[0].collected).toBe(20);
    expect(g[1].collected).toBe(25);
  });
  it('falls back to checkIn when checkOut missing, empty in', () => {
    expect(groupByDay([])).toEqual([]);
    const day = new Date(2026, 8, 25, 12).getTime();
    const g = groupByDay([tx({ id: 'x', checkInAt: day, checkOutAt: undefined })]);
    expect(g.length).toBe(1); expect(g[0].items[0].id).toBe('x');
  });
});
