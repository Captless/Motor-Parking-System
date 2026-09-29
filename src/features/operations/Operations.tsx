import { useEffect, useRef, useState } from 'react';
import { create, getActive, getById, checkout, markPaid, markUnpaid, renamePlate, getDailyStats } from '../../db/parkingRepository';
import type { DailyStats, ParkingTransaction } from '../../types/parking';
import { formatPeso } from '../../lib/currency';
import { formatDuration, formatTime, formatFullDate } from '../../lib/dates';
import { useToast } from '../../app/toast';

export default function Operations() {
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [list, setList] = useState<ParkingTransaction[]>([]);
  const [plate, setPlate] = useState('');
  const [q, setQ] = useState('');
  const toast = useToast();
  const [err, setErr] = useState('');
  const [sel, setSel] = useState<ParkingTransaction | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [rowErr, setRowErr] = useState('');
  const cancelRef = useRef(false);

  const refresh = async () => {
    try {
      const [s, a] = await Promise.all([getDailyStats(), getActive(q)]);
      setStats(s); setList(a);
    } catch (e: any) { setErr(String(e.message ?? e)); }
  };
  useEffect(() => { refresh(); }, [q]);

  const park = async () => {
    setBusy(true);
    try {
      const t = await create({ plateNumber: plate });
      setPlate(''); toast.ok(`Parked ${t.plateNumber}.`);
      await refresh();
    } catch (e: any) { toast.err(e.message); }
    finally { setBusy(false); }
  };

  const togglePaid = async (t: ParkingTransaction) => {
    try {
      if (t.paymentStatus === 'paid') await markUnpaid(t.id);
      else await markPaid(t.id);
      await refresh();
      if (sel?.id === t.id) setSel((await getById(t.id)) ?? null);
    } catch (e: any) { toast.err(e.message); }
  };

  const doCheckout = async () => {
    if (!sel) return;
    try {
      await checkout(sel.id);
      setSel(null);
      toast.ok(`Checked out ${sel.plateNumber}.`);
      await refresh();
    } catch (e: any) { toast.err(e.message); }
  };

  const savePlate = async (t: ParkingTransaction) => {
    if (cancelRef.current) { cancelRef.current = false; return; }
    setRowErr('');
    try {
      const r = await renamePlate(t.id, draft);
      setEditingId(null); toast.ok(`Plate updated to ${r.plateNumber}.`); refresh();
      if (sel?.id === t.id) setSel(r);
    } catch (e: any) { setRowErr(e.message); }
  };

  if (err) return <p className="counter-error">{err}</p>;

  return (
    <div className="counter">
      <section className="counter-head" aria-live="polite">
        {stats ? (
          <>
            <p className="counter-date">{formatFullDate(Date.now())}</p>
            {(() => {
              const unpaid = list.filter(t => t.paymentStatus !== 'paid').reduce((s, t) => s + t.fee, 0);
              return (<div className="stat-strip">
                <div className="stat-cell"><p className="stat-val">{stats.parked}</p><p className="stat-label">Parked</p></div>
                <div className="stat-cell"><p className="stat-val">{formatPeso(stats.collectedToday)}</p><p className="stat-label">Collected</p></div>
                <div className="stat-cell"><p className="stat-val unpaid">{formatPeso(unpaid)}</p><p className="stat-label">Unpaid</p></div>
              </div>);
            })()}
          </>
        ) : <p className="counter-sub">Loading…</p>}
      </section>

      <section className="counter-entry" aria-label="Park a motorcycle">
        <label className="counter-label" htmlFor="plate">Plate number</label>
        <input
          id="plate" className="counter-input" value={plate}
          onChange={e => setPlate(e.target.value)} placeholder="ENTER PLATE"
          autoCapitalize="characters" autoComplete="off"
          onKeyDown={e => { if (e.key === 'Enter') park(); }}
        />
        <button className="counter-park" onClick={park} disabled={busy || !plate.trim()}>
          Park
        </button>
      </section>

      <section className="counter-queue" aria-label="Parked queue">
        <div className="counter-queue-head">
          <h2>Queue{stats ? ` (${stats.parked})` : ''}</h2>
          <input
            className="counter-search" value={q}
            onChange={e => setQ(e.target.value)} placeholder="Search plate…"
            aria-label="Search parked plates"
          />
        </div>
        {list.length === 0
          ? <p className="counter-empty">{q ? 'No match. Try another plate.' : 'Queue empty. Park the next bike above.'}</p>
          : <div className="counter-queue-list">
            {list.map(t => (
            <div key={t.id} className="counter-row">
              <div className="counter-row-top">
                {editingId === t.id ? (
                  <input className="counter-plate-input" value={draft} autoFocus style={{ width: `calc(${Math.max(draft.length, 1)}ch + ${Math.max(draft.length, 1) * 0.025}em)` }}
                    ref={el => { if (el && !el.dataset.sel) { el.dataset.sel = '1'; el.select(); } }}
                    onChange={e => setDraft(e.target.value)} aria-label="Edit plate number"
                    autoCapitalize="characters" autoComplete="off"
                    onBlur={() => savePlate(t)}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { cancelRef.current = true; setEditingId(null); } }} />
                ) : (
                  <button className="counter-plate editable" title="Click to edit" onClick={() => { setEditingId(t.id); setDraft(t.plateNumber); setRowErr(''); }} aria-label={`Edit plate ${t.plateNumber}. Click to edit.`}>{t.plateNumber}</button>
                )}
                <span className={`counter-status ${t.paymentStatus === 'paid' ? 'is-paid' : ''}`}>{t.paymentStatus === 'paid' ? 'Paid ✓' : 'Unpaid'}</span>
                <span className="counter-meta">{formatDuration(t.checkInAt)} · {formatPeso(t.fee)}</span>
              </div>
              {editingId === t.id && rowErr ? <p className="counter-row-error">{rowErr}</p> : null}
              <div className="counter-row-actions">
                <button
                  className={`counter-toggle${t.paymentStatus === 'paid' ? ' is-paid' : ''}`}
                  onClick={() => togglePaid(t)}
                  aria-pressed={t.paymentStatus === 'paid'}
                  aria-label={t.paymentStatus === 'paid' ? `Mark ${t.plateNumber} unpaid` : `Mark ${t.plateNumber} paid`}
                >
                  {t.paymentStatus === 'paid' ? 'Paid ✓' : 'Mark Paid'}
                </button>
                <button className="counter-out" onClick={() => setSel(t)}>
                  Check Out
                </button>
              </div>
            </div>
            ))}
          </div>}
      </section>

      {sel && (
        <div className="counter-sheet-backdrop" onClick={() => setSel(null)}>
          <div className="counter-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label={`Check out ${sel.plateNumber}`}>
            <p className="counter-sheet-plate">{sel.plateNumber}</p>
            <p className="counter-sheet-sub">In {formatTime(sel.checkInAt)} · {formatDuration(sel.checkInAt)} · {formatPeso(sel.fee)} · {sel.paymentStatus.toUpperCase()}</p>
            <p className="counter-msg">Confirm checkout for {sel.plateNumber}?</p>
            {sel.paymentStatus !== 'paid' && <p className="counter-sub">Unpaid — can settle later from History.</p>}
            <button className="counter-park" onClick={doCheckout}>Confirm checkout</button>
            <button className="counter-link muted" onClick={() => setSel(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
