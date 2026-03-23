import { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import type { Note, Task, AppNotification } from '../types';
import { parseDeadline } from '../utils';

export interface ToastItem {
  id: string;
  title: string;
  message: string;
  level: AppNotification['level'];
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Scans active notes/tasks for upcoming deadlines; adds deduped panel entries and one-shot toasts.
 */
export function useNotifications(notes: Note[], tasks: Task[], now: number) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const fired = useRef<Set<string>>(new Set());

  useEffect(() => {
    const items: (Note | Task)[] = [
      ...notes.filter((n) => !n.completed && n.deadline),
      ...tasks.filter((t) => !t.completed && t.deadline),
    ];

    for (const item of items) {
      const deadline = item.deadline!;
      let t: number;
      try {
        t = parseDeadline(deadline);
      } catch {
        continue;
      }
      const ms = t - now;
      if (ms <= 0) continue;

      let level: AppNotification['level'];
      let bucket: string;
      let title: string;
      let message: string;

      if (ms <= HOUR) {
        level = 'danger';
        bucket = '1h';
        title = `${item.type === 'task' ? 'Task' : 'Note'} expiring very soon`;
        message = `"${item.title}" is due within about an hour.`;
      } else if (ms <= DAY) {
        level = 'warning';
        bucket = '24h';
        title = `${item.type === 'task' ? 'Task' : 'Note'} expiring soon`;
        message = `"${item.title}" is due within 24 hours.`;
      } else {
        continue;
      }

      const dedupeKey = `${item.type}:${item.id}:${bucket}`;
      if (fired.current.has(dedupeKey)) continue;
      fired.current.add(dedupeKey);

      const n: AppNotification = {
        id: uuid(),
        level,
        title,
        message,
        createdAt: Date.now(),
        read: false,
        dedupeKey,
        itemType: item.type,
        itemId: item.id,
      };

      setNotifications((prev) => [n, ...prev].slice(0, 200));
      setToasts((prev) => [...prev, { id: n.id, title: n.title, message: n.message, level: n.level }]);
    }
  }, [notes, tasks, now]);

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
