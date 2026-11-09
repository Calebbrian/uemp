import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Check, CircleX, X } from 'lucide-react';

type Toast = { id: number; kind: 'success' | 'error'; title: string; message?: string };

type ToastApi = { success: (title: string, message?: string) => void; error: (title: string, message?: string) => void };

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (kind: Toast['kind'], title: string, message?: string) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-3), { id, kind, title, message }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4000);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({ success: (t, m) => push('success', t, m), error: (t, m) => push('error', t, m) }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="no-print pointer-events-none fixed right-4 bottom-4 z-[100] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2.5" aria-live="polite">
        {toasts.map((t) =>
          t.kind === 'success' ? (
            <div key={t.id} role="status" className="pointer-events-auto flex items-start gap-3 rounded-lg bg-ink px-4 py-3.5 text-white shadow-overlay">
              <Check className="mt-0.5 size-4 shrink-0 text-[#7FD3A6]" strokeWidth={2.5} aria-hidden />
              <div className="flex-1 text-sm">
                <strong>{t.title}</strong>
                {t.message && <div className="mt-0.5 text-[13px] text-[#C9D1CD]">{t.message}</div>}
              </div>
              <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="cursor-pointer text-[#C9D1CD] hover:text-white">
                <X className="size-4" aria-hidden />
              </button>
            </div>
          ) : (
            <div key={t.id} role="alert" className="pointer-events-auto flex items-start gap-3 rounded-lg border border-danger-line bg-white px-4 py-3.5 text-ink shadow-overlay">
              <CircleX className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
              <div className="flex-1 text-sm">
                <strong className="text-danger-ink">{t.title}</strong>
                {t.message && <div className="mt-0.5 text-[13px] text-muted">{t.message}</div>}
              </div>
              <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="cursor-pointer text-muted hover:text-ink">
                <X className="size-4" aria-hidden />
              </button>
            </div>
          ),
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
