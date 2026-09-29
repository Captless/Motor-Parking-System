import { useEffect, useMemo, useState } from 'react';
import { getRangeSummary, type RangeSummary } from '../../db/parkingRepository';
import { formatPeso, formatPesoCompact } from '../../lib/currency';
import { formatFullDate, monthStart, yearStart, addMonths, formatMonth, startOfDay, isToday } from '../../lib/dates';

type Preset = 'today' | 'week' | 'month' | 'year';
const PRESET_LABEL: Record<Preset, string> = { today: 'today', week: '7 days', month: 'this month', year: 'this year' };
const fmtHour = (h: number): string => { const ap = h < 12 ? 'AM' : 'PM'; const n = h % 12 === 0 ? 12 : h % 12; return `${n} ${ap}`; };

export default function Analytics() {
  const [preset, setPreset] = useState<Preset>('week');
  const [sum, setSum] = useState<RangeSummary | null>(null);
  const [monthCursor, setMonthCursor] = useState(() => monthStart(Date.now()));
  const [monthDays, setMonthDays] = useState<RangeSummary | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    const now = Date.now();
    const [from, to] = preset === 'today' ? [now, now]
      : preset === 'week' ? [now - 6 * 86400000, now]
      : preset === 'month' ? [monthStart(now), now]
      : [yearStart(now), now];
    getRangeSummary(from, to).then(setSum).catch(e => setErr(String(e.message ?? e)));
  }, [preset]);

  useEffect(() => {
    const next = addMonths(monthCursor, 1);
    getRangeSummary(monthCursor, next - 1).then(setMonthDays).catch(() => {});
  }, [monthCursor]);

  const cells = useMemo(() => {
    if (!monthDays) return [];
    const first = new Date(monthCursor);
    const lead = (first.getDay() + 6) % 7;
    const todayStart = startOfDay(Date.now());
    return monthDays.days.map((d, i) => ({
      ...d,
      future: d.day > todayStart,
      on: d.collected > 0,
      lead: i === 0 ? lead : 0,
    }));
  }, [monthDays, monthCursor]);

  if (err) return <p className="counter-error">{err}</p>;

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold">Analytics</h1>
        <p className="hist-sub">{formatFullDate(Date.now())}</p></div>
      <div className="hist-filter" role="group" aria-label="Range">
        {(['today', 'week', 'month', 'year'] as const).map(p => (
          <button key={p} onClick={() => setPreset(p)} aria-pressed={preset === p}
            className={`hist-chip${preset === p ? ' active' : ''}`}>
            {p === 'today' ? 'Today' : p === 'week' ? '7 days' : p === 'month' ? 'This month' : 'This year'}
          </button>))}
      </div>
      {sum ? (
        <div className="kpi-grid">
          <div className="kpi"><p className="kpi-val money">{formatPeso(sum.totalCollected)}</p><p className="kpi-label">revenue · {PRESET_LABEL[preset]}</p></div>
          <div className="kpi"><p className="kpi-val">{sum.totalEntries}</p><p className="kpi-label">bikes · {PRESET_LABEL[preset]}</p></div>
          <div className="kpi"><p className="kpi-val">{sum.peakHour ? fmtHour(sum.peakHour.hour) : '—'}</p><p className="kpi-label">peak hour</p></div>
          <div className="kpi warn-card"><p className="kpi-val warn">{formatPeso(sum.outstanding.amount)}</p><p className="kpi-label">unpaid</p></div>
        </div>
      ) : <p className="counter-sub">Loading…</p>}
      <section aria-label="Month calendar">
        <div className="cal-head">
          <p className="analytics-title">{formatMonth(monthCursor)}</p>
          <div>
            <button className="cal-nav" onClick={() => setMonthCursor(addMonths(monthCursor, -1))} aria-label="Previous month">‹</button>
            <button className="cal-nav" onClick={() => setMonthCursor(addMonths(monthCursor, 1))} aria-label="Next month">›</button>
          </div>
        </div>
        <div className="cal-grid" role="group" aria-label="Revenue by day">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="cal-dow">{d}</span>)}
          {cells.flatMap(c => [
            ...Array.from({ length: c.lead }, (_, k) => <span key={`gap-${c.day}-${k}`} />),
            <span key={c.day}
              aria-label={c.on ? `${formatFullDate(c.day)}: ${formatPeso(c.collected)}, ${c.entries} bikes` : formatFullDate(c.day)}
              className={`cal-cell${c.on ? ' on' : ''}${isToday(c.day) ? ' today' : ''}${c.future ? ' future' : ''}`}>
              <span className="cal-date">{new Date(c.day).getDate()}</span>
              {c.on && <span className="cal-rev">{formatPesoCompact(c.collected)}</span>}
              {c.on && <span className="cal-bikes">{c.entries}</span>}
            </span>,
          ])}
        </div>
        <p className="cal-legend">date · revenue · bikes</p>
      </section>
    </div>
  );
}
