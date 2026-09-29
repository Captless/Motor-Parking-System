import { describe, it, expect } from 'vitest'; import { dayReportCSV, reportFilename, backupFilename } from './report';
import type { ParkingTransaction } from '../types/parking';
const tx = (over: Partial<ParkingTransaction> & { id: string }): ParkingTransaction => ({
  plateNumber: 'A1', checkInAt: 0, fee: 20, status: 'completed', paymentStatus: 'paid', ...over,
});
describe('dayReportCSV', () => {
  it('has BOM, summary, header and rows', () => {
    const day = new Date(2026, 8, 23, 12).getTime();
    const csv = dayReportCSV(day, { day, entries: 2, completed: 1, collected: 20 }, [
      tx({ id: '1', plateNumber: 'ABC 1', checkInAt: day, checkOutAt: day + 3600000, paidAt: day + 3600000 }),
      tx({ id: '2', plateNumber: 'XYZ 2', checkInAt: day, checkOutAt: undefined, fee: 20, status: 'completed', paymentStatus: 'unpaid', paidAt: undefined }),
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('REPORT DATE,2026-09-23');
    expect(csv).toContain('COLLECTED,20');
    expect(csv).toContain('plate,check_in,check_out,duration,fee_php,status,payment,paid_at,overnight');
    expect(csv).toContain('NOTE,times are h:MM AM/PM; overnight=yes stayed past midnight');
    expect(csv).toContain('ABC 1,12:00 PM,1:00 PM');
  });
  it('quotes commas/quotes and leaves missing times empty', () => {
    const day = new Date(2026, 8, 23, 12).getTime();
    const csv = dayReportCSV(day, { day, entries: 1, completed: 1, collected: 0 }, [
      tx({ id: 'x', plateNumber: 'A"B,C', checkInAt: day, checkOutAt: undefined, paymentStatus: 'unpaid', paidAt: undefined }),
    ]);
    expect(csv).toContain('"A""B,C"');
    const row = csv.split('\n').find(l => l.includes('A""B'));
    expect(row!.endsWith(',')).toBe(true);
  });
  it('duration accumulates past 24h, blank when still parked', () => {
    const day = new Date(2026, 8, 23, 12).getTime();
    const csv = dayReportCSV(day, { day, entries: 2, completed: 1, collected: 20 }, [
      tx({ id: 'm', plateNumber: 'M1', checkInAt: new Date(2026, 8, 21, 10, 0).getTime(), checkOutAt: new Date(2026, 8, 23, 12, 30).getTime(), fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: new Date(2026, 8, 23, 12, 30).getTime() }),
      tx({ id: 'o', plateNumber: 'O1', checkInAt: day, checkOutAt: undefined, fee: 20, status: 'parked', paymentStatus: 'unpaid', paidAt: undefined }),
    ]);
    const multi = csv.split('\n').find(l => l.startsWith('M1'))!;
    expect(multi).toContain('50h 30m');
    const open = csv.split('\n').find(l => l.startsWith('O1'))!;
    expect(open).toContain(',,');
  });
  it('filename shape carries date + time', () => {
    expect(reportFilename(new Date(2026, 8, 23, 12).getTime(), new Date(2026, 8, 23, 15, 4).getTime())).toBe('motor-parking-eod-2026-09-23-1504.csv');
    expect(backupFilename(new Date(2026, 8, 23, 9, 5).getTime())).toBe('motor-parking-backup-2026-09-23-0905.json');
  });
  it('times read AM/PM and overnight rows are flagged', () => {
    const day = new Date(2026, 8, 23, 12).getTime();
    const late = new Date(2026, 8, 23, 23, 10).getTime();
    const next = new Date(2026, 8, 24, 7, 20).getTime();
    const noon = new Date(2026, 8, 23, 14, 32).getTime();
    const csv = dayReportCSV(day, { day, entries: 2, completed: 2, collected: 40 }, [
      tx({ id: 'n', plateNumber: 'N1', checkInAt: late, checkOutAt: next, fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: next }),
      tx({ id: 'd', plateNumber: 'D1', checkInAt: noon, checkOutAt: noon + 3600000, fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: noon + 3600000 }),
    ]);
    const over = csv.split('\n').find(l => l.startsWith('N1'))!;
    expect(over).toContain('11:10 PM'); expect(over).toContain('7:20 AM'); expect(over.endsWith(',yes')).toBe(true);
    expect(over).not.toContain('+1d'); expect(over).not.toContain('2026-09-2');
    const same = csv.split('\n').find(l => l.startsWith('D1'))!;
    expect(same).toContain('2:32 PM'); expect(same.endsWith(',')).toBe(true);
  });
  it('settle-next-day flags overnight via paid_at alone', () => {
    const day = new Date(2026, 8, 23, 12).getTime();
    const csv = dayReportCSV(day, { day, entries: 1, completed: 1, collected: 0 }, [
      tx({ id: 's', plateNumber: 'S1', checkInAt: new Date(2026, 8, 23, 10, 0).getTime(), checkOutAt: new Date(2026, 8, 23, 12, 0).getTime(), fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: new Date(2026, 8, 24, 9, 0).getTime() }),
    ]);
    const row = csv.split('\n').find(l => l.startsWith('S1'))!;
    expect(row).toContain('9:00 AM'); expect(row.endsWith(',yes')).toBe(true);
  });
});
