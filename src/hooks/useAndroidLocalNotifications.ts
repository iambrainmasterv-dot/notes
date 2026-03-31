import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Note, Task, ScheduleTemplate } from '../types';
import type { AndroidNotifUserSettings } from '../notifications/androidSettings';
import {
  buildDeadlineScheduleSlots,
  staleCompletedPanelCandidate,
  type StaleCompletedInput,
} from '../notifications/rules';
import { buildDigestBody, nextDigestFireAtMs } from '../notifications/digestBody';
import {
  DIGEST_NOTIFICATION_ID,
  OCCASIONAL_DIGEST_NOTIFICATION_ID,
  localNotificationNumericId,
  staleNativeNotificationId,
} from '../notifications/notifIds';
import { ANDROID_ALERTS_CHANNEL_ID } from '../notifications/androidNotifSound';
import {
  buildOccasionalDigestBody,
  loadOccasionalNextScheduledAt,
  nextOccasionalDigestFireAfterMs,
  occasionalDigestHasContent,
  saveOccasionalNextScheduledAt,
} from '../notifications/occasionalDigest';
import {
  loadNotificationPins,
  setPinned,
  getOrCreatePinNotificationWhenMs,
  forgetPinNotificationWhen,
} from '../notifications/pinsStorage';
import { pinNotificationId } from '../notifications/notifIds';
import { pinActionTypeId, ensureAndroidChannelsAndActions } from '../notifications/androidLocalNotifBootstrap';
import { pinBody, pinLargeBody } from '../notifications/pinLocalNotification';
import {
  diffPinsForReschedule,
  forgetPinSignature,
  parsePinItemKey,
  clearAllPinScheduleSignatures,
} from '../notifications/pinScheduleState';
import {
  NotetasksPinNotifications,
  cancelAllNativePinsFromStorage,
  cancelNativePin,
  isAndroidNativePinPlugin,
} from '../native/NotetasksPinNotifications';

const RESCHEDULE_DEBOUNCE_MS = 500;

function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

async function cancelOurPending(): Promise<void> {
  const { notifications } = await LocalNotifications.getPending();
  const ours = notifications.filter((n) => {
    const ex = n.extra as Record<string, unknown> | undefined;
    return ex?.notetasks === true;
  });
  if (ours.length === 0) return;
  await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
}

/** Cancels pending alarms for digest/deadlines/stale only — leaves pin timers intact to avoid wipe-the-shade flicker. */
async function cancelPendingNonPinNotifications(): Promise<void> {
  const { notifications } = await LocalNotifications.getPending();
  const toCancel = notifications.filter((n) => {
    const ex = n.extra as Record<string, unknown> | undefined;
    return ex?.notetasks === true && ex?.kind !== 'pin';
  });
  if (toCancel.length === 0) return;
  await LocalNotifications.cancel({ notifications: toCancel.map((n) => ({ id: n.id })) });
}

interface Params {
  notes: Note[];
  tasks: Task[];
  now: number;
  staleCompleted: StaleCompletedInput | null;
  userId: string | null;
  scheduleTemplates: ScheduleTemplate[];
  dailyResetTime: string;
  androidNotif: AndroidNotifUserSettings;
  /** Increment when user pins/unpins so we reschedule even if notes/tasks refs are unchanged. */
  pinsRevision: number;
}

