import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export type ToastKind = 'ok' | 'err';
interface ToastState { id: number; text: string; kind: ToastKind; }
interface ToastApi { ok: (text: string) => void; err: (text: string) => void; }

const ToastContext = createContext<ToastApi>({ ok: () => {}, err: () => {} });
export const useToast = (): ToastApi => useContext(ToastContext);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string, kind: ToastKind) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setToast({ id: nextId++, text, kind });
    if (kind === 'ok') timer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const api: ToastApi = {
    ok: text => show(text, 'ok'),
    err: text => show(text, 'err'),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast && (
        <p key={toast.id} className={`toast${toast.kind === 'err' ? ' err' : ''}`}
          role={toast.kind === 'err' ? 'alert' : 'status'}
          onClick={() => { if (timer.current) clearTimeout(timer.current); setToast(null); }}>
          {toast.text}
        </p>
      )}
    </ToastContext.Provider>
  );
}
