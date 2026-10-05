import { useEffect, useMemo, useState } from 'react'; import { getHistory, markPaid, markUnpaid } from '../../db/parkingRepository';
import { useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import type { ParkingTransaction } from '../../types/parking'; import { formatPeso } from '../../lib/currency'; import { formatTime, formatFullDate, formatShortDate, isToday, startOfDay } from '../../lib/dates';
import { groupByDay } from '../../lib/history';
import { useToast } from '../../app/toast';
export default function History() {
  const toast = useToast();
  const [params] = useSearchParams();
  const [list, setList] = useState<ParkingTransaction[]>([]); const [q, setQ] = useState(params.get('q') ?? ''); const [f, setF] = useState<'all' | 'paid' | 'unpaid'>(params.get('payment') === 'unpaid' ? 'unpaid' : 'all');
  const dq = useDebouncedValue(q);
  const load = () => getHistory(dq, f).then(setList).catch(e => toast.err(String(e.message ?? e)));
  useEffect(() => { load(); }, [dq, f]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const settle = async (t: ParkingTransaction) => {
    if (pendingId) return;
    setPendingId(t.id);
    try { const r = await markPaid(t.id); toast.ok(`Settled ${formatPeso(r.fee)} for ${r.plateNumber}.`); load(); }
    catch (e: any) { toast.err(e.message); }
    finally { setPendingId(null); }
  };
  const unsettle = async (t: ParkingTransaction) => {
    if (pendingId) return;
    setPendingId(t.id);
    try { const r = await markUnpaid(t.id); toast.ok(`Marked ${r.plateNumber} unpaid.`); load(); }
    catch (e: any) { toast.err(e.message); }
    finally { setPendingId(null); }
  };
  const groups = useMemo(() => groupByDay(list), [list]);
  const total = useMemo(() => list.filter(t => t.paymentStatus === 'paid').reduce((s, t) => s + t.fee, 0), [list]);
  const due = useMemo(() => list.filter(t => t.paymentStatus !== 'paid').reduce((s, t) => s + t.fee, 0), [list]);
  return (<div className="hist">
    <div className="hist-head">
      <div><h1>History</h1><p className="hist-sub">{list.length} records · {f === 'unpaid'
        ? <span className="hist-due">Due {formatPeso(due)}</span>
        : <>{formatPeso(total)} collected</>}</p></div>
    </div>
    <div className="hist-toolbar">
      <input className="hist-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search plate…" aria-label="Search history by plate" />
      <div className="hist-filter" role="group" aria-label="Payment filter">
        {(['all', 'paid', 'unpaid'] as const).map(x => <button key={x} onClick={() => setF(x)} aria-pressed={f === x} className={`hist-chip${f === x ? ' active' : ''}`}>{x[0].toUpperCase() + x.slice(1)}</button>)}
      </div>
    </div>
    {list.length === 0
      ? <p className="hist-empty">{q || f !== 'all' ? 'No match. Clear search or filter.' : 'No history yet. Checked-out bikes appear here; still-parked bikes show under Unpaid.'}</p>
      : <div className="hist-scroll">
        {groups.map(g => (
          <section key={g.day} className="hist-batch" aria-label={formatFullDate(g.day)}>
            <div className="hist-batch-head"><span>{formatFullDate(g.day)}</span><span>{g.items.length} · {formatPeso(g.collected)}</span></div>
            <table className="hist-table">
              <thead><tr><th scope="col">Plate</th><th scope="col">In</th><th scope="col">Out</th><th scope="col" className="num">Fee</th><th scope="col" className="st-col">Status</th><th scope="col" className="act-col">Action</th></tr></thead>
              <tbody>{g.items.map(t => (
                <tr key={t.id}>
                  <td className="plate">{t.plateNumber}</td>
                  <td>{formatTime(t.checkInAt)}</td>
                  <td>{t.checkOutAt ? formatTime(t.checkOutAt) : '—'}</td>
                  <td className="num">{formatPeso(t.fee)}</td>
                  <td className={`st-col ${t.paymentStatus === 'paid' ? 'paid' : 'unpaid'}`}>{t.paymentStatus === 'paid' ? (<>Paid{t.paidAt && startOfDay(t.paidAt) !== g.day ? <span className="hist-paid-at">{formatShortDate(t.paidAt)}</span> : null}</>) : (<>Unpaid{t.status === 'parked' ? <span className="hist-parked">Parked</span> : null}</>)}</td>
                  <td className="act-col">{t.paymentStatus === 'paid' ? (t.paidAt != null && isToday(t.paidAt)
                    ? <button className="hist-undo" disabled={pendingId === t.id} onClick={() => unsettle(t)} aria-label={`Mark ${t.plateNumber} unpaid`}>Undo</button>
                    : '—') : <button className="hist-settle" disabled={pendingId === t.id} onClick={() => settle(t)} aria-label={`Settle ${t.plateNumber}`}>Settle</button>}</td>
                </tr>))}
              </tbody>
            </table>
          </section>
        ))}
        <div className="hist-grand">Total ({list.length}) · {f === 'unpaid' ? <>Due {formatPeso(due)}</> : <>{formatPeso(total)} collected</>}</div>
      </div>}
  </div>);
}
