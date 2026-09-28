import type { ParkingTransaction } from '../types/parking';
import { startOfDay } from './dates';
export interface DayBatch { day: number; items: ParkingTransaction[]; collected: number; }
export function groupByDay(list: ParkingTransaction[]): DayBatch[] {
  const map = new Map<number, ParkingTransaction[]>();
  for (const t of list) {
    const day = startOfDay(t.checkOutAt ?? t.checkInAt);
    const arr = map.get(day); if (arr) arr.push(t); else map.set(day, [t]);
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([day, items]) => ({ day, items, collected: items.filter(t => t.paymentStatus === 'paid').reduce((s, t) => s + t.fee, 0) }));
}