async function rescheduleAll(ctx: Params): Promise<void> {
  const { notes, tasks, now, staleCompleted, userId, scheduleTemplates, dailyResetTime, androidNotif } = ctx;

  if (!androidNotif.masterEnabled) {
    saveOccasionalNextScheduledAt(null);
    clearAllPinScheduleSignatures();
    await cancelAllNativePinsFromStorage();
    await cancelOurPending();
    return;
  }

  await ensureAndroidChannelsAndActions();
  await cancelPendingNonPinNotifications();

  const toScheduleNonPins: {
    id: number;
    title: string;
    body: string;
    largeBody?: string;
    channelId: string;
    schedule: { at: Date; allowWhileIdle?: boolean };
    extra: Record<string, unknown>;
    ongoing?: boolean;
    actionTypeId?: string;
    autoCancel?: boolean;
  }[] = [];

  for (const slot of buildDeadlineScheduleSlots(notes, tasks, now)) {
    toScheduleNonPins.push({
      id: localNotificationNumericId('dl', slot.stringId),
      title: slot.title,
      body: slot.body,
      channelId: ANDROID_ALERTS_CHANNEL_ID,
      schedule: { at: new Date(slot.atMs), allowWhileIdle: true },
      extra: { notetasks: true, kind: 'deadline', stringId: slot.stringId },
    });
  }

  if (androidNotif.digestEnabled) {
    const at = nextDigestFireAtMs(androidNotif.digestTime, now);
    const body = buildDigestBody(notes, tasks, scheduleTemplates, dailyResetTime);
    toScheduleNonPins.push({
      id: DIGEST_NOTIFICATION_ID,
      title: 'NoteTasks — today',
      body,
      channelId: 'notetasks_digest',
      schedule: { at: new Date(at), allowWhileIdle: true },
      extra: { notetasks: true, kind: 'digest' },
    });
  }

  if (androidNotif.periodicDigestEnabled) {
    const graceMs = 15_000;
    let periodicAt = loadOccasionalNextScheduledAt();
    if (periodicAt == null || periodicAt <= now + graceMs) {
      periodicAt = nextOccasionalDigestFireAfterMs(now);
    }
    if (occasionalDigestHasContent(notes, tasks, scheduleTemplates, dailyResetTime, periodicAt)) {
      saveOccasionalNextScheduledAt(periodicAt);
      const fullBody = buildOccasionalDigestBody(notes, tasks, scheduleTemplates, dailyResetTime, periodicAt);
      const firstLine = fullBody.split('\n')[0] ?? 'NoteTasks';
      toScheduleNonPins.push({
        id: OCCASIONAL_DIGEST_NOTIFICATION_ID,
        title: 'NoteTasks — check-in',
        body: firstLine.length > 180 ? `${firstLine.slice(0, 177)}…` : firstLine,
        largeBody: fullBody.length > firstLine.length ? fullBody : undefined,
        channelId: ANDROID_ALERTS_CHANNEL_ID,
        schedule: { at: new Date(periodicAt), allowWhileIdle: true },
        extra: { notetasks: true, kind: 'periodic' },
      });
    } else {
      saveOccasionalNextScheduledAt(null);
    }
  } else {
    saveOccasionalNextScheduledAt(null);
  }

  const pins = loadNotificationPins();
  const pinRows: { itemType: 'note' | 'task'; itemId: string; item: Note | Task }[] = [];

  for (const mapKey of Object.keys(pins)) {
    const colon = mapKey.indexOf(':');
    if (colon < 1) continue;
    const itemType = mapKey.slice(0, colon) as 'note' | 'task';
    const itemId = mapKey.slice(colon + 1);
    if (itemType !== 'note' && itemType !== 'task') continue;

    const item =
      itemType === 'note' ? notes.find((n) => n.id === itemId) : tasks.find((t) => t.id === itemId);
    if (!item || item.completed) {
      setPinned(itemType, itemId, false);
      forgetPinSignature(itemType, itemId);
      try {
        if (isAndroidNativePinPlugin()) {
          await cancelNativePin(itemType, itemId);
        } else {
          const pid = pinNotificationId(itemType, itemId);
          await LocalNotifications.cancel({ notifications: [{ id: pid }] });
          await LocalNotifications.removeDeliveredNotifications({
            notifications: [{ id: pid, title: '', body: '' }],
          });
        }
      } catch {
        /* ignore */
      }
      continue;
    }

    pinRows.push({ itemType, itemId, item });
  }

  const { toSchedule: pinsToRefresh, unpinnedKeys } = diffPinsForReschedule(pinRows);
  for (const key of unpinnedKeys) {
    const parsed = parsePinItemKey(key);
    if (!parsed) continue;
    forgetPinNotificationWhen(parsed.itemType, parsed.itemId);
    try {
      if (isAndroidNativePinPlugin()) {
        await cancelNativePin(parsed.itemType, parsed.itemId);
      } else {
        const pid = pinNotificationId(parsed.itemType, parsed.itemId);
        await LocalNotifications.cancel({ notifications: [{ id: pid }] });
        await LocalNotifications.removeDeliveredNotifications({
          notifications: [{ id: pid, title: '', body: '' }],
        });
      }
    } catch {
      /* ignore */
    }
  }

  const stale = staleCompletedPanelCandidate(staleCompleted, now);
  const staleKey = userId ? `notetasks.androidStaleNativeFired.${userId}` : null;
  if (staleKey && staleCompleted?.completedCount === 0) {
    try {
      localStorage.removeItem(staleKey);
    } catch {
      /* ignore */
    }
  }

  let staleKeyToMark: string | null = null;
  if (stale && staleKey && userId) {
    let already: string | null = null;
    try {
      already = localStorage.getItem(staleKey);
    } catch {
      /* ignore */
    }
    if (!already) {
      toScheduleNonPins.push({
        id: staleNativeNotificationId(userId),
        title: stale.title,
        body: stale.message,
        channelId: ANDROID_ALERTS_CHANNEL_ID,
        schedule: { at: new Date(Date.now() + 800), allowWhileIdle: true },
        extra: { notetasks: true, kind: 'stale' },
      });
      staleKeyToMark = staleKey;
    }
  }

  if (toScheduleNonPins.length === 0 && pinsToRefresh.length === 0) return;

  if (toScheduleNonPins.length > 0) {
    await LocalNotifications.schedule({
      notifications: toScheduleNonPins.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        ...(n.largeBody ? { largeBody: n.largeBody } : {}),
        channelId: n.channelId,
        schedule: n.schedule,
        extra: n.extra,
        ongoing: n.ongoing,
        actionTypeId: n.actionTypeId,
        autoCancel: n.autoCancel,
      })),
    });
  }

  if (isAndroidNativePinPlugin()) {
    for (const { itemType, itemId, item } of pinsToRefresh) {
      const lb = pinLargeBody(item);
      const whenMs = getOrCreatePinNotificationWhenMs(itemType, itemId);
      try {
        await NotetasksPinNotifications.showOrUpdate({
          id: pinNotificationId(itemType, itemId),
          whenMs,
          title: item.title,
          body: pinBody(item),
          channelId: 'notetasks_pins',
          ...(lb ? { largeBody: lb } : {}),
          itemType,
          itemId,
          actionTypeId: pinActionTypeId(itemType),
        });
      } catch {
        /* plugin missing on old APK — ignore */
      }
    }
  }

  if (staleKeyToMark) {
    try {
      localStorage.setItem(staleKeyToMark, '1');
    } catch {
      /* ignore */
    }
  }
}

