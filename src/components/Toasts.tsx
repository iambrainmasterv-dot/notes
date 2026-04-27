import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToastItem } from '../hooks/useNotifications';

const TOAST_EXIT_MS = 220;

function ToastRow({
  toast,
  onDismiss,
  durationMs,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
  durationMs: number;
}) {
  const [exiting, setExiting] = useState(false);

  const requestDismiss = useCallback(() => {
    setExiting(true);
  }, []);

  useEffect(() => {
    if (exiting) return;
    const t = window.setTimeout(requestDismiss, durationMs);
    return () => window.clearTimeout(t);
  }, [toast.id, durationMs, exiting, requestDismiss]);

  useEffect(() => {
    if (!exiting) return;
    const t = window.setTimeout(() => onDismiss(toast.id), TOAST_EXIT_MS);
    return () => window.clearTimeout(t);
  }, [exiting, onDismiss, toast.id]);

  return (
    <div
      className={`toast toast-${toast.level}${exiting ? ' toast-exiting' : ''}`}
      role="status"
    >
      <div className="toast-body">
        <strong className="toast-title">{toast.title}</strong>
        <p className="toast-msg">{toast.message}</p>
      </div>
      <button type="button" className="toast-close btn-icon" aria-label="Dismiss" onClick={requestDismiss}>×</button>
    </div>
  );
}

interface Props {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  durationMs?: number;
}

export function Toasts({ toasts, onDismiss, durationMs = 6000 }: Props) {
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const seen = seenIds.current;
    for (const t of toasts) {
      seen.add(t.id);
    }
    for (const id of [...seen]) {
      if (!toasts.some((x) => x.id === id)) seen.delete(id);
    }
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <ToastRow key={t.id} toast={t} onDismiss={onDismiss} durationMs={durationMs} />
      ))}
    </div>
  );
}
