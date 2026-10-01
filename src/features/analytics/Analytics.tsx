import { useEffect, useMemo, useState } from 'react';
import { getOldestDay, getRangeSummary, type RangeSummary } from '../../db/parkingRepository';
import { formatPeso, formatPesoCompact } from '../../lib/currency';
import { useToday } from '../../lib/useToday';
import { formatFullDate, monthStart, weekStart, yearStart, addMonths, formatMonth, startOfDay, isToday } from '../../lib/dates';

type Preset = 'all' | 'today' | 'week' | 'month' | 'year';
const PRESETS: Preset[] = ['all', 'today', 'week', 'month', 'year'];
const PRESET_LABEL: Record<Preset, string> = { all: 'all time', today: 'today', week: 'this week', month: 'this month', year: 'this year' };
const fmtHour = (h: number): string => { const ap = h < 12 ? 'AM' : 'PM'; const n = h % 12 === 0 ? 12 : h % 12; return `${n} ${ap}`; };

export default function Analytics() {
  const [preset, setPreset] = useState<Preset>('all');
  const todayTick = useToday();
  const [sum, setSum] = useState<RangeSummary | null>(null);
  const [monthCursor, setMonthCursor] = useState(() => monthStart(Date.now()));
  const [monthDays, setMonthDays] = useState<RangeSummary | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const now = Date.now();
        const from = preset === 'all' ? ((await getOldestDay()) ?? now)
          : preset === 'today' ? now
          : preset === 'week' ? weekStart(now)
          : preset === 'month' ? monthStart(now)
          : yearStart(now);
        const s = await getRangeSummary(from, now);
        if (live) setSum(s);
      } catch (e: any) { if (live) setErr(String(e.message ?? e)); }
    })();
    return () => { live = false; };
  }, [preset, todayTick]);

  useEffect(() => {
    const next = addMonths(monthCursor, 1);
    getRangeSummary(monthCursor, next - 1).then(setMonthDays).catch(() => {});
  }, [monthCursor, todayTick]);

  const cells = useMemo(() => {
    if (!monthDays) return [];
    const first = new Date(monthCursor);
    const lead = (first.getDay() + 6) % 7;
    const todayStart = startOfDay(Date.now());
    const bestCollected = Math.max(0, ...monthDays.days.map(d => d.collected));
    let bestSeen = false;
    return monthDays.days.map((d, i) => {
      const best = d.collected > 0 && d.collected === bestCollected && !bestSeen;
      if (best) bestSeen = true;
      return {
        ...d,
        future: d.day > todayStart,
        on: d.collected > 0,
        best,
        lead: i === 0 ? lead : 0,
      };
    });
  }, [monthDays, monthCursor]);

  if (err) return <p className="counter-error">{err}</p>;

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold">Analytics</h1>
        <p className="hist-sub">{formatFullDate(Date.now())}</p></div>
      <div className="hist-filter" role="group" aria-label="Range">
        {PRESETS.map(p => (
          <button key={p} onClick={() => setPreset(p)} aria-pressed={preset === p}
            className={`hist-chip${preset === p ? ' active' : ''}`}>
            {p === 'all' ? 'All time' : p === 'today' ? 'Today' : p === 'week' ? 'This week' : p === 'month' ? 'This month' : 'This year'}
          </button>))}
      </div>
      {sum ? (
        <div className="kpi-grid">
          <div className="kpi"><p className="kpi-val money">{formatPeso(sum.totalCollected)}</p><p className="kpi-label">revenue · {PRESET_LABEL[preset]}</p></div>
          <div className="kpi"><p className="kpi-val">{sum.totalEntries}</p><p className="kpi-label">entries · {PRESET_LABEL[preset]}</p></div>
          <div className="kpi"><p className="kpi-val">{sum.peakHour ? fmtHour(sum.peakHour.hour) : '—'}</p><p className="kpi-label">peak hour</p></div>
          <div className="kpi warn-card"><p className="kpi-val warn">{formatPeso(sum.outstanding.amount)}</p><p className="kpi-label">unpaid</p></div>
        </div>
      ) : <p className="counter-sub">Loading…</p>}
      <section aria-label="Month calendar">
        <div className="cal-head">
          <div>
            <p className="analytics-title">{formatMonth(monthCursor)}</p>
            {monthDays && <p className="counter-sub">{formatPeso(monthDays.days.reduce((s, d) => s + d.collected, 0))} · {monthDays.days.reduce((s, d) => s + d.entries, 0)} entries</p>}
          </div>
          <div>
            {monthStart(monthCursor) !== monthStart(Date.now()) && (
              <button className="hist-chip" onClick={() => setMonthCursor(monthStart(Date.now()))}>Today</button>)}
            <button className="cal-nav" onClick={() => setMonthCursor(addMonths(monthCursor, -1))} aria-label="Previous month">‹</button>
            <button className="cal-nav" onClick={() => setMonthCursor(addMonths(monthCursor, 1))} aria-label="Next month">›</button>
          </div>
        </div>
        <div className="cal-grid" role="group" aria-label="Revenue by day">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="cal-dow">{d}</span>)}
          {cells.flatMap(c => [
            ...Array.from({ length: c.lead }, (_, k) => <span key={`gap-${c.day}-${k}`} />),
            <span key={c.day}
              aria-label={c.on ? `${formatFullDate(c.day)}: ${formatPeso(c.collected)}, ${c.entries} entries${c.unpaid > 0 ? `, ${c.unpaid} unsettled` : ''}${c.best ? ', best day' : ''}` : formatFullDate(c.day)}
              className={`cal-cell${c.on ? ' on' : ''}${isToday(c.day) ? ' today' : ''}${c.future ? ' future' : ''}`}>
              <span className="cal-date">{new Date(c.day).getDate()}</span>
              {c.best && <span className="cal-best" aria-hidden="true">★</span>}
              {c.on && <span className="cal-rev">{formatPesoCompact(c.collected)}</span>}
              {c.on && <span className="cal-entries">{c.entries}</span>}
              {c.unpaid > 0 && <span className="cal-dot" aria-hidden="true" />}
            </span>,
          ])}
        </div>
        <p className="cal-legend">date · revenue · entries · <span className="cal-key-best">★</span> best day · <span className="cal-key-dot">●</span> unsettled</p>
      </section>
    </div>
  );
}
