import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

interface ToastInput {
  text: string;
  action?: { label: string; onClick: () => void };
}
interface ToastValue {
  show: (t: ToastInput) => void;
}

const ToastContext = createContext<ToastValue>({ show: () => undefined });

/** One message at a time, bottom right, announced politely. Auto-hides unless it has an action. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastInput & { key: number }) | null>(null);
  const show = useCallback((t: ToastInput) => setToast({ ...t, key: Date.now() }), []);

  useEffect(() => {
    if (!toast || toast.action) return;
    const id = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(id);
  }, [toast]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div role="status" aria-live="polite" className="toast-region">
        {toast && (
          <div className="toast" key={toast.key}>
            <span style={{ flex: 1 }}>{toast.text}</span>
            {toast.action && (
              <button type="button" className="toast-action" onClick={() => { toast.action?.onClick(); setToast(null); }}>
                {toast.action.label}
              </button>
            )}
            <button type="button" className="toast-close" aria-label="Dismiss message" onClick={() => setToast(null)}>×</button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  return useContext(ToastContext);
}
