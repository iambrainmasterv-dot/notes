import type { Note, Task, NotificationLevel } from '../types';
import { parseDeadline } from '../utils';
import { formatDeadlineForNotification } from './deadlineFormat';
import { deadlineToastDedupeKey } from './toastDismissStorage';

export const NOTIF_HOUR_MS = 60 * 60 * 1000;
export const NOTIF_DAY_MS = 24 * NOTIF_HOUR_MS;
export const NOTIF_MINUTE_MS = 60 * 1000;

/** Default Android push reminder before deadline (minutes). */
export const DEFAULT_DEADLINE_REMINDER_MINUTES = 10;

export function effectiveReminderMinutesBefore(item: Note | Task): number {
  const v = item.reminderMinutesBefore;
  if (v === 0) return 0;
  if (v == null || !Number.isFinite(v)) return DEFAULT_DEADLINE_REMINDER_MINUTES;
  return Math.max(0, Math.min(7 * 24 * 60, Math.round(v)));
}

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

const DEADLINE_WARN_30M_MS = 30 * NOTIF_MINUTE_MS;
const DEADLINE_WARN_10M_MS = 10 * NOTIF_MINUTE_MS;

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
    const label = item.type === 'task' ? 'Task' : 'Note';
    if (ms <= DEADLINE_WARN_10M_MS) {
      out.push({
        dedupeKey: deadlineToastDedupeKey('10m', item.type, item.id, deadline),
        level: 'danger',
        title: `${label} due very soon`,
        message: `"${item.title}" has about 10 minutes left.`,
        itemType: item.type,
        itemId: item.id,
      });
    } else if (ms <= DEADLINE_WARN_30M_MS) {
      out.push({
        dedupeKey: deadlineToastDedupeKey('30m', item.type, item.id, deadline),
        level: 'warning',
        title: `${label} due soon`,
        message: `"${item.title}" has about 30 minutes left.`,
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

/** Android: schedule at deadline − reminder (per item, default 10m) and at deadline. */
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

    const mins = effectiveReminderMinutesBefore(item);
    if (mins > 0) {
      const atPre = deadlineMs - mins * NOTIF_MINUTE_MS;
      if (atPre > now) {
        const phrase =
          mins >= 60
            ? `In about ${mins >= 120 ? `${Math.round(mins / 60)} hours` : '1 hour'}.`
            : `In about ${mins} minutes.`;
        slots.push({
          stringId: `deadline:${item.type}:${item.id}:pre`,
          atMs: atPre,
          title: `${label(item)} reminder`,
          body: deadlineReminderBody(item.title, deadline, phrase),
        });
      }
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
