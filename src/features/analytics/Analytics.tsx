import { useEffect, useState } from 'react';
import { getRangeAnalytics, type RangeAnalytics } from '../../db/parkingRepository';
import { formatPeso } from '../../lib/currency';
import { formatDayLabel, formatFullDate, isToday } from '../../lib/dates';

const fmtHour = (h: number): string => { const ap = h < 12 ? 'AM' : 'PM'; const n = h % 12 === 0 ? 12 : h % 12; return `${n} ${ap}`; };
const delta = (v: number | null): { text: string; cls: string } =>
  v == null ? { text: '— vs last wk', cls: '' } : { text: `${v >= 0 ? '+' : ''}${v}% vs last wk`, cls: v > 0 ? 'up' : v < 0 ? 'down' : '' };

export default function Analytics() {
  const [a, setA] = useState<RangeAnalytics | null>(null);
  const [today, setToday] = useState(0);
  const [err, setErr] = useState('');

  useEffect(() => {
    getRangeAnalytics()
      .then(r => { setA(r); setToday(r.days.find(d => isToday(d.day))?.collected ?? 0); })
      .catch(e => setErr(String(e.message ?? e)));
  }, []);

  if (err) return <p className="counter-error">{err}</p>;
  if (!a) return <p className="counter-sub">Loading…</p>;
  const max = Math.max(1, ...a.days.map(d => d.collected), a.prevDailyAvg);
  const rev = delta(a.revenueDeltaPct); const ent = delta(a.entriesDeltaPct);

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold">Analytics</h1>
        <p className="hist-sub">{formatFullDate(Date.now())} · {formatPeso(today)} today</p></div>
      <div className="kpi-grid">
        <div className="kpi"><p className="kpi-val money">{formatPeso(a.totalCollected)}</p><p className={`kpi-delta ${rev.cls}`}>{rev.text}</p><p className="kpi-label">revenue · 7 days</p></div>
        <div className="kpi"><p className="kpi-val">{a.totalEntries}</p><p className={`kpi-delta ${ent.cls}`}>{ent.text}</p><p className="kpi-label">bikes · 7 days</p></div>
        <div className="kpi"><p className="kpi-val">{a.peakHour ? fmtHour(a.peakHour.hour) : '—'}</p><p className="kpi-delta">{a.peakHour ? `${a.peakHour.count} arrivals` : 'no data yet'}</p><p className="kpi-label">peak hour</p></div>
        <div className="kpi warn-card"><p className="kpi-val warn">{formatPeso(a.outstanding.amount)}</p><p className="kpi-delta">{a.outstanding.count} bike{a.outstanding.count === 1 ? '' : 's'} unpaid</p><p className="kpi-label">outstanding</p></div>
      </div>
      <section className="chart" aria-label="Revenue last 7 days">
        <p className="analytics-title">Revenue · last 7 days · avg {formatPeso(a.prevDailyAvg)}/day last wk</p>
        {a.totalCompleted === 0 && a.totalEntries === 0
          ? <p className="counter-empty">No activity in range.</p>
          : <><div className="chart-bars">
            {a.days.map(d => {
              const wd = new Date(d.day).getDay(); const weekend = wd === 0 || wd === 6;
              return (
              <div key={d.day} className={`chart-bar${isToday(d.day) ? ' today' : ''}${weekend ? ' weekend' : ''}`}>
                <span className="chart-val">{d.collected > 0 ? formatPeso(d.collected) : '—'}</span>
                <span className="chart-plot">
                  <span className="chart-avg" style={{ bottom: `${Math.min(100, Math.round((a.prevDailyAvg / max) * 100))}%` }} />
                  <span className="chart-col"><span className="chart-fill" style={{ height: `${Math.max(3, Math.round((d.collected / max) * 100))}%` }} /></span>
                </span>
                <span className="analytics-day">{formatDayLabel(d.day)}</span>
              </div> );
            })}
          </div>
          <p className="counter-sub">shaded bars = weekend · dashed line = last-wk daily avg</p></>}
      </section>
    </div>
  );
}
