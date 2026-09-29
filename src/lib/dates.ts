export const startOfDay = (ts: number): number => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const endOfDay = (ts: number): number => startOfDay(ts) + 86400000;
export const inDay = (ts: number | undefined, day: number): boolean => ts != null && ts >= startOfDay(day) && ts < endOfDay(day);
export function formatTime(ts: number): string { return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
export function formatDuration(from: number, to = Date.now()): string { const m = Math.max(0, Math.floor((to - from) / 60000)); const h = Math.floor(m / 60); const mm = m % 60; return h > 0 ? `${h}h ${mm}m` : `${mm}m`; }
export const isToday = (ts: number, now = Date.now()): boolean => startOfDay(ts) === startOfDay(now);
export function formatDayLabel(ts: number): string { const d = new Date(ts); return `${d.toLocaleDateString([], { weekday: 'short' })} ${d.getDate()}`; }
export function formatFullDate(ts: number): string { return new Date(ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase(); }
export function formatDateTime(ts: number): string { const d = new Date(ts); return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`; }
export const monthStart = (ts: number): number => { const d = new Date(ts); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const yearStart = (ts: number): number => { const d = new Date(ts); d.setMonth(0, 1); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const addMonths = (ts: number, n: number): number => { const d = new Date(ts); d.setMonth(d.getMonth() + n, 1); d.setHours(0, 0, 0, 0); return d.getTime(); };
export function formatMonth(ts: number): string { return new Date(ts).toLocaleDateString([], { month: 'long', year: 'numeric' }); }
