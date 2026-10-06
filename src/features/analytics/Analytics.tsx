import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBusinessOverview } from '../../db/parkingRepository';
import { formatFullDate, formatMonth, monthStart, startOfDay, addMonths } from '../../lib/dates';
import { formatPeso, formatPesoCompact } from '../../lib/currency';
import { useToday } from '../../lib/useToday';
import { SCOPES, buildMonthCells, type BusinessSnapshot, type ScopeId } from './businessAnalytics';

const count = (n: number): string => n.toLocaleString('en-PH');

export default function Analytics() {
  const todayTick = useToday();
  const [scope, setScope] = useState<ScopeId>('today');
  const [snap, setSnap] = useState<BusinessSnapshot | null>(null);
  const [err, setErr] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [monthCursor, setMonthCursor] = useState(() => monthStart(Date.now()));
  const [pickedDay, setPickedDay] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const next = await getBusinessOverview(scope, Date.now());
        if (live) { setSnap(next); setErr(''); }
      } catch (e) {
        if (live) setErr(e instanceof Error ? e.message : 'Could not load analytics.');
      }
    })();
    return () => { live = false; };
  }, [scope, todayTick, reloadKey]);

  const month = useMemo(() => {
    if (!snap) return null;
    return buildMonthCells(snap.days, snap.unpaidByDay, monthCursor, Date.now());
  }, [snap, monthCursor]);

  const selected = useMemo(() => {
    if (!snap || !month) return null;
    if (pickedDay != null && month.cells.some(c => c.day === pickedDay)) return pickedDay;
    const todayStart = startOfDay(Date.now());
    if (month.cells.some(c => c.day === todayStart)) return todayStart;
    return null;
  }, [snap, month, pickedDay, monthCursor]);

  const selectedCell = month?.cells.find(c => c.day === selected) ?? null;
  const selectedUnpaid = selected != null && snap ? snap.unpaidByDay.get(selected) : undefined;
  const dayRef = useRef<HTMLDivElement | null>(null);
  const userPicked = useRef(false);
  useEffect(() => {
    if (!userPicked.current || !selectedCell) return;
    userPicked.current = false;
    const el = dayRef.current;
    if (!el || typeof el.scrollIntoView !== 'function') return;
    const smooth = typeof window.matchMedia !== 'function' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'nearest' });
  }, [selectedCell]);

  if (err) return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">Overview</h1>
        <p className="hist-sub">{formatFullDate(Date.now())}</p>
      </header>
      <p className="counter-error">{err}</p>
      <button type="button" className="hist-chip" onClick={() => setReloadKey(k => k + 1)}>Try again</button>
    </div>
  );

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">Overview</h1>
        <p className="hist-sub">{formatFullDate(Date.now())}</p>
      </header>

      <div className="hist-filter" role="group" aria-label="Reporting scope">
        {SCOPES.map(s => (
          <button key={s.id} type="button" onClick={() => setScope(s.id)} aria-pressed={scope === s.id}
            className={`hist-chip${scope === s.id ? ' active' : ''}`}>
            {s.tab}
          </button>
        ))}
      </div>

      {!snap ? <p className="counter-sub">Loading…</p> : (
        <>
          {!snap.hasRecords && <p className="counter-sub">No records yet. Completed and settled records will appear here.</p>}

          <section aria-label="Summary">
            <div className="kpi-grid">
              <div className="kpi">
                <p className="kpi-label">Collected {snap.summary.label}</p>
                <p className="kpi-val money">{formatPeso(snap.summary.revenue)}</p>
              </div>
              <div className="kpi">
                <p className="kpi-label">Bikes served {snap.summary.label}</p>
                <p className="kpi-val">{count(snap.summary.bikes)}</p>
                {snap.scope === 'today'
                  ? <p className="kpi-delta none">{count(snap.parkedNow)} parked now</p>
                  : <p className="kpi-delta none">avg {formatPeso(snap.summary.avgTicket)}/bike</p>}
              </div>
            </div>
          </section>

          <section aria-label="Month calendar">
            <div className="cal-head">
              <div className="cal-head-text">
                <p className="cal-title">{month ? formatMonth(monthCursor) : ''}</p>
                {month && <p className="counter-sub">{formatPeso(month.total)} · {month.earningDays} earning {month.earningDays === 1 ? 'day' : 'days'}</p>}
              </div>
              <div className="cal-actions">
                {monthStart(monthCursor) !== monthStart(Date.now()) && (
                  <button type="button" className="hist-chip" onClick={() => { setMonthCursor(monthStart(Date.now())); setPickedDay(null); }}>Today</button>
                )}
                <button type="button" className="cal-nav" onClick={() => { setMonthCursor(addMonths(monthCursor, -1)); setPickedDay(null); }} aria-label="Previous month">‹</button>
                <button type="button" className="cal-nav" onClick={() => { setMonthCursor(addMonths(monthCursor, 1)); setPickedDay(null); }} aria-label="Next month" disabled={monthCursor >= addMonths(monthStart(Date.now()), 6)}>›</button>
              </div>
            </div>
            {month && (<>
              {selectedCell && (
                <div ref={dayRef} className="cal-day">
                  <p className="cal-day-title">{formatFullDate(selectedCell.day)}</p>
                  <p className="cal-day-body">Revenue <strong>{formatPeso(selectedCell.revenue)}</strong> · Bikes <strong>{count(selectedCell.bikes)}</strong>{selectedCell.bikes > 0 && <> · Avg <strong>{formatPeso(Math.round(selectedCell.revenue / selectedCell.bikes))}</strong></>}</p>
                  {selectedUnpaid && selectedUnpaid.count > 0
                    ? <p className="cal-day-note">{formatPeso(selectedUnpaid.amount)} · {count(selectedUnpaid.count)} unpaid</p>
                    : <p className="cal-day-note">{selectedCell.revenue === 0 ? 'No revenue recorded on this day.' : 'All settled.'}</p>}
                </div>
              )}
              <div className="cal-grid" role="group" aria-label="Revenue by day">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="cal-dow">{d}</span>)}
                {month.cells.flatMap(c => [
                  ...(c.day === month.cells[0].day ? Array.from({ length: month.lead }, (_, k) => <span key={`gap-${k}`} aria-hidden="true" />) : []),
                  <button
                    key={c.day}
                    type="button"
                    className={`cal-cell${c.revenue > 0 ? ' on' : ''}${c.today ? ' today' : ''}${c.future ? ' future' : ''}${selected === c.day ? ' selected' : ''}`}
                    disabled={c.future}
                    aria-pressed={selected === c.day}
                    data-day={c.day}
                    aria-label={c.future ? `${formatFullDate(c.day)}: future` : `${formatFullDate(c.day)}: ${formatPeso(c.revenue)}, ${count(c.bikes)} bikes${c.unpaid > 0 ? `, ${count(c.unpaid)} unpaid` : ''}${month.bestDay === c.day ? ', best day' : ''}`}
                    onClick={() => { userPicked.current = true; setPickedDay(c.day); }}>
                    <span className="cal-date">{new Date(c.day).getDate()}</span>
                    {month.bestDay === c.day && <span className="cal-best" aria-hidden="true">★</span>}
                    {c.revenue > 0 && <span className="cal-rev">{formatPesoCompact(c.revenue)}</span>}
                    {c.bikes > 0 && <span className="cal-count">{count(c.bikes)}</span>}
                    {c.unpaid > 0 && <span className="cal-unpaid" aria-hidden="true">{c.unpaid}</span>}
                  </button>,
                ])}
              </div>
              <p className="cal-legend">green = earned · ★ best · rose number = unpaid · tap a day</p>
            </>)}
          </section>

          <section aria-label="Unpaid">
            <div className="kpi warn-card">
              <p className="kpi-label">Unpaid</p>
              <div className="ov-amount-row">
                <p className="kpi-val warn">{snap.unpaid.amount}</p>
                {snap.unpaid.count > 0 && <Link className="ov-link" to="/history?payment=unpaid">See all ›</Link>}
              </div>
              <p className="kpi-delta none">
                {count(snap.unpaid.count)} unsettled {snap.unpaid.count === 1 ? 'record' : 'records'}
                {snap.unpaid.oldestDays != null && snap.unpaid.count > 0 ? ` · oldest ${snap.unpaid.oldestDays} ${snap.unpaid.oldestDays === 1 ? 'day' : 'days'}` : ''}
              </p>
              {snap.unpaid.debtors.length > 0 && (
                <div className="ov-debtors">
                  {snap.unpaid.debtors.map(d => (
                    <Link key={d.id} className="ov-debtor"
                      to={`/history?payment=unpaid&q=${encodeURIComponent(d.plate)}`}
                      aria-label={`${d.plate}, ${d.days} days owed, ${d.amount}`}>
                      <span className="ov-debtor-plate">{d.plate}</span>
                      {d.repeat && <span className="ov-debtor-flag">⚠ repeat</span>}
                      <span className="ov-debtor-meta">{d.days}d · {d.amount} ›</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <p className="kpi-footnote">Revenue counts settled payments on the day they were paid. Unpaid is never revenue.</p>
          </section>
        </>
      )}
    </div>
  );
}
