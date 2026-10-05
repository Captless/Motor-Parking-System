import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBusinessOverview } from '../../db/parkingRepository';
import { formatFullDate } from '../../lib/dates';
import { formatPeso } from '../../lib/currency';
import { useToday } from '../../lib/useToday';
import type { BusinessSnapshot, Tone } from './businessAnalytics';

const count = (n: number): string => n.toLocaleString('en-PH');
const toneClass = (t: Tone): string => `kpi-delta ${t}`;

export default function Analytics() {
  const todayTick = useToday();
  const [snap, setSnap] = useState<BusinessSnapshot | null>(null);
  const [err, setErr] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const next = await getBusinessOverview(Date.now());
        if (live) { setSnap(next); setErr(''); }
      } catch (e) {
        if (live) setErr(e instanceof Error ? e.message : 'Could not load analytics.');
      }
    })();
    return () => { live = false; };
  }, [todayTick, reloadKey]);

  if (err) return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">Overview</h1>
        <p className="hist-sub">{formatFullDate(Date.now())} · business overview</p>
      </header>
      <p className="counter-error">{err}</p>
      <button type="button" className="hist-chip" onClick={() => setReloadKey(k => k + 1)}>Try again</button>
    </div>
  );

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">Overview</h1>
        <p className="hist-sub">{formatFullDate(Date.now())} · business overview</p>
      </header>

      {!snap ? <p className="counter-sub">Loading…</p> : (
        <>
          {!snap.hasRecords && <p className="counter-sub">No records yet. Completed and settled records will appear here.</p>}

          <section aria-label="Today">
            <div className="kpi-grid">
              <div className="kpi">
                <p className="kpi-label">Collected today</p>
                <p className="kpi-val money">{formatPeso(snap.today.revenue)}</p>
                {snap.todayDelta ? <p className={toneClass(snap.todayTone)}>{snap.todayDelta}</p> : <p className="kpi-delta none">no activity yet</p>}
              </div>
              <div className="kpi">
                <p className="kpi-label">Bikes served today</p>
                <p className="kpi-val">{count(snap.today.bikes)}</p>
                <p className="kpi-delta none">{count(snap.parkedNow)} parked now</p>
              </div>
            </div>
          </section>

          <section aria-label="This week">
            <h2 className="an-section">This week</h2>
            <div className="ov-card">
              <div className="ov-row"><span>Week so far</span><strong>{formatPeso(snap.week.revenue)}</strong></div>
              {snap.weekDelta && <div className="ov-row"><span>vs last week</span><span className={toneClass(snap.weekTone)}>{snap.weekDelta}</span></div>}
              <div className="ov-row"><span>Bikes served</span><span>{count(snap.week.bikes)} · avg {formatPeso(snap.week.avgTicket)}/bike</span></div>
            </div>
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
