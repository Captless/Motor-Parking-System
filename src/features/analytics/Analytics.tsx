import { useEffect, useState } from 'react';
import { getWeekStats, getDayStats, getDayTransactions, getDailyStats, type DayStats } from '../../db/parkingRepository';
import type { ParkingTransaction } from '../../types/parking';
import { formatPeso } from '../../lib/currency';
import { formatTime, formatDayLabel, formatFullDate, isToday } from '../../lib/dates';

export default function Analytics() {
  const [week, setWeek] = useState<DayStats[]>([]);
  const [today, setToday] = useState(0);
  const [drillDay, setDrillDay] = useState<number | null>(null);
  const [drill, setDrill] = useState<DayStats | null>(null);
  const [drillList, setDrillList] = useState<ParkingTransaction[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([getWeekStats(), getDailyStats()])
      .then(([w, s]) => { setWeek(w); setToday(s.collectedToday); })
      .catch(e => setErr(String(e.message ?? e)));
  }, []);

  const selectDay = async (day: number) => {
    if (drillDay === day) { setDrillDay(null); setDrill(null); setDrillList([]); return; }
    setDrillDay(day);
    const [d, dl] = await Promise.all([getDayStats(day), getDayTransactions(day)]);
    setDrill(d); setDrillList(dl);
  };

  if (err) return <p className="counter-error">{err}</p>;
  if (week.length === 0) return <p className="counter-sub">Loading…</p>;
  const max = Math.max(1, ...week.map(d => d.collected));
  const totC = week.reduce((s, d) => s + d.collected, 0);

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold">Analytics</h1>
        <p className="hist-sub">{formatFullDate(Date.now())} · {formatPeso(today)} today</p></div>
      <section className="analytics" aria-label="Last 7 days">
        <p className="analytics-title">Last 7 days</p>
        <div className="analytics-strip">
          {week.map(d => (
            <button key={d.day} className={`analytics-bar${isToday(d.day) ? ' today' : ''}${drillDay === d.day ? ' selected' : ''}`}
              onClick={() => selectDay(d.day)} aria-pressed={drillDay === d.day}
              aria-label={`${formatDayLabel(d.day)}: ${formatPeso(d.collected)}`}>
              <span className="analytics-col"><span className="analytics-fill" style={{ height: `${Math.max(4, Math.round((d.collected / max) * 100))}%` }} /></span>
              <span className="analytics-day">{formatDayLabel(d.day)}</span>
              <span className="analytics-val">{d.collected > 0 ? formatPeso(d.collected) : '—'}</span>
            </button>
          ))}
        </div>
        <p className="counter-sub">7-day total: {formatPeso(totC)}</p>
        {drill && drillDay != null && (
          <div className="analytics-drill">
            <div className="analytics-drill-head">
              <p className="analytics-drill-title">{formatFullDate(drillDay)} · {formatPeso(drill.collected)}</p>
              <button className="counter-link" onClick={() => { setDrillDay(null); setDrill(null); setDrillList([]); }}>Back</button>
            </div>
            {drillList.length === 0
              ? <p className="counter-empty">No checkouts that day.</p>
              : <div className="analytics-drill-list">{drillList.map(t => (
                <div key={t.id} className="analytics-drill-row">
                  <span className="counter-plate small">{t.plateNumber}</span>
                  <span className="counter-meta">{t.checkOutAt ? `${formatTime(t.checkInAt)}→${formatTime(t.checkOutAt)}` : ''} · {formatPeso(t.fee)} · {t.paymentStatus.toUpperCase()}</span>
                </div>))}</div>}
          </div>
        )}
      </section>
    </div>
  );
}
