const KEY = 'notetasks.notificationPins.v1';
const PIN_WHEN_KEY = 'notetasks.pinNotifWhen.v1';

export type PinMap = Record<string, boolean>;
type PinWhenMap = Record<string, number>;

function keyFor(itemType: 'note' | 'task', itemId: string): string {
  return `${itemType}:${itemId}`;
}

function loadPinWhenMap(): PinWhenMap {
  try {
    const raw = localStorage.getItem(PIN_WHEN_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Record<string, unknown>;
    const out: PinWhenMap = {};
    for (const [k, v] of Object.entries(p)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function savePinWhenMap(m: PinWhenMap): void {
  try {
    localStorage.setItem(PIN_WHEN_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

/** Stable Android notification ordering: anchor time set on first show, reused on updates. */
export function getOrCreatePinNotificationWhenMs(itemType: 'note' | 'task', itemId: string): number {
  const k = keyFor(itemType, itemId);
  const map = loadPinWhenMap();
  const existing = map[k];
  if (typeof existing === 'number' && Number.isFinite(existing)) return existing;
  const ms = Date.now();
  map[k] = ms;
  savePinWhenMap(map);
  return ms;
}

export function forgetPinNotificationWhen(itemType: 'note' | 'task', itemId: string): void {
  const k = keyFor(itemType, itemId);
  const map = loadPinWhenMap();
  if (!(k in map)) return;
  delete map[k];
  savePinWhenMap(map);
}

export function loadNotificationPins(): PinMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Record<string, unknown>;
    const out: PinMap = {};
    for (const [k, v] of Object.entries(p)) {
      if (v === true) out[k] = true;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveNotificationPins(map: PinMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function isPinned(itemType: 'note' | 'task', itemId: string): boolean {
  return !!loadNotificationPins()[keyFor(itemType, itemId)];
}

export function setPinned(itemType: 'note' | 'task', itemId: string, pinned: boolean): PinMap {
  const map = { ...loadNotificationPins() };
  const k = keyFor(itemType, itemId);
  if (pinned) map[k] = true;
  else {
    delete map[k];
    forgetPinNotificationWhen(itemType, itemId);
  }
  saveNotificationPins(map);
  return map;
}

export function togglePinned(itemType: 'note' | 'task', itemId: string): PinMap {
  const cur = isPinned(itemType, itemId);
  return setPinned(itemType, itemId, !cur);
}
