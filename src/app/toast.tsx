import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type ToastKind = 'ok' | 'err';
interface ToastState { id: number; text: string; kind: ToastKind; }
interface ToastApi { ok: (text: string) => void; err: (text: string) => void; }

const ToastContext = createContext<ToastApi>({ ok: () => {}, err: () => {} });
export const useToast = (): ToastApi => useContext(ToastContext);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toastRef = useRef<ToastState | null>(null);
  const show = useCallback((text: string, kind: ToastKind) => {
    if (kind === 'ok' && toastRef.current?.kind === 'err') return;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const next = { id: nextId++, text, kind };
    toastRef.current = next;
    setToast(next);
    timer.current = setTimeout(() => { toastRef.current = null; setToast(null); }, kind === 'ok' ? 3000 : 6000);
  }, []);
  const dismiss = useCallback(() => { if (timer.current) clearTimeout(timer.current); toastRef.current = null; setToast(null); }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const api: ToastApi = useMemo(() => ({
    ok: text => show(text, 'ok'),
    err: text => show(text, 'err'),
  }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast && (
        <p key={toast.id} className={`toast${toast.kind === 'err' ? ' err' : ''}`}
          role={toast.kind === 'err' ? 'alert' : 'status'}
          onClick={dismiss}>
          {toast.text}
        </p>
      )}
    </ToastContext.Provider>
  );
}
