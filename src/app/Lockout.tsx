import { useState, type ReactElement } from 'react';
import { exportBackup } from '../db/parkingRepository';
import { backupFilename, downloadTextFile } from '../lib/report';
import { useToast } from './toast';
import { LOCK_TITLE } from '../lib/access';

/** Lock wall: service message plus data export. No nav, no operations. */
export default function Lockout(): ReactElement {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const doExport = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const b = await exportBackup();
      downloadTextFile(backupFilename(), JSON.stringify(b, null, 2), 'application/json');
      toast.ok('Backup downloaded.');
    } catch (e: unknown) {
      toast.err(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center space-y-4">
      <h1 className="text-xl font-bold">{LOCK_TITLE}</h1>
      <button className="w-full py-3 border rounded-xl font-semibold" onClick={doExport} disabled={busy}>
        {busy ? 'Preparing…' : 'Export Backup'}
      </button>
    </div>
  );
}
