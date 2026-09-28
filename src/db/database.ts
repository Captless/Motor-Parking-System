import Dexie, { type Table } from 'dexie';
import type { ParkingTransaction, AppSettings } from '../types/parking';
export class ParkingDB extends Dexie {
  transactions!: Table<ParkingTransaction, string>;
  settings!: Table<AppSettings, string>;
  constructor(name = 'motor-parking') { super(name); this.version(1).stores({ transactions: 'id,status,plateNumber,checkInAt,checkOutAt,paidAt', settings: 'id' }); }
}
export const db = new ParkingDB();
export async function ensureSeed(): Promise<void> {
  const s = await db.settings.get('main');
  if (!s) await db.settings.put({ id: 'main', parkingFee: 20 });
}
