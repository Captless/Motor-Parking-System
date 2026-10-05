import type { ParkingTransaction } from '../types/parking';
import { startOfDay, formatDuration, formatFullDate } from './dates';

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

export type ReportFormat = 'csv' | 'html' | 'txt';
export const reportFilename = (day: number, format: ReportFormat, at = Date.now()): string => {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `motor-parking-daily-${stamp(day)}-${p(d.getHours())}${p(d.getMinutes())}.${format}`;
};
export const backupFilename = (at = Date.now()): string => {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `motor-parking-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
};

export interface ReportSummary { total: number; collected: number; unpaidCount: number; unpaidAmount: number; }
export const summarizeDay = (txs: ParkingTransaction[]): ReportSummary => {
  const open = txs.filter(t => t.paymentStatus !== 'paid');
  return { total: txs.length, collected: txs.filter(t => t.paymentStatus === 'paid').reduce((s, t) => s + t.fee, 0), unpaidCount: open.length, unpaidAmount: open.reduce((s, t) => s + t.fee, 0) };
};
export const isLiveDay = (day: number, now = Date.now()): boolean => startOfDay(day) === startOfDay(now);
export const coverageLabel = (day: number): string => {
  const d = new Date(startOfDay(day));
  const mon = d.toLocaleDateString([], { month: 'short' }).toUpperCase();
  return `Covers ${mon} ${d.getDate()}, 12:00 AM - 11:59 PM - entries and checkouts that day`;
};
export const activityLabel = (day: number, txs: ParkingTransaction[], now = Date.now()): string => {
  if (txs.length === 0) return 'No activity recorded';
  const starts = txs.map(t => t.checkInAt).filter((v): v is number => v != null);
  const ends = txs.map(t => t.checkOutAt ?? t.paidAt ?? t.checkInAt).filter((v): v is number => v != null);
  const ongoing = isLiveDay(day, now) && txs.some(t => t.checkOutAt == null && t.status === 'parked');
  const tail = ongoing ? 'ongoing' : hm(Math.max(...ends));
  return `first entry ${hm(Math.min(...starts))} -> ${ongoing ? '' : 'last activity '}${tail}`;
};

export function dayReportCSV(day: number, txs: ParkingTransaction[], now = Date.now()): string {
  const s = summarizeDay(txs);
  const live = isLiveDay(day, now);
  const lines = [
    `REPORT DATE,${stamp(day)}`,
    `GENERATED,${new Date(now).toLocaleString()}`,
    `COVERAGE,${coverageLabel(day)}`,
    `ACTIVITY,${activityLabel(day, txs, now)}`,
    `TOTAL ENTRIES,${s.total}`,
    `COLLECTED,${s.collected}`,
    `UNPAID,${s.unpaidCount} bikes · ₱${s.unpaidAmount}`,
    live ? 'NOTE,ongoing snapshot - totals as of download; times are h:MM AM/PM; overnight=yes stayed past midnight' : 'NOTE,times are h:MM AM/PM; overnight=yes stayed past midnight',
    '',
    'plate,check_in,check_out,duration,fee_php,status,payment,paid_at,overnight',
    ...txs.map(t => [t.plateNumber, hm(t.checkInAt), hm(t.checkOutAt), t.checkOutAt ? formatDuration(t.checkInAt, t.checkOutAt) : '', t.fee, t.status, t.paymentStatus, hm(t.paidAt), pastDay(t.checkOutAt, day) || pastDay(t.paidAt, day) ? 'yes' : ''].map(q).join(',')),
  ];
  return `\uFEFF${lines.join('\n')}\n`;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function dayReportHTML(day: number, txs: ParkingTransaction[], now = Date.now()): string {
  const s = summarizeDay(txs);
  const live = isLiveDay(day, now);
  const rows = txs.map(t => `<tr${t.paymentStatus === 'paid' ? '' : ' class="unpaidrow"'}><td><b>${esc(t.plateNumber)}</b></td><td>${hm(t.checkInAt)}</td><td>${hm(t.checkOutAt) || '—'}</td><td>${t.checkOutAt ? formatDuration(t.checkInAt, t.checkOutAt) : '—'}</td><td>₱${t.fee}</td><td>${t.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Daily ${stamp(day)}</title><style>body{font-family:ui-monospace,Menlo,Consolas,monospace;max-width:640px;margin:0 auto;padding:16px;color:#111}h1{font-size:20px}.cards{display:flex;gap:8px;margin:12px 0}.card{flex:1;border:1px solid #ddd;border-radius:8px;padding:8px;text-align:center}.card b{font-size:20px}.card.warn{background:#fffbeb;border-color:#fcd34d}.card.warn b{color:#92400e}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:8px;border-bottom:1px solid #eee}th{font-size:11px;text-transform:uppercase;color:#666}tr.unpaidrow{background:#fefce8}.note{color:#666;font-size:12px}</style></head><body><h1>Motor Parking — ${stamp(day)}</h1><p class="note">${live ? 'Ongoing snapshot' : 'Daily report'} · Generated ${new Date(now).toLocaleString()} on-device.</p><p class="note">${esc(coverageLabel(day))}.</p><p class="note">Activity: ${esc(activityLabel(day, txs, now))}.</p><div class="cards"><div class="card"><b>${s.total}</b><br>total entries</div><div class="card"><b>₱${s.collected}</b><br>collected</div><div class="card warn"><b>₱${s.unpaidAmount}</b><br>unpaid · ${s.unpaidCount}</div></div><table><thead><tr><th>Plate</th><th>In</th><th>Out</th><th>Time</th><th>Fee</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No records.</td></tr>'}</tbody></table><p class="note">Times are h:MM AM/PM. Generated on-device.</p></body></html>`;
}

export function dayReportTXT(day: number, txs: ParkingTransaction[], now = Date.now()): string {
  const s = summarizeDay(txs);
  const live = isLiveDay(day, now);
  const titleDate = `${formatFullDate(day)}, ${new Date(day).getFullYear()}`;
  const generated = new Date(now).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const endOf = (t: ParkingTransaction): number => t.checkOutAt ?? t.paidAt ?? t.checkInAt;
  const paid = txs.filter(t => t.paymentStatus === 'paid').sort((a, b) => endOf(a) - endOf(b));
  const unpaid = txs.filter(t => t.paymentStatus !== 'paid').sort((a, b) => a.checkInAt - b.checkInAt);
  const overnight = (t: ParkingTransaction): boolean => pastDay(t.checkOutAt, day) || pastDay(t.paidAt, day);
  const line = (t: ParkingTransaction, i: number): string[] => {
    const stay = t.checkOutAt
      ? `Out ${hm(t.checkOutAt)} (${formatDuration(t.checkInAt, t.checkOutAt)})`
      : 'Still parked';
    const over = overnight(t) ? ' - overnight' : '';
    const st = t.paymentStatus === 'paid' ? 'Paid' : 'Unpaid';
    return [
      `${i + 1}. ${t.plateNumber} - ${st} - P${t.fee}${over}`,
      `   In ${hm(t.checkInAt)}, ${stay}`,
    ];
  };
  const activity = activityLabel(day, txs, now);
  return [
    'MOTOR PARKING',
    `Daily Report - ${titleDate}`,
    `${coverageLabel(day)}`,
    `Activity: ${activity}`,
    '',
    'MONEY',
    `Collected: P${s.collected} (${paid.length} paid)`,
    s.unpaidCount === 0 ? 'Unpaid: P0 (all settled)' : `Unpaid: P${s.unpaidAmount} (${s.unpaidCount} bikes - collect later)`,
    `Total entries: ${s.total}`,
    '',
    `PAID (${paid.length})`,
    ...(paid.length > 0 ? paid.flatMap(line) : ['None.']),
    '',
    `UNPAID - NEEDS FOLLOW-UP (${unpaid.length})`,
    ...(unpaid.length > 0 ? unpaid.flatMap(line) : ['None - all settled.']),
    '',
    'Notes: Times are h:MM AM/PM. Still parked = bike still in lot.',
    'Money is credited to the day it was paid. See Overview for revenue by day.',
    `Generated ${generated} on device. ${live ? 'Ongoing snapshot - totals as of download.' : 'Final daily report.'}`,
    '',
  ].join('\n');
}

export function downloadTextFile(name: string, text: string, mime: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
