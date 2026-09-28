import { useEffect, useState } from 'react';
import { getRangeAnalytics, type RangeAnalytics } from '../../db/parkingRepository';
import { formatPeso } from '../../lib/currency';
import { formatDayLabel, formatFullDate, isToday } from '../../lib/dates';

const fmtStay = (min: number): string => min <= 0 ? '—' : min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m` : `${min}m`;

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
  const max = Math.max(1, ...a.days.map(d => d.collected));

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold">Analytics</h1>
        <p className="hist-sub">{formatFullDate(Date.now())} · {formatPeso(today)} today</p></div>
      <div className="kpi-grid">
        <div className="kpi"><p className="kpi-val">{formatPeso(a.totalCollected)}</p><p className="kpi-label">7-day total</p></div>
        <div className="kpi"><p className="kpi-val">{formatPeso(a.avgPerDay)}</p><p className="kpi-label">avg / day</p></div>
        <div className="kpi"><p className="kpi-val">{Math.round(a.paidRate * 100)}%</p><p className="kpi-label">paid rate</p></div>
        <div className="kpi"><p className="kpi-val">{fmtStay(a.avgStayMin)}</p><p className="kpi-label">avg stay</p></div>
      </div>
      <section className="chart" aria-label="Revenue last 7 days">
        <p className="analytics-title">Revenue · last 7 days</p>
        {a.totalCompleted === 0
          ? <p className="counter-empty">No completions in range.</p>
          : <>
            <div className="chart-bars">
              {a.days.map(d => (
                <div key={d.day} className={`chart-bar${isToday(d.day) ? ' today' : ''}`}>
                  <span className="chart-val">{d.collected > 0 ? formatPeso(d.collected) : '—'}</span>
                  <span className="chart-col"><span className="chart-fill" style={{ height: `${Math.max(3, Math.round((d.collected / max) * 100))}%` }} /></span>
                  <span className="analytics-day">{formatDayLabel(d.day)}</span>
                </div>
              ))}
            </div>
            <p className="counter-sub">Best {formatDayLabel(a.bestDay.day)} {formatPeso(a.bestDay.collected)} · Slowest {formatDayLabel(a.worstDay.day)} {formatPeso(a.worstDay.collected)} · {a.totalEntries} bikes</p>
          </>}
      </section>
    </div>
  );
}
