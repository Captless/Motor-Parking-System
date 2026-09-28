import { useEffect, useState } from 'react';
import { getSettings, updateSettings, exportBackup, importBackup, clearAll, getActive, getHistory } from '../../db/parkingRepository';
export default function Settings() {
  const [fee, setFee] = useState(''); const [msg, setMsg] = useState(''); const [confirmClear, setConfirmClear] = useState(false);
  const [counts, setCounts] = useState(''); const [storage, setStorage] = useState('');
  const loadMeta = async () => {
    const [a, h, b] = await Promise.all([getActive(), getHistory(), exportBackup()]);
    setCounts(`${a.length + h.length} records (${a.length} parked / ${h.length} completed)`);
    const bytes = new Blob([JSON.stringify(b)]).size;
    setStorage(bytes < 1024 ? `backup ~${bytes} bytes` : `backup ~${(bytes / 1024).toFixed(1)} KB`);
  };
  useEffect(() => { getSettings().then(s => setFee(String(s.parkingFee))).catch(e => setMsg(String(e.message ?? e))); loadMeta(); }, []);
  const save = async () => { try { await updateSettings({ parkingFee: Number(fee) }); setMsg('Parking fee saved.'); } catch (e: any) { setMsg(e.message); } };
  const doExport = async () => { const b = await exportBackup(); const d = new Date(); const f = `motor-parking-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' })); a.download = f; a.click(); };
  const doImport = async (file: File) => { try { const j = JSON.parse(await file.text()); if (!confirm('Replace all local data with this backup?')) return; await importBackup(j); setMsg('Backup restored.'); loadMeta(); } catch (e: any) { setMsg(e.message); } };
  const doClear = async () => { if (!confirmClear) { setConfirmClear(true); return; } await clearAll(); setConfirmClear(false); setMsg('All data cleared.'); loadMeta(); };
  return (<div className="space-y-4"><h1 className="text-xl font-bold">Settings</h1>
    {msg && <p className="text-sm font-medium">{msg}</p>}
    <div className="card space-y-3"><p className="font-semibold">Parking Fee</p>
      <label className="block text-sm font-semibold">Fee (₱)<input className="input mt-1" inputMode="numeric" value={fee} onChange={e => setFee(e.target.value)} /></label>
      <button className="btn-primary" onClick={save}>Save</button></div>
    <div className="card space-y-2"><p className="font-semibold">Data</p>
      <button className="w-full py-3 border rounded-xl font-semibold" onClick={doExport}>Export Backup</button>
      <label className="w-full py-3 border rounded-xl font-semibold text-center block cursor-pointer">Import Backup<input type="file" accept="application/json" className="hidden" onChange={e => e.target.files?.[0] && doImport(e.target.files[0])} /></label></div>
    <div className="card space-y-1"><p className="font-semibold">Storage</p><p className="text-sm text-gray-600">{counts || '…'}</p>{storage && <p className="text-sm text-gray-600">{storage}</p>}<p className="text-sm text-gray-400">Local device only · v1.0.0</p></div>
    <div className="card">{!confirmClear ? <button className="w-full py-3 text-red-600 font-semibold" onClick={doClear}>Clear All Data</button>
      : <><p className="text-sm font-semibold">Delete all local parking data? This cannot be undone unless you have a backup.</p>
        <div className="flex gap-2 mt-2"><button className="flex-1 py-3 border rounded-xl" onClick={() => setConfirmClear(false)}>Cancel</button><button className="flex-1 py-3 bg-red-600 text-white rounded-xl font-semibold" onClick={doClear}>Delete Everything</button></div></>}</div>
  </div>);
}
