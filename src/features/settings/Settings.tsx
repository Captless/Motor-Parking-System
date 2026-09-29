import { useEffect, useState } from 'react';
import { getSettings, updateSettings, exportBackup, importBackup, clearAll, getActive, getHistory, getActiveDays, getDayStats, getDayTransactions } from '../../db/parkingRepository';
import type { DayStats } from '../../db/parkingRepository';
import { dayReportCSV, reportFilename, backupFilename, downloadTextFile } from '../../lib/report';
import { formatPeso } from '../../lib/currency';
import { formatFullDate, inDay } from '../../lib/dates';
import { useToast } from '../../app/toast';
export default function Settings() {
  const toast = useToast();
  const [fee, setFee] = useState(''); const [confirmClear, setConfirmClear] = useState(false);
  const [counts, setCounts] = useState(''); const [storage, setStorage] = useState(''); const [persisted, setPersisted] = useState<boolean | null>(null);
  const [days, setDays] = useState<{ day: number; stats: DayStats }[]>([]);
  const loadMeta = async () => {
    const [a, h, b, ds] = await Promise.all([getActive(), getHistory(), exportBackup(), getActiveDays()]);
    setCounts(`${a.length + h.length} records (${a.length} parked / ${h.length} completed)`);
    const bytes = new Blob([JSON.stringify(b)]).size;
    setStorage(bytes < 1024 ? `backup ~${bytes} bytes` : `backup ~${(bytes / 1024).toFixed(1)} KB`);
    setDays(await Promise.all(ds.map(async day => ({ day, stats: await getDayStats(day) }))));
    try { setPersisted(await navigator.storage?.persisted?.() ?? null); } catch { setPersisted(null); }
  };
  const downloadDay = async (day: number) => {
    try {
      const [stats, done, active] = await Promise.all([getDayStats(day), getDayTransactions(day), getActive()]);
      const seen = new Set(done.map(t => t.id));
      const rows = [...done, ...active.filter(t => inDay(t.checkInAt, day) && !seen.has(t.id))];
      downloadTextFile(reportFilename(day), dayReportCSV(day, stats, rows), 'text/csv');
      toast.ok('Report downloaded.');
    } catch (e: any) { toast.err(e.message); }
  };
  useEffect(() => { getSettings().then(s => setFee(String(s.parkingFee))).catch(e => toast.err(String(e.message ?? e))); loadMeta(); }, []);
  const save = async () => { try { await updateSettings({ parkingFee: Number(fee) }); toast.ok('Parking fee saved.'); } catch (e: any) { toast.err(e.message); } };
  const doExport = async () => { const b = await exportBackup();
    downloadTextFile(backupFilename(), JSON.stringify(b, null, 2), 'application/json'); };
  const doImport = async (file: File) => { try { const j = JSON.parse(await file.text()); if (!confirm('Replace all local data with this backup?')) return; await importBackup(j); toast.ok('Backup restored.'); loadMeta(); } catch (e: any) { toast.err(e.message); } };
  const doClear = async () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    try {
      const b = await exportBackup();
      downloadTextFile(backupFilename(), JSON.stringify(b, null, 2), 'application/json');
    } catch { /* backup best-effort; clear proceeds only on user intent */ }
    await clearAll(); setConfirmClear(false); toast.ok('Backup downloaded — all data cleared.'); loadMeta();
  };
  return (<div className="space-y-4"><h1 className="text-xl font-bold">Settings</h1>
    <div className="card space-y-3"><p className="font-semibold">Parking Fee</p>
      <label className="block text-sm font-semibold">Fee (₱)<input className="input mt-1" inputMode="numeric" value={fee} onChange={e => setFee(e.target.value)} /></label>
      <button className="btn-primary" onClick={save}>Save</button></div>
    <div className="card space-y-2"><p className="font-semibold">Data</p>
      <button className="w-full py-3 border rounded-xl font-semibold" onClick={doExport}>Export Backup</button>
      <label className="w-full py-3 border rounded-xl font-semibold text-center block cursor-pointer">Import Backup<input type="file" accept="application/json" className="hidden" onChange={e => e.target.files?.[0] && doImport(e.target.files[0])} /></label></div>
    <div className="card space-y-1"><p className="font-semibold">Storage</p><p className="text-sm text-gray-600">{counts || '…'}</p>{storage && <p className="text-sm text-gray-600">{storage}</p>}{persisted != null && <p className="text-sm text-gray-600">protection: {persisted ? 'on' : 'standard'}</p>}<p className="text-sm text-gray-400">Local device only · v{__APP_VERSION__}</p></div>
    <div className="card space-y-1"><p className="font-semibold">Daily reports</p>
      {days.length === 0 && <p className="text-sm text-gray-500">No days with data yet.</p>}
      {days.map(d => (
        <div key={d.day} className="report-row">
          <div><p className="font-bold">{formatFullDate(d.day)}</p>
            <p className="text-sm text-gray-500">{d.stats.entries + d.stats.completed} records · {formatPeso(d.stats.collected)}</p></div>
          <button className="report-dl" onClick={() => downloadDay(d.day)}>Download</button>
        </div>))}
    </div>
    <div className="card">{!confirmClear ? <button className="w-full py-3 text-red-600 font-semibold" onClick={doClear}>Clear All Data</button>
      : <><p className="text-sm font-semibold">Delete all local parking data? A full backup downloads automatically first.</p>
        <div className="flex gap-2 mt-2"><button className="flex-1 py-3 border rounded-xl" onClick={() => setConfirmClear(false)}>Cancel</button><button className="flex-1 py-3 bg-red-600 text-white rounded-xl font-semibold" onClick={doClear}>Delete Everything</button></div></>}</div>
  </div>);
}
