import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBusinessOverview } from '../../db/parkingRepository';
import { formatFullDate } from '../../lib/dates';
import { formatPeso } from '../../lib/currency';
import { useToday } from '../../lib/useToday';
import { SCOPES, type BusinessSnapshot, type ScopeId } from './businessAnalytics';

const count = (n: number): string => n.toLocaleString('en-PH');

export default function Analytics() {
  const todayTick = useToday();
  const [scope, setScope] = useState<ScopeId>('today');
  const [snap, setSnap] = useState<BusinessSnapshot | null>(null);
  const [err, setErr] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

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
