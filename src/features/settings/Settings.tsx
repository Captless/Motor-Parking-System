import { useEffect, useState } from 'react';
import { getSettings, updateSettings, exportBackup, importBackup, clearAll, getActive, getHistory, getActiveDays, getDayRecords } from '../../db/parkingRepository';
import type { ParkingTransaction } from '../../types/parking';
import { dayReportCSV, dayReportHTML, dayReportTXT, reportFilename, backupFilename, downloadTextFile, summarizeDay, type ReportFormat } from '../../lib/report';
import { formatPeso } from '../../lib/currency';
import { formatFullDate, eachDay, startOfDay } from '../../lib/dates';
import { useToast } from '../../app/toast';
export default function Settings() {
  const toast = useToast();
  const [fee, setFee] = useState(''); const [confirmClear, setConfirmClear] = useState(false);
  const [counts, setCounts] = useState(''); const [storage, setStorage] = useState('');
  const [days, setDays] = useState<{ day: number; rows: ParkingTransaction[] }[]>([]);
  const [format, setFormat] = useState<ReportFormat>('txt');
  const [showAll, setShowAll] = useState(false);
  const [lastBackup, setLastBackup] = useState<number | null>(null);
/** Whole calendar days between two instants — immune to 23/25-hour DST days. */
const dayDiff = (a: number, b: number): number => eachDay(startOfDay(b), startOfDay(a)).length - 1;
const backupStale = (ts: number | null): boolean => {
  if (ts == null) return (counts !== '' && !counts.startsWith('0 records'));
  return dayDiff(Date.now(), ts) > 7;
};
const backupLabel = (ts: number | null): string => {
  if (ts == null) return 'Last backup: never';
  const d = dayDiff(Date.now(), ts);
  const when = d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
  return `Last backup: ${when}`;
};
  const buildDateLabel = (): string | null => {
    const iso = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? `${m[2]}-${m[3]}-${m[1].slice(2)}` : null;
  };
  const loadMeta = async (live: () => boolean) => {
    try {
      const [a, h, b, ds] = await Promise.all([getActive(), getHistory(), exportBackup(), getActiveDays()]);
      if (!live()) return;
      setCounts(`${a.length + h.length} records`);
      const bytes = new Blob([JSON.stringify(b)]).size;
      setStorage(bytes < 1024 ? `~${bytes} bytes` : `~${(bytes / 1024).toFixed(1)} KB`);
      const rows = await Promise.all(ds.map(async day => ({ day, rows: await getDayRecords(day) })));
      if (!live()) return;
      setDays(rows);
    } catch (e: any) {
      if (live()) toast.err(String(e?.message ?? e));
    }
  };
  const downloadDay = async (day: number) => {
    try {
      const rows = await getDayRecords(day);
      const mime = format === 'csv' ? 'text/csv' : format === 'html' ? 'text/html' : 'text/plain;charset=utf-8';
      const body = format === 'csv' ? dayReportCSV(day, rows) : format === 'html' ? dayReportHTML(day, rows) : dayReportTXT(day, rows);
      downloadTextFile(reportFilename(day, format), body, mime);
      toast.ok('Report downloaded.');
    } catch (e: any) { toast.err(e.message); }
  };
  useEffect(() => {
    let live = true;
    const isLive = () => live;
    getSettings()
      .then(s => { if (!live) return; setFee(String(s.parkingFee)); setLastBackup(s.lastBackupAt ?? null); })
      .catch(e => { if (live) toast.err(String(e?.message ?? e)); });
    loadMeta(isLive);
    return () => { live = false; };
  }, []);
  const saveFee = async () => {
    try { const s = await updateSettings({ parkingFee: Number(fee) }); setFee(String(s.parkingFee)); toast.ok('Parking fee saved.'); }
    catch (e: any) { toast.err(e.message); }
  };
  const stampBackup = async () => { try { const s = await updateSettings({ lastBackupAt: Date.now() }); setLastBackup(s.lastBackupAt ?? null); } catch { /* reminder best-effort */ } };
  const doExport = async () => { const b = await exportBackup();
    downloadTextFile(backupFilename(), JSON.stringify(b, null, 2), 'application/json'); await stampBackup(); };
  const doImport = async (file: File) => { try { const j = JSON.parse(await file.text()); if (!confirm('Replace all local data with this backup?')) return; await importBackup(j); await stampBackup(); toast.ok('Backup restored.'); loadMeta(() => true); } catch (e: any) { toast.err(e.message); } };
  const doClear = async () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    try {
      const b = await exportBackup();
      downloadTextFile(backupFilename(), JSON.stringify(b, null, 2), 'application/json');
      await stampBackup();
    } catch { /* backup best-effort; clear proceeds only on user intent */ }
    await clearAll(); setConfirmClear(false); setLastBackup(null); toast.ok('Backup downloaded — all data cleared.'); loadMeta(() => true);
  };
  const buildDate = buildDateLabel();
  return (<div className="space-y-4"><h1 className="text-xl font-bold">Settings</h1>
    <div className="card space-y-3"><p className="font-semibold">Parking Fee</p>
      <label className="block text-sm font-semibold">Fee (₱)<input className="input mt-1" inputMode="numeric" value={fee} onChange={e => setFee(e.target.value)} /></label>
      <button className="w-full py-3 bg-gray-900 text-white rounded-xl font-semibold" onClick={saveFee}>Save</button>
    </div>
    <div className="card space-y-2"><p className="font-semibold">Data & storage</p>
      <button className="w-full py-3 border rounded-xl font-semibold" onClick={doExport}>Export Backup</button>
      <label className="w-full py-3 border rounded-xl font-semibold text-center block cursor-pointer">Import Backup<input type="file" accept="application/json" className="hidden" onChange={e => e.target.files?.[0] && doImport(e.target.files[0])} /></label>
      <div className="pt-1 space-y-1"><p className="text-sm text-gray-600">{counts ? `${counts} · backup ${storage}` : '…'}</p><p className={`text-sm font-semibold ${backupStale(lastBackup) ? 'text-amber-800' : 'text-gray-600'}`}>{backupLabel(lastBackup)}</p><p className="text-sm text-gray-400">Local device only · v{__APP_VERSION__}{buildDate ? ` (updated ${buildDate})` : ''}</p></div></div>
    <div className="card space-y-3"><p className="font-semibold">Daily reports</p>
      <div className="hist-filter" role="group" aria-label="Report format">
        {(['csv', 'html', 'txt'] as const).map(x => <button key={x} onClick={() => setFormat(x)} aria-pressed={format === x} className={`hist-chip${format === x ? ' active' : ''}`}>{x.toUpperCase()}</button>)}
      </div>
      {days.length === 0 && <p className="text-sm text-gray-500">No days with data yet.</p>}
      {(showAll ? days : days.slice(0, 3)).map(d => {
        const s = summarizeDay(d.rows);
        return (
        <div key={d.day} className="report-row">
          <div><p className="font-bold">{formatFullDate(d.day)}</p>
            <p className="text-sm text-gray-500">{s.total} records · {formatPeso(s.collected)}{s.unpaidCount > 0 ? ` · ${formatPeso(s.unpaidAmount)} unpaid` : ''}</p></div>
          <button className="report-dl" onClick={() => downloadDay(d.day)}>Download</button>
        </div>); })}
      {days.length > 3 && (
        <button className="counter-link muted" onClick={() => setShowAll(v => !v)}>
          {showAll ? 'Show less' : `Show all ${days.length} days`}
        </button>)}
    </div>
    <div className="card">{!confirmClear ? <button className="w-full py-3 text-red-600 font-semibold" onClick={doClear}>Clear All Data</button>
      : <><p className="text-sm font-semibold">Delete all local parking data? A full backup downloads automatically first.</p>
        <div className="flex gap-2 mt-2"><button className="flex-1 py-3 border rounded-xl" onClick={() => setConfirmClear(false)}>Cancel</button><button className="flex-1 py-3 bg-red-600 text-white rounded-xl font-semibold" onClick={doClear}>Delete Everything</button></div></>}</div>
  </div>);
}
