import { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import type { AppNotification } from '../types';
import type { AppSoundId } from '../audio/appSounds';
import {
  scanDeadlinePanelCandidates,
  staleCompletedPanelCandidate,
  type StaleCompletedInput,
} from '../notifications/rules';
import {
  addDismissedToastDedupeKey,
  getDismissedToastDedupeKeys,
  pruneDismissedToastDedupeKeys,
} from '../notifications/toastDismissStorage';

export interface ToastItem {
  id: string;
  title: string;
  message: string;
  level: AppNotification['level'];
  sound?: AppSoundId;
}

export type { StaleCompletedInput };

/**
 * Scans active notes/tasks for upcoming deadlines; adds deduped panel entries and toasts.
 * Dismissed or read toasts stay hidden across sessions until the underlying item/deadline changes or expires.
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
    const staleOn = staleCompletedPanelCandidate(staleCompleted, now) != null;
    pruneDismissedToastDedupeKeys(notes, tasks, now, staleOn);
    const dismissed = getDismissedToastDedupeKeys();

    const candidates = scanDeadlinePanelCandidates(notes, tasks, now);
    for (const c of candidates) {
      if (dismissed.has(c.dedupeKey)) continue;
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
      setToasts((prev) => [
        ...prev,
        {
          id: n.id,
          title: n.title,
          message: n.message,
          level: n.level,
          sound: 'deadlineAlert',
        },
      ]);
    }

    const sc = staleCompletedPanelCandidate(staleCompleted, now);
    if (!sc) return;
    const dedupeKey = sc.dedupeKey;
    if (dismissed.has(dedupeKey)) return;
    if (fired.current.has(dedupeKey)) return;
    fired.current.add(dedupeKey);

    const n: AppNotification = {
      id: uuid(),
      level: sc.level,
      title: sc.title,
      message: sc.message,
      createdAt: Date.now(),
      read: false,
      dedupeKey,
    };
    setNotifications((prev) => [n, ...prev].slice(0, 200));
    setToasts((prev) => [
      ...prev,
      {
        id: n.id,
        title: n.title,
        message: n.message,
        level: n.level,
        sound: 'completedTabReminder',
      },
    ]);
  }, [notes, tasks, now, staleCompleted]);

  useEffect(() => {
    if (staleCompleted?.completedCount === 0) {
      fired.current.delete('stale-completed-tab');
    }
  }, [staleCompleted?.completedCount]);

  const dismissToast = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n;
        addDismissedToastDedupeKey(n.dedupeKey);
        return { ...n, read: true };
      }),
    );
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n;
        addDismissedToastDedupeKey(n.dedupeKey);
        return { ...n, read: true };
      }),
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      for (const n of prev) {
        if (!n.read) addDismissedToastDedupeKey(n.dedupeKey);
      }
      return prev.map((n) => ({ ...n, read: true }));
    });
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
