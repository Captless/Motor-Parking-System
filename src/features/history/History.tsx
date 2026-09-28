import { useEffect, useMemo, useState } from 'react'; import { getHistory } from '../../db/parkingRepository';
import type { ParkingTransaction } from '../../types/parking'; import { formatPeso } from '../../lib/currency'; import { formatDuration, formatTime, formatFullDate } from '../../lib/dates';
import { groupByDay } from '../../lib/history';
export default function History() {
  const [list, setList] = useState<ParkingTransaction[]>([]); const [q, setQ] = useState(''); const [f, setF] = useState<'all' | 'paid' | 'unpaid'>('all');
  useEffect(() => { getHistory(q, f).then(setList); }, [q, f]);
  const groups = useMemo(() => groupByDay(list), [list]);
  const total = useMemo(() => list.filter(t => t.paymentStatus === 'paid').reduce((s, t) => s + t.fee, 0), [list]);
  return (<div className="hist">
    <div className="hist-head">
      <div><h1>History</h1><p className="hist-sub">{list.length} records · {formatPeso(total)} collected</p></div>
    </div>
    <div className="hist-toolbar">
      <input className="hist-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search plate…" aria-label="Search history by plate" />
      <div className="hist-filter" role="group" aria-label="Payment filter">
        {(['all', 'paid', 'unpaid'] as const).map(x => <button key={x} onClick={() => setF(x)} aria-pressed={f === x} className={`hist-chip${f === x ? ' active' : ''}`}>{x[0].toUpperCase() + x.slice(1)}</button>)}
      </div>
    </div>
    {list.length === 0
      ? <p className="hist-empty">{q || f !== 'all' ? 'No match. Clear search or filter.' : 'No history yet. Checked-out bikes appear here.'}</p>
      : <div className="hist-scroll">
        {groups.map(g => (
          <section key={g.day} className="hist-batch" aria-label={formatFullDate(g.day)}>
            <div className="hist-batch-head"><span>{formatFullDate(g.day)}</span><span>{g.items.length} · {formatPeso(g.collected)}</span></div>
            <table className="hist-table">
              <thead><tr><th scope="col">Plate</th><th scope="col">In</th><th scope="col">Out</th><th scope="col">Time</th><th scope="col" className="num">Fee</th><th scope="col">Status</th></tr></thead>
              <tbody>{g.items.map(t => (
                <tr key={t.id}>
                  <td className="plate">{t.plateNumber}</td>
                  <td>{formatTime(t.checkInAt)}</td>
                  <td>{t.checkOutAt ? formatTime(t.checkOutAt) : '—'}</td>
                  <td>{t.checkOutAt ? formatDuration(t.checkInAt, t.checkOutAt) : '—'}</td>
                  <td className="num">{formatPeso(t.fee)}</td>
                  <td className={t.paymentStatus === 'paid' ? 'paid' : 'unpaid'}>{t.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}</td>
                </tr>))}
              </tbody>
            </table>
          </section>
        ))}
        <div className="hist-grand">Total ({list.length}) · {formatPeso(total)}</div>
      </div>}
  </div>);
}
