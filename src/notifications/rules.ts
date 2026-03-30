import type { Note, Task, NotificationLevel } from '../types';
import { parseDeadline } from '../utils';
import { formatDeadlineForNotification } from './deadlineFormat';

export const NOTIF_HOUR_MS = 60 * 60 * 1000;
export const NOTIF_DAY_MS = 24 * NOTIF_HOUR_MS;
export const NOTIF_6H_MS = 6 * NOTIF_HOUR_MS;
export const NOTIF_15MIN_MS = 15 * 60 * 1000;

export interface StaleCompletedInput {
  userId: string;
  completedCount: number;
  lastCompletedEmptyAtMs: number | null;
}

/** In-app / toast candidate when the user is currently inside the deadline warning window. */
export interface DeadlinePanelCandidate {
  dedupeKey: string;
  level: NotificationLevel;
  title: string;
  message: string;
  itemType: 'note' | 'task';
  itemId: string;
}

export function scanDeadlinePanelCandidates(notes: Note[], tasks: Task[], now: number): DeadlinePanelCandidate[] {
  const items: (Note | Task)[] = [
    ...notes.filter((n) => !n.completed && n.deadline),
    ...tasks.filter((t) => !t.completed && t.deadline),
  ];
  const out: DeadlinePanelCandidate[] = [];
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
    if (ms <= NOTIF_HOUR_MS) {
      out.push({
        dedupeKey: `${item.type}:${item.id}:1h`,
        level: 'danger',
        title: `${item.type === 'task' ? 'Task' : 'Note'} expiring very soon`,
        message: `"${item.title}" is due within about an hour.`,
        itemType: item.type,
        itemId: item.id,
      });
    } else if (ms <= NOTIF_DAY_MS) {
      out.push({
        dedupeKey: `${item.type}:${item.id}:24h`,
        level: 'warning',
        title: `${item.type === 'task' ? 'Task' : 'Note'} expiring soon`,
        message: `"${item.title}" is due within 24 hours.`,
        itemType: item.type,
        itemId: item.id,
      });
    }
  }
  return out;
}

export interface StaleCompletedPanelCandidate {
  dedupeKey: 'stale-completed-tab';
  level: NotificationLevel;
  title: string;
  message: string;
}

export function staleCompletedPanelCandidate(
  stale: StaleCompletedInput | null | undefined,
  now: number,
): StaleCompletedPanelCandidate | null {
  if (!stale?.userId) return null;
  const { completedCount, lastCompletedEmptyAtMs } = stale;
  if (completedCount <= 0 || lastCompletedEmptyAtMs == null) return null;
  if (now - lastCompletedEmptyAtMs < 3 * NOTIF_DAY_MS) return null;
  return {
    dedupeKey: 'stale-completed-tab',
    level: 'warning',
    title: 'Clear your Completed tab',
    message: `You have ${completedCount} completed item${completedCount === 1 ? '' : 's'} waiting. It has been over 3 days since the list was last empty — review, recover, or delete them to stay organized.`,
  };
}

/** Android: schedule at deadline − 24h, − 6h, − 1h, − 15m, and at deadline (each only if still in the future). */
export interface DeadlineScheduleSlot {
  stringId: string;
  atMs: number;
  title: string;
  body: string;
}

function deadlineReminderBody(title: string, deadline: string, windowPhrase: string): string {
  const q = `"${title}"`;
  const f = formatDeadlineForNotification(deadline);
  return f ? `${q} — Due ${f}. ${windowPhrase}` : `${q} ${windowPhrase}`;
}

function deadlineDueBody(title: string, deadline: string): string {
  const q = `"${title}"`;
  const f = formatDeadlineForNotification(deadline);
  return f ? `${q} is due now (Due ${f}).` : `${q} is due now.`;
}

export function buildDeadlineScheduleSlots(notes: Note[], tasks: Task[], now: number): DeadlineScheduleSlot[] {
  const items: (Note | Task)[] = [
    ...notes.filter((n) => !n.completed && n.deadline),
    ...tasks.filter((t) => !t.completed && t.deadline),
  ];
  const slots: DeadlineScheduleSlot[] = [];
  const label = (item: Note | Task) => (item.type === 'task' ? 'Task' : 'Note');

  for (const item of items) {
    const deadline = item.deadline!;
    let deadlineMs: number;
    try {
      deadlineMs = parseDeadline(deadline);
    } catch {
      continue;
    }
    if (deadlineMs <= now) continue;

    const at24 = deadlineMs - NOTIF_DAY_MS;
    if (at24 > now) {
      slots.push({
        stringId: `deadline:${item.type}:${item.id}:24h`,
        atMs: at24,
        title: `${label(item)} expiring soon`,
        body: deadlineReminderBody(item.title, deadline, 'Within about 24 hours.'),
      });
    }
    const at6 = deadlineMs - NOTIF_6H_MS;
    if (at6 > now) {
      slots.push({
        stringId: `deadline:${item.type}:${item.id}:6h`,
        atMs: at6,
        title: `${label(item)} due soon`,
        body: deadlineReminderBody(item.title, deadline, 'Within about 6 hours.'),
      });
    }
    const at1 = deadlineMs - NOTIF_HOUR_MS;
    if (at1 > now) {
      slots.push({
        stringId: `deadline:${item.type}:${item.id}:1h`,
        atMs: at1,
        title: `${label(item)} expiring very soon`,
        body: deadlineReminderBody(item.title, deadline, 'Within about an hour.'),
      });
    }
    const at15 = deadlineMs - NOTIF_15MIN_MS;
    if (at15 > now) {
      slots.push({
        stringId: `deadline:${item.type}:${item.id}:15m`,
        atMs: at15,
        title: `${label(item)} almost due`,
        body: deadlineReminderBody(item.title, deadline, 'Within about 15 minutes.'),
      });
    }
    slots.push({
      stringId: `deadline:${item.type}:${item.id}:due`,
      atMs: deadlineMs,
      title: `${label(item)} due`,
      body: deadlineDueBody(item.title, deadline),
    });
  }
  return slots;
}
