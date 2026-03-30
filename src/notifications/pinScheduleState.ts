import type { Note, Task } from '../types';
import { pinBody } from './pinContent';
import { pinActionTypeId } from './androidLocalNotifBootstrap';

export type PinRow = { itemType: 'note' | 'task'; itemId: string; item: Note | Task };

const lastSigByPinKey = new Map<string, string>();

export function pinItemKey(itemType: 'note' | 'task', itemId: string): string {
  return `${itemType}:${itemId}`;
}

function signatureFor(itemType: 'note' | 'task', item: Note | Task): string {
  return `${pinActionTypeId(itemType)}\u001e${item.title}\u001e${pinBody(item)}`;
}

/** Call when pin notification is removed so the next full sync can reschedule if re-pinned. */
export function forgetPinSignature(itemType: 'note' | 'task', itemId: string): void {
  lastSigByPinKey.delete(pinItemKey(itemType, itemId));
}

export function clearAllPinScheduleSignatures(): void {
  lastSigByPinKey.clear();
}

/** After showing/updating a pin outside diffPins (e.g. +1 action), keep cache in sync to avoid redundant reschedule. */
export function rememberPinnedItemDisplay(row: PinRow): void {
  lastSigByPinKey.set(pinItemKey(row.itemType, row.itemId), signatureFor(row.itemType, row.item));
}

/**
 * Pins whose title/body/actions changed (or newly pinned). Keys no longer pinned are dropped from cache
 * and returned for native cancel.
 */
export function diffPinsForReschedule(pinRows: PinRow[]): { toSchedule: PinRow[]; unpinnedKeys: string[] } {
  const desiredKeys = new Set(pinRows.map((r) => pinItemKey(r.itemType, r.itemId)));

  const unpinnedKeys: string[] = [];
  for (const key of lastSigByPinKey.keys()) {
    if (!desiredKeys.has(key)) {
      unpinnedKeys.push(key);
      lastSigByPinKey.delete(key);
    }
  }

  const toSchedule: PinRow[] = [];
  for (const row of pinRows) {
    const key = pinItemKey(row.itemType, row.itemId);
    const sig = signatureFor(row.itemType, row.item);
    if (lastSigByPinKey.get(key) === sig) continue;
    lastSigByPinKey.set(key, sig);
    toSchedule.push(row);
  }

  return { toSchedule, unpinnedKeys };
}

export function parsePinItemKey(key: string): { itemType: 'note' | 'task'; itemId: string } | null {
  const colon = key.indexOf(':');
  if (colon < 1) return null;
  const itemType = key.slice(0, colon) as 'note' | 'task';
  if (itemType !== 'note' && itemType !== 'task') return null;
  return { itemType, itemId: key.slice(colon + 1) };
}
