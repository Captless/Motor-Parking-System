export const startOfDay = (ts: number): number => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const endOfDay = (ts: number): number => startOfDay(ts) + 86400000;
export const inDay = (ts: number | undefined, day: number): boolean => ts != null && ts >= startOfDay(day) && ts < endOfDay(day);
export function formatTime(ts: number): string { return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
export function formatDuration(from: number, to = Date.now()): string { const m = Math.max(0, Math.floor((to - from) / 60000)); const h = Math.floor(m / 60); const mm = m % 60; return h > 0 ? `${h}h ${mm}m` : `${mm}m`; }
export const isToday = (ts: number, now = Date.now()): boolean => startOfDay(ts) === startOfDay(now);
export function formatFullDate(ts: number): string { return new Date(ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase(); }
export function formatShortDate(ts: number): string { return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' }); }
export const addDays = (ts: number, n: number): number => { const d = new Date(ts); d.setDate(d.getDate() + n); d.setHours(0, 0, 0, 0); return d.getTime(); };
/** Every local day number from `from` to `to` inclusive. */
export function eachDay(from: number, to: number): number[] { const out: number[] = []; for (let d = startOfDay(from); d <= startOfDay(to); d = addDays(d, 1)) out.push(d); return out; }
