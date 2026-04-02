import type { Note, Task } from '../types';
import { parseDeadline } from '../utils';

const STORAGE_KEY = 'notetasks.dismissedToastDedupe.v1';
const MAX_KEYS = 400;

/** Encoded deadline avoids `:` splitting issues in storage keys. */
export function deadlineToastDedupeKey(
  tier: '30m' | '10m',
  itemType: 'note' | 'task',
  itemId: string,
  deadline: string,
): string {
  const tag = tier === '30m' ? 'dm30' : 'dm10';
  return `${tag}:${itemType}:${itemId}:${encodeURIComponent(deadline)}`;
}

function parseDeadlineDedupeKey(key: string): { itemType: 'note' | 'task'; itemId: string; deadline: string } | null {
  const m = key.match(/^(dm30|dm10):(note|task):([^:]+):(.+)$/);
  if (!m) return null;
  try {
    return { itemType: m[2] as 'note' | 'task', itemId: m[3], deadline: decodeURIComponent(m[4]) };
  } catch {
    return null;
  }
}

function loadKeys(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    return Array.isArray(p) ? p.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveKeys(keys: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys.slice(-MAX_KEYS)));
  } catch {
    /* ignore */
  }
}

export function getDismissedToastDedupeKeys(): Set<string> {
  return new Set(loadKeys());
}

export function addDismissedToastDedupeKey(key: string): void {
  const next = loadKeys().filter((k) => k !== key);
  next.push(key);
  saveKeys(next);
}

/**
 * Drop dismissed keys that no longer apply (deadline passed, item gone, deadline changed, stale-completed cleared).
 */
export function pruneDismissedToastDedupeKeys(
  notes: Note[],
  tasks: Task[],
  now: number,
  staleTabNotificationActive: boolean,
): void {
  const staleOn = staleTabNotificationActive;
  const byId = new Map<string, Note | Task>();
  for (const n of notes) byId.set(`note:${n.id}`, n);
  for (const t of tasks) byId.set(`task:${t.id}`, t);

  const keys = loadKeys();
  const kept = keys.filter((key) => {
    if (key === 'stale-completed-tab') return staleOn;
    const parsed = parseDeadlineDedupeKey(key);
    if (!parsed) return false;
    const item = byId.get(`${parsed.itemType}:${parsed.itemId}`);
    if (!item || item.completed || item.deadline !== parsed.deadline) return false;
    try {
      const t = parseDeadline(parsed.deadline);
      return t > now;
    } catch {
      return false;
    }
  });
  if (kept.length !== keys.length) saveKeys(kept);
}
