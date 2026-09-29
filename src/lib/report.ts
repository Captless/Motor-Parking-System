import type { DayStats } from '../db/parkingRepository';
import type { ParkingTransaction } from '../types/parking';
import { startOfDay, formatDuration } from './dates';

const q = (v: string | number): string => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const hm = (ts: number | undefined): string => {
  if (ts == null) return '';
  const d = new Date(ts);
  const ap = d.getHours() < 12 ? 'AM' : 'PM';
  const h = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
};
const pastDay = (ts: number | undefined, day: number): boolean =>
  ts != null && startOfDay(ts) > startOfDay(day);
const stamp = (day: number): string => {
  const d = new Date(day);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const reportFilename = (day: number): string => `motor-parking-eod-${stamp(day)}.csv`;

export function dayReportCSV(day: number, stats: Pick<DayStats, 'day' | 'entries' | 'completed' | 'collected'>, txs: ParkingTransaction[]): string {
  const lines = [
    `REPORT DATE,${stamp(day)}`,
    `ENTRIES,${stats.entries}`,
    `COMPLETED,${stats.completed}`,
    `COLLECTED,${stats.collected}`,
    'NOTE,times are h:MM AM/PM; overnight=yes stayed past midnight',
    '',
    'plate,check_in,check_out,duration,fee_php,status,payment,paid_at,overnight',
    ...txs.map(t => [t.plateNumber, hm(t.checkInAt), hm(t.checkOutAt), t.checkOutAt ? formatDuration(t.checkInAt, t.checkOutAt) : '', t.fee, t.status, t.paymentStatus, hm(t.paidAt), pastDay(t.checkOutAt, day) || pastDay(t.paidAt, day) ? 'yes' : ''].map(q).join(',')),
  ];
  return `\uFEFF${lines.join('\n')}\n`;
}

export function downloadTextFile(name: string, text: string, mime: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
