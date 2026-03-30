import { LocalNotifications } from '@capacitor/local-notifications';
import type { Note, Task } from '../types';
import { pinNotificationId } from './notifIds';
import { pinActionTypeId, ensureAndroidChannelsAndActions } from './androidLocalNotifBootstrap';
import { pinBody, pinLargeBody } from './pinContent';
import { rememberPinnedItemDisplay } from './pinScheduleState';
import { isAndroidNativePinPlugin, NotetasksPinNotifications } from '../native/NotetasksPinNotifications';
import { getOrCreatePinNotificationWhenMs } from './pinsStorage';

export { pinBody, pinLargeBody } from './pinContent';

/** Capacitor Android rejects schedule when at <= now; keep a safe margin (non-native path only). */
const PIN_FIRE_AFTER_MS = 100;

/**
 * Show or refresh a pinned-item notification. Used after +1/-1: native Capacitor path dismisses
 * on action tap; we repost immediately. On Android uses in-place NotetasksPinNotifications (no flicker).
 */
export async function schedulePinNotificationShow(itemType: 'note' | 'task', item: Note | Task): Promise<void> {
  const itemId = item.id;
  await ensureAndroidChannelsAndActions();
  if (isAndroidNativePinPlugin()) {
    const lb = pinLargeBody(item);
    const whenMs = getOrCreatePinNotificationWhenMs(itemType, itemId);
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
    rememberPinnedItemDisplay({ itemType, itemId, item });
    return;
  }

  const at = Date.now() + PIN_FIRE_AFTER_MS;
  const largeBody = pinLargeBody(item);
  await LocalNotifications.schedule({
    notifications: [
      {
        id: pinNotificationId(itemType, itemId),
        title: item.title,
        body: pinBody(item),
        ...(largeBody ? { largeBody } : {}),
        channelId: 'notetasks_pins',
        schedule: { at: new Date(at), allowWhileIdle: true },
        extra: { notetasks: true, kind: 'pin', itemType, itemId },
        ongoing: true,
        actionTypeId: pinActionTypeId(itemType),
        autoCancel: false,
      },
    ],
  });
  rememberPinnedItemDisplay({ itemType, itemId, item });
}
