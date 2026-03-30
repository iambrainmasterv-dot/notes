import { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import type { AppNotification } from '../types';
import {
  scanDeadlinePanelCandidates,
  staleCompletedPanelCandidate,
  type StaleCompletedInput,
} from '../notifications/rules';

export interface ToastItem {
  id: string;
  title: string;
  message: string;
  level: AppNotification['level'];
}

export type { StaleCompletedInput };

/**
 * Scans active notes/tasks for upcoming deadlines; adds deduped panel entries and one-shot toasts.
 */
export function useNotifications(
  notes: Parameters<typeof scanDeadlinePanelCandidates>[0],
  tasks: Parameters<typeof scanDeadlinePanelCandidates>[1],
  now: number,
  staleCompleted?: StaleCompletedInput | null,
) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const fired = useRef<Set<string>>(new Set());

  useEffect(() => {
    const candidates = scanDeadlinePanelCandidates(notes, tasks, now);
    for (const c of candidates) {
      if (fired.current.has(c.dedupeKey)) continue;
      fired.current.add(c.dedupeKey);

      const n: AppNotification = {
        id: uuid(),
        level: c.level,
        title: c.title,
        message: c.message,
        createdAt: Date.now(),
        read: false,
        dedupeKey: c.dedupeKey,
        itemType: c.itemType,
        itemId: c.itemId,
      };

      setNotifications((prev) => [n, ...prev].slice(0, 200));
      setToasts((prev) => [...prev, { id: n.id, title: n.title, message: n.message, level: n.level }]);
    }
  }, [notes, tasks, now]);

  useEffect(() => {
    const c = staleCompletedPanelCandidate(staleCompleted, now);
    if (!c) return;
    const dedupeKey = c.dedupeKey;
    if (fired.current.has(dedupeKey)) return;
    fired.current.add(dedupeKey);

    const n: AppNotification = {
      id: uuid(),
      level: c.level,
      title: c.title,
      message: c.message,
      createdAt: Date.now(),
      read: false,
      dedupeKey,
    };
    setNotifications((prev) => [n, ...prev].slice(0, 200));
    setToasts((prev) => [...prev, { id: n.id, title: n.title, message: n.message, level: n.level }]);
  }, [notes, tasks, now, staleCompleted]);

  useEffect(() => {
    if (staleCompleted?.completedCount === 0) {
      fired.current.delete('stale-completed-tab');
    }
  }, [staleCompleted?.completedCount]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    notifications,
    unreadCount,
    toasts,
    dismissToast,
    markRead,
    markAllRead,
  };
}
