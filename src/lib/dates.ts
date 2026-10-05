export const startOfDay = (ts: number): number => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const endOfDay = (ts: number): number => startOfDay(ts) + 86400000;
export const inDay = (ts: number | undefined, day: number): boolean => ts != null && ts >= startOfDay(day) && ts < endOfDay(day);
export function formatTime(ts: number): string { return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
export function formatDuration(from: number, to = Date.now()): string { const m = Math.max(0, Math.floor((to - from) / 60000)); const h = Math.floor(m / 60); const mm = m % 60; return h > 0 ? `${h}h ${mm}m` : `${mm}m`; }
export const isToday = (ts: number, now = Date.now()): boolean => startOfDay(ts) === startOfDay(now);
export function formatDayLabel(ts: number): string { const d = new Date(ts); return `${d.toLocaleDateString([], { weekday: 'short' })} ${d.getDate()}`; }
export function formatFullDate(ts: number): string { return new Date(ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase(); }
export function formatDateTime(ts: number): string { const d = new Date(ts); return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`; }
export function formatShortDate(ts: number): string { return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' }); }
export const weekStart = (ts: number): number => { const d = new Date(ts); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
export const monthStart = (ts: number): number => { const d = new Date(ts); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const yearStart = (ts: number): number => { const d = new Date(ts); d.setMonth(0, 1); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const addMonths = (ts: number, n: number): number => { const d = new Date(ts); d.setMonth(d.getMonth() + n, 1); d.setHours(0, 0, 0, 0); return d.getTime(); };
export function formatMonth(ts: number): string { return new Date(ts).toLocaleDateString([], { month: 'long', year: 'numeric' }); }
export const addDays = (ts: number, n: number): number => { const d = new Date(ts); d.setDate(d.getDate() + n); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const addYears = (ts: number, n: number): number => { const d = new Date(ts); d.setDate(1); d.setMonth(0); d.setHours(0, 0, 0, 0); d.setFullYear(d.getFullYear() + n); return d.getTime(); };
export const quarterStart = (ts: number): number => { const d = new Date(ts); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(Math.floor(d.getMonth() / 3) * 3); return d.getTime(); };
/** Every local day number from `from` to `to` inclusive. */
export function eachDay(from: number, to: number): number[] { const out: number[] = []; for (let d = startOfDay(from); d <= startOfDay(to); d = addDays(d, 1)) out.push(d); return out; }
/** Every month start from `from` to `to` inclusive. */
export function eachMonth(from: number, to: number): number[] { const out: number[] = []; for (let m = monthStart(from); m <= monthStart(to); m = addMonths(m, 1)) out.push(m); return out; }
export function formatMonthShort(ts: number): string { return new Date(ts).toLocaleDateString([], { month: 'short' }); }
export function formatMonthYearShort(ts: number): string { return new Date(ts).toLocaleDateString([], { month: 'short', year: '2-digit' }); }
export function formatQuarterShort(ts: number): string { const d = new Date(ts); return `Q${Math.floor(d.getMonth() / 3) + 1} ’${String(d.getFullYear()).slice(2)}`; }
export function formatYearShort(ts: number): string { return String(new Date(ts).getFullYear()); }