/**
 * Android: sync local notifications with notes/tasks and settings. No-op on web/iOS.
 */
export function useAndroidLocalNotifications(params: Params): void {
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const lastPinsRevision = useRef<number | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rescheduleDidRunOnce = useRef(false);

  useEffect(() => {
    if (!isAndroidNative()) return;

    let alive = true;
    (async () => {
      const perm = await LocalNotifications.requestPermissions();
      if (!alive) return;
      if (perm.display !== 'granted') return;
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!isAndroidNative()) return;

    const pinOnlyBump =
      lastPinsRevision.current !== null && params.pinsRevision !== lastPinsRevision.current;
    lastPinsRevision.current = params.pinsRevision;

    const run = () => {
      void (async () => {
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display !== 'granted') return;
        await rescheduleAll(paramsRef.current);
      })();
    };

    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (pinOnlyBump || !rescheduleDidRunOnce.current) {
      rescheduleDidRunOnce.current = true;
      run();
    } else {
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        run();
      }, RESCHEDULE_DEBOUNCE_MS);
    }

    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [
    params.notes,
    params.tasks,
    params.now,
    params.staleCompleted,
    params.userId,
    params.scheduleTemplates,
    params.dailyResetTime,
    params.androidNotif.masterEnabled,
    params.androidNotif.digestEnabled,
    params.androidNotif.digestTime,
    params.androidNotif.periodicDigestEnabled,
    params.pinsRevision,
  ]);

  useEffect(() => {
    if (!isAndroidNative()) return;

    let remove: (() => Promise<void>) | undefined;
    void App.addListener('appStateChange', async ({ isActive }) => {
      if (!isActive) return;
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') return;
      await rescheduleAll(paramsRef.current);
    }).then((handle) => {
      remove = () => handle.remove();
    });

    return () => {
      void remove?.();
    };
  }, []);
}
