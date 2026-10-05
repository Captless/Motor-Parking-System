import { describe, it, expect } from 'vitest'; import { dayReportCSV, dayReportHTML, dayReportTXT, reportFilename, backupFilename, summarizeDay, coverageLabel, activityLabel, isLiveDay } from './report';
import type { ParkingTransaction } from '../types/parking';
const tx = (over: Partial<ParkingTransaction> & { id: string }): ParkingTransaction => ({
  plateNumber: 'A1', checkInAt: 0, fee: 20, status: 'completed', paymentStatus: 'paid', ...over,
});
describe('dayReportCSV', () => {
  it('has BOM, summary, header and rows', () => {
    const day = new Date(2026, 8, 23, 12).getTime();
    const csv = dayReportCSV(day, [
      tx({ id: '1', plateNumber: 'ABC 1', checkInAt: day, checkOutAt: day + 3600000, paidAt: day + 3600000 }),
      tx({ id: '2', plateNumber: 'XYZ 2', checkInAt: day, checkOutAt: undefined, fee: 20, status: 'completed', paymentStatus: 'unpaid', paidAt: undefined }),
    ], day);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('REPORT DATE,2026-09-23');
    expect(csv).toContain('TOTAL ENTRIES,2');
    expect(csv).toContain('COLLECTED,20');
    expect(csv).toContain('UNPAID,1 bikes · ₱20');
    expect(csv).toContain('plate,check_in,check_out,duration,fee_php,status,payment,paid_at,overnight');
    expect(csv).toContain('NOTE,ongoing snapshot');
    expect(csv).toContain('ABC 1,12:00 PM,1:00 PM');
  });
  it('labels today ongoing and past days daily, with coverage + activity', () => {
    const day = new Date(2026, 8, 23, 12).getTime();
    const rows = [
      tx({ id: '1', plateNumber: 'A1', checkInAt: new Date(2026, 8, 23, 6, 4).getTime(), checkOutAt: new Date(2026, 8, 23, 22, 42).getTime(), paidAt: new Date(2026, 8, 23, 22, 42).getTime() }),
    ];
    expect(isLiveDay(day, day)).toBe(true);
    expect(isLiveDay(new Date(2026, 8, 22, 8).getTime(), day)).toBe(false);
    expect(coverageLabel(day)).toContain('12:00 AM - 11:59 PM');
    expect(activityLabel(day, rows, day)).toContain('6:04 AM');
    expect(activityLabel(day, rows, day)).toContain('10:42 PM');
    expect(activityLabel(day, [], day)).toBe('No activity recorded');
    const liveCSV = dayReportCSV(day, rows, day);
    expect(liveCSV).toContain('NOTE,ongoing snapshot');
    expect(liveCSV).toContain('COVERAGE,');
    expect(liveCSV).toContain('ACTIVITY,');
    const pastCSV = dayReportCSV(new Date(2026, 8, 22, 12).getTime(), rows, day);
    expect(pastCSV).not.toContain('ongoing snapshot');
    expect(pastCSV).toContain('COVERAGE,');
    const liveHTML = dayReportHTML(day, rows, day);
    expect(liveHTML).toContain('Ongoing snapshot');
    const pastHTML = dayReportHTML(new Date(2026, 8, 22, 12).getTime(), rows, day);
    expect(pastHTML).toContain('Daily report');
    expect(pastHTML).not.toContain('Ongoing snapshot');
    const pastTXT = dayReportTXT(new Date(2026, 8, 22, 12).getTime(), rows, day);
    expect(pastTXT).toContain('Final daily report');
    expect(pastTXT).toContain('Covers ');
    expect(pastTXT).toContain('Activity: ');
  });
  it('marks still-parked rows ongoing only for today', () => {
    const day = new Date(2026, 8, 23, 12).getTime();
    const rows = [tx({ id: 'o', plateNumber: 'O1', checkInAt: new Date(2026, 8, 23, 7, 0).getTime(), checkOutAt: undefined, fee: 20, status: 'parked', paymentStatus: 'unpaid', paidAt: undefined })];
    expect(activityLabel(day, rows, day)).toContain('ongoing');
    expect(activityLabel(new Date(2026, 8, 22, 12).getTime(), rows, day)).not.toContain('ongoing');
  });
  it('quotes commas/quotes and leaves missing times empty', () => {
    const day = new Date(2026, 8, 23, 12).getTime();
    const csv = dayReportCSV(day, [
      tx({ id: 'x', plateNumber: 'A"B,C', checkInAt: day, checkOutAt: undefined, paymentStatus: 'unpaid', paidAt: undefined }),
    ]);
    expect(csv).toContain('"A""B,C"');
    const row = csv.split('\n').find(l => l.includes('A""B'));
    expect(row!.endsWith(',')).toBe(true);
  });
  it('duration accumulates past 24h, blank when still parked', () => {
    const day = new Date(2026, 8, 23, 12).getTime();
    const csv = dayReportCSV(day, [
      tx({ id: 'm', plateNumber: 'M1', checkInAt: new Date(2026, 8, 21, 10, 0).getTime(), checkOutAt: new Date(2026, 8, 23, 12, 30).getTime(), fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: new Date(2026, 8, 23, 12, 30).getTime() }),
      tx({ id: 'o', plateNumber: 'O1', checkInAt: day, checkOutAt: undefined, fee: 20, status: 'parked', paymentStatus: 'unpaid', paidAt: undefined }),
    ]);
    const multi = csv.split('\n').find(l => l.startsWith('M1'))!;
    expect(multi).toContain('50h 30m');
    const open = csv.split('\n').find(l => l.startsWith('O1'))!;
    expect(open).toContain(',,');
  });
  it('filename shape carries date + time + ext', () => {
    expect(reportFilename(new Date(2026, 8, 23, 12).getTime(), 'csv', new Date(2026, 8, 23, 15, 4).getTime())).toBe('motor-parking-daily-2026-09-23-1504.csv');
    expect(reportFilename(new Date(2026, 8, 23, 12).getTime(), 'html')).toMatch(/\.html$/);
    expect(reportFilename(new Date(2026, 8, 23, 12).getTime(), 'txt')).toMatch(/\.txt$/);
    expect(backupFilename(new Date(2026, 8, 23, 9, 5).getTime())).toBe('motor-parking-backup-2026-09-23-0905.json');
  });
  it('HTML is self-contained with summary + rows', () => {
    const day = new Date(2026, 8, 23, 12).getTime();
    const h = dayReportHTML(day, [
      tx({ id: 'h', plateNumber: '<B>&"1', checkInAt: day, checkOutAt: day + 3600000, fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: day + 3600000 }),
      tx({ id: 'u', plateNumber: 'U9', checkInAt: day, checkOutAt: day + 7200000, fee: 20, status: 'completed', paymentStatus: 'unpaid', paidAt: undefined }),
    ]);
    expect(h).toContain('<!doctype html>'); expect(h).toContain('<style>');
    expect(h).not.toMatch(/https?:\/\//);
    expect(h).toContain('&lt;B&gt;&amp;"1'); expect(h).toContain('₱20');
    expect(h).toContain('total entries'); expect(h).toContain('unpaid');
    expect(h).toContain('class="unpaidrow"');
  });
  it('TXT splits paid/unpaid with plain summary + durations', () => {
    const day = new Date(2026, 8, 23, 12).getTime();
    const t = dayReportTXT(day, [
      tx({ id: 'n', plateNumber: 'ABC 1', checkInAt: day, checkOutAt: day + 3600000, fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: day + 3600000 }),
      tx({ id: 'u', plateNumber: 'XYZ 2', checkInAt: day, checkOutAt: undefined, fee: 20, status: 'parked', paymentStatus: 'unpaid', paidAt: undefined }),
    ], day);
    expect(t).toContain('MOTOR PARKING');
    expect(t).toContain('Daily Report -');
    expect(t).toContain('MONEY');
    expect(t).toContain('Total entries: 2'); expect(t).toContain('Collected: P20 (1 paid)'); expect(t).toContain('Unpaid: P20 (1 bikes');
    expect(t).toContain('PAID (1)'); expect(t).toContain('UNPAID - NEEDS FOLLOW-UP (1)');
    expect(t).toContain('1. ABC 1 - Paid - P20');
    expect(t).toContain('   In 12:00 PM, Out 1:00 PM (1h 0m)');
    expect(t).toContain('1. XYZ 2 - Unpaid - P20');
    expect(t).toContain('   In 12:00 PM, Still parked');
    expect(t).toContain('Ongoing snapshot');
  });
  it('TXT handles all-settled and empty days', () => {
    const day = new Date(2026, 8, 23, 12).getTime();
    const settled = dayReportTXT(day, [
      tx({ id: 'n', plateNumber: 'ABC 1', checkInAt: day, checkOutAt: day + 3600000, fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: day + 3600000 }),
    ]);
    expect(settled).toContain('Unpaid: P0 (all settled)');
    expect(settled).toContain('None - all settled.');
    const empty = dayReportTXT(day, [], day);
    expect(empty).toContain('Total entries: 0');
    expect(empty).toContain('No activity recorded');
    expect(empty).toContain('PAID (0)');
  });
  it('TXT stays pure ASCII so any viewer decodes it identically', () => {
    const day = new Date(2026, 8, 23, 12).getTime();
    const t = dayReportTXT(day, [
      tx({ id: 'n', plateNumber: 'ABC 1', checkInAt: day, checkOutAt: day + 86400000, fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: day + 86400000 }),
      tx({ id: 'u', plateNumber: 'XYZ 2', checkInAt: day, checkOutAt: undefined, fee: 20, status: 'parked', paymentStatus: 'unpaid', paidAt: undefined }),
    ], day);
    expect(t).toMatch(/^[\x00-\x7F]*$/);
    expect(t).toContain(' - overnight');
  });
  it('times read AM/PM and overnight rows are flagged', () => {
    const day = new Date(2026, 8, 23, 12).getTime();
    const late = new Date(2026, 8, 23, 23, 10).getTime();
    const next = new Date(2026, 8, 24, 7, 20).getTime();
    const noon = new Date(2026, 8, 23, 14, 32).getTime();
    const csv = dayReportCSV(day, [
      tx({ id: 'n', plateNumber: 'N1', checkInAt: late, checkOutAt: next, fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: next }),
      tx({ id: 'd', plateNumber: 'D1', checkInAt: noon, checkOutAt: noon + 3600000, fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: noon + 3600000 }),
    ]);
    const over = csv.split('\n').find(l => l.startsWith('N1'))!;
    expect(over).toContain('11:10 PM'); expect(over).toContain('7:20 AM'); expect(over.endsWith(',yes')).toBe(true);
    expect(over).not.toContain('+1d'); expect(over).not.toContain('2026-09-2');
    const same = csv.split('\n').find(l => l.startsWith('D1'))!;
    expect(same).toContain('2:32 PM'); expect(same.endsWith(',')).toBe(true);
  });
  it('coverage states lot scope and TXT points revenue at Overview', () => {
    const day = new Date(2026, 8, 23, 12).getTime();
    expect(coverageLabel(day)).toBe('Covers SEP 23, 12:00 AM - 11:59 PM - entries and checkouts that day');
    const t = dayReportTXT(day, [
      tx({ id: 'n', plateNumber: 'ABC 1', checkInAt: day, checkOutAt: day + 3600000, fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: day + 3600000 }),
    ], day);
    expect(t).toContain('entries and checkouts that day');
    expect(t).toContain('Money is credited to the day it was paid. See Overview for revenue by day.');
    expect(dayReportCSV(day, [])).toContain('COVERAGE,Covers SEP 23, 12:00 AM - 11:59 PM - entries and checkouts that day');
  });
  it('CSV carries a BOM so spreadsheet apps decode the peso sign', () => {
    const day = new Date(2026, 8, 23, 12).getTime();
    expect(dayReportCSV(day, []).charCodeAt(0)).toBe(0xFEFF);
  });
  it('summarizeDay foots with its own rows', () => {
    const s = summarizeDay([
      tx({ id: 'a', plateNumber: 'A', fee: 20, paymentStatus: 'paid' }),
      tx({ id: 'b', plateNumber: 'B', fee: 30, paymentStatus: 'paid' }),
      tx({ id: 'c', plateNumber: 'C', fee: 20, paymentStatus: 'unpaid' }),
    ]);
    expect(s).toEqual({ total: 3, collected: 50, unpaidCount: 1, unpaidAmount: 20 });
    expect(summarizeDay([])).toEqual({ total: 0, collected: 0, unpaidCount: 0, unpaidAmount: 0 });
  });
  it('settle-next-day flags overnight via paid_at alone', () => {
    const day = new Date(2026, 8, 23, 12).getTime();
    const csv = dayReportCSV(day, [
      tx({ id: 's', plateNumber: 'S1', checkInAt: new Date(2026, 8, 23, 10, 0).getTime(), checkOutAt: new Date(2026, 8, 23, 12, 0).getTime(), fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: new Date(2026, 8, 24, 9, 0).getTime() }),
    ]);
    const row = csv.split('\n').find(l => l.startsWith('S1'))!;
    expect(row).toContain('9:00 AM'); expect(row.endsWith(',yes')).toBe(true);
  });
});
