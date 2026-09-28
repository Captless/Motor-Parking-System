export type ParkingStatus = 'parked' | 'completed';
export type PaymentStatus = 'unpaid' | 'paid';
export interface ParkingTransaction { id: string; plateNumber: string; checkInAt: number; checkOutAt?: number; fee: number; status: ParkingStatus; paymentStatus: PaymentStatus; paidAt?: number; }
export interface AppSettings { id: 'main'; parkingFee: number; }
export interface BackupFile { version: 2; exportedAt: number; settings: { parkingFee: number }; transactions: ParkingTransaction[]; }
export interface DailyStats { parked: number; entriesToday: number; completedToday: number; collectedToday: number; }
