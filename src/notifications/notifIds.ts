/** Stable 32-bit positive notification ids for Android. */
export function localNotificationNumericId(domain: string, key: string): number {
  const s = `${domain}:${key}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const x = h % 2000000000;
  return x + 1;
}

/** Single id for digest one-shot (rescheduled on each sync). */
export const DIGEST_NOTIFICATION_ID = 1_847_100_201;

export function staleNativeNotificationId(userId: string): number {
  return localNotificationNumericId('staleNative', userId);
}

export function pinNotificationId(itemType: 'note' | 'task', itemId: string): number {
  return localNotificationNumericId('pin', `${itemType}:${itemId}`);
}
