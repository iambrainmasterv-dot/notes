import type { ActionPerformed } from '@capacitor/local-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { api, getToken } from '../api/client';
import { storage } from '../storage';
import { notifyAndroidDataChanged } from './syncBridge';
import { pinNotificationId } from './notifIds';
import { schedulePinNotificationShow } from './pinLocalNotification';
import { forgetPinSignature } from './pinScheduleState';
import { taskFromApiRow } from '../hooks/useTasks';
import { cancelNativePin, isAndroidNativePinPlugin } from '../native/NotetasksPinNotifications';

export async function dismissPinNotification(itemType: 'note' | 'task', itemId: string): Promise<void> {
  forgetPinSignature(itemType, itemId);
  const id = pinNotificationId(itemType, itemId);
  if (isAndroidNativePinPlugin()) {
    await cancelNativePin(itemType, itemId);
    return;
  }
  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
    await LocalNotifications.removeDeliveredNotifications({
      notifications: [{ id, title: '', body: '' }],
    });
  } catch {
    /* ignore */
  }
}

function isGuestStorage(): boolean {
  return !getToken();
}

export async function handleLocalNotificationAction(action: ActionPerformed): Promise<void> {
  const extra = action.notification.extra as Record<string, unknown> | undefined;
  if (!extra || extra.notetasks !== true || extra.kind !== 'pin') return;

  const itemType = extra.itemType as string | undefined;
  const itemId = extra.itemId as string | undefined;
  if (itemType !== 'note' && itemType !== 'task') return;
  if (!itemId) return;

  const guest = isGuestStorage();

  try {
    if (action.actionId === 'complete') {
      const ts = new Date().toISOString();
      if (itemType === 'note') {
        if (guest) {
          const notes = storage.getNotes(true);
          storage.saveNotes(
            notes.map((n) => (n.id === itemId ? { ...n, completed: true, completedAt: ts } : n)),
            true,
          );
        } else {
          await api.updateNote(itemId, { completed: true, completed_at: ts });
        }
      } else {
        if (guest) {
          const tasks = storage.getTasks(true);
          storage.saveTasks(
            tasks.map((t) => (t.id === itemId ? { ...t, completed: true, completedAt: ts } : t)),
            true,
          );
        } else {
          await api.updateTask(itemId, { completed: true, completed_at: ts });
        }
      }
    } else if (
      (action.actionId === 'progress' || action.actionId === 'regress') &&
      itemType === 'task'
    ) {
      const delta = action.actionId === 'progress' ? 1 : -1;
      if (guest) {
        const tasks = storage.getTasks(true);
        const t = tasks.find((x) => x.id === itemId);
        if (!t || t.completed) return;
        const nextP = Math.min(t.target, Math.max(0, t.progress + delta));
        if (nextP === t.progress) return;
        storage.saveTasks(tasks.map((x) => (x.id === itemId ? { ...x, progress: nextP } : x)), true);
        await schedulePinNotificationShow('task', { ...t, progress: nextP });
      } else {
        const rows = await api.getTasks();
        const row = rows.find((r) => (r.id as string) === itemId) as Record<string, unknown> | undefined;
        if (!row || row.completed) return;
        const target = (row.target as number) ?? 1;
        const progress = (row.progress as number) ?? 0;
        const nextP = Math.min(target, Math.max(0, progress + delta));
        if (nextP === progress) return;
        await api.updateTask(itemId, { progress: nextP });
        await schedulePinNotificationShow('task', taskFromApiRow({ ...row, progress: nextP }));
      }
      notifyAndroidDataChanged();
      return;
    } else {
      return;
    }

    await dismissPinNotification(itemType, itemId);
    notifyAndroidDataChanged();
  } catch (e) {
    console.warn('NoteTasks notification action failed', e);
  }
}
