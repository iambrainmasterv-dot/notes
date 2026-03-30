import { Capacitor, registerPlugin } from '@capacitor/core';
import { loadNotificationPins } from '../notifications/pinsStorage';
import { pinNotificationId } from '../notifications/notifIds';

export interface ShowOrUpdatePinOptions {
  id: number;
  /** Epoch ms for Notification.setWhen — stable across updates so shade order does not jump. */
  whenMs: number;
  title: string;
  body: string;
  channelId?: string;
  largeBody?: string;
  itemType: 'note' | 'task';
  itemId: string;
  actionTypeId: string;
}

export interface NotetasksPinNotificationsPlugin {
  showOrUpdate(options: ShowOrUpdatePinOptions): Promise<void>;
  cancel(options: { id: number }): Promise<void>;
}

export const NotetasksPinNotifications = registerPlugin<NotetasksPinNotificationsPlugin>(
  'NotetasksPinNotifications',
);

export function isAndroidNativePinPlugin(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/** Cancel every pinned notification id (native path). Call when turning notifications off. */
export async function cancelNativePin(itemType: 'note' | 'task', itemId: string): Promise<void> {
  if (!isAndroidNativePinPlugin()) return;
  try {
    await NotetasksPinNotifications.cancel({ id: pinNotificationId(itemType, itemId) });
  } catch {
    /* ignore */
  }
}

export async function cancelAllNativePinsFromStorage(): Promise<void> {
  if (!isAndroidNativePinPlugin()) return;
  const pins = loadNotificationPins();
  for (const mapKey of Object.keys(pins)) {
    const colon = mapKey.indexOf(':');
    if (colon < 1) continue;
    const itemType = mapKey.slice(0, colon) as 'note' | 'task';
    const itemId = mapKey.slice(colon + 1);
    if (itemType !== 'note' && itemType !== 'task') continue;
    await cancelNativePin(itemType, itemId);
  }
}
