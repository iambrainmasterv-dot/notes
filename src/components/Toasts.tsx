import { useEffect } from 'react';
import type { ToastItem } from '../hooks/useNotifications';

function ToastRow({
  toast,
  onDismiss,
  durationMs,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
  durationMs: number;
}) {
  useEffect(() => {
    const t = window.setTimeout(() => onDismiss(toast.id), durationMs);
    return () => clearTimeout(t);
  }, [toast.id, durationMs, onDismiss]);

  return (
    <div className={`toast toast-${toast.level}`} role="status">
      <div className="toast-body">
        <strong className="toast-title">{toast.title}</strong>
        <p className="toast-msg">{toast.message}</p>
      </div>
      <button type="button" className="toast-close btn-icon" aria-label="Dismiss" onClick={() => onDismiss(toast.id)}>×</button>
    </div>
  );
}

interface Props {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  durationMs?: number;
}

export function Toasts({ toasts, onDismiss, durationMs = 6000 }: Props) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <ToastRow key={t.id} toast={t} onDismiss={onDismiss} durationMs={durationMs} />
      ))}
    </div>
  );
}
