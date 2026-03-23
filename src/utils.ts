import type { DeadlineState, Note, Task, ScheduleTemplate, Weekday } from './types';

const WEEKDAYS: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const TIME_ONLY_RE = /^\d{2}:\d{2}$/;

/**
 * Parses a deadline string into a timestamp.
 * Handles ISO strings, local "YYYY-MM-DDTHH:mm", and time-only "HH:mm" (resolved to today).
 */
export function parseDeadline(deadline: string): number {
  if (TIME_ONLY_RE.test(deadline)) {
    const today = new Date();
    const [h, m] = deadline.split(':').map(Number);
    today.setHours(h, m, 0, 0);
    return today.getTime();
  }
  return new Date(deadline).getTime();
}

export function isTimeOnly(deadline?: string): boolean {
  return !!deadline && TIME_ONLY_RE.test(deadline);
}

/**
 * Returns a structured state object for a deadline.
 */
export function getDeadlineState(deadline: string, now: number): DeadlineState {
  const diff = parseDeadline(deadline) - now;

  if (diff <= 0) {
    return { label: 'Expired', expired: true, severity: 'expired' };
  }

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let label: string;
  if (seconds < 60) {
    label = `${seconds}s`;
  } else if (minutes < 60) {
    label = `${minutes}m`;
  } else if (hours < 24) {
    const rm = minutes % 60;
    label = rm > 0 ? `${hours}h ${rm}m` : `${hours}h`;
  } else {
    const rh = hours % 24;
    label = rh > 0 ? `${days}d ${rh}h` : `${days}d`;
  }

  let severity: DeadlineState['severity'];
  if (hours < 1) severity = 'urgent';
  else if (hours < 24) severity = 'soon';
  else severity = 'ok';

  return { label, expired: false, severity };
}

export function isExpired(deadline?: string, now?: number): boolean {
  if (!deadline) return false;
  return parseDeadline(deadline) < (now ?? Date.now());
}

export function nextCanvasPosition(existingCount: number): { x: number; y: number } {
  const cols = 3;
  const col = existingCount % cols;
  const row = Math.floor(existingCount / cols);
  return { x: 40 + col * 310, y: 40 + row * 230 };
}

export function toLocalInputValue(deadline: string): string {
  if (TIME_ONLY_RE.test(deadline)) return deadline;
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function todayDateStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** IDs of note and all nested subnotes (for parent picker validation). */
export function collectDescendantNoteIds(rootId: string, allNotes: Note[]): Set<string> {
  const out = new Set<string>();
  const walk = (id: string) => {
    out.add(id);
    allNotes.filter((n) => n.parentId === id).forEach((ch) => walk(ch.id));
  };
  walk(rootId);
  return out;
}

/** Card/list row CSS classes for visual origin (template > daily > regular). */
export function itemOriginCardClass(daily?: boolean, fromTemplate?: boolean): string {
  if (fromTemplate) return 'card-origin-template';
  if (daily) return 'card-origin-daily';
  return 'card-origin-regular';
}

export function itemOriginRowClass(daily?: boolean, fromTemplate?: boolean): string {
  if (fromTemplate) return 'row-origin-template';
  if (daily) return 'row-origin-daily';
  return 'row-origin-regular';
}

/** “App day” after daily reset boundary (same idea as schedule template sync). */
export function appCalendarDate(resetTime: string): Date {
  const now = new Date();
  const [h, m] = (resetTime || '00:00').split(':').map(Number);
  const resetToday = new Date(now);
  resetToday.setHours(h, m, 0, 0);
  if (now < resetToday) {
    return new Date(now.getTime() - 86400000);
  }
  return now;
}

export function appCalendarDateStr(resetTime: string): string {
  const d = appCalendarDate(resetTime);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function scheduleTemplateMatchesDate(template: ScheduleTemplate, dateStrYMD: string): boolean {
  if (template.scheduleKind === 'none') return false;
  if (template.scheduleKind === 'weekday') {
    const d = new Date(`${dateStrYMD}T12:00:00`);
    const weekday = WEEKDAYS[d.getDay()];
    return weekday === template.scheduleValue?.toLowerCase();
  }
  if (template.scheduleKind === 'date') {
    const mmdd = dateStrYMD.slice(5);
    return mmdd === template.scheduleValue;
  }
  return false;
}

export function templatesMatchingAppDay(templates: ScheduleTemplate[], resetTime: string): ScheduleTemplate[] {
  const today = appCalendarDateStr(resetTime);
  return templates.filter((t) => scheduleTemplateMatchesDate(t, today));
}

export function countActiveExpiredItems(notes: Note[], tasks: Task[], now: number): number {
  let n = 0;
  for (const note of notes) {
    if (!note.completed && isExpired(note.deadline, now)) n += 1;
  }
  for (const task of tasks) {
    if (!task.completed && isExpired(task.deadline, now)) n += 1;
  }
  return n;
}

export function formatLongDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

/** Message when last visit was at least `minDays` ago; otherwise null. */
export function lastVisitAbsenceLine(lastVisitAtMs: number | null, nowMs: number, minDays = 1): string | null {
  if (lastVisitAtMs == null || !Number.isFinite(lastVisitAtMs)) return null;
  const days = Math.floor((nowMs - lastVisitAtMs) / 86400000);
  if (days < minDays) return null;
  if (days === 1) return "It's been over a day since your last visit.";
  return `It's been ${days} days since your last visit.`;
}

export function lastVisitStorageKey(userId: string): string {
  return `notetasks.lastVisitAt.${userId}`;
}

export function greetingDismissedSessionKey(userId: string): string {
  return `notetasks.greetingDismissed.${userId}`;
}

/** In a flat filtered list, show a note as its own card only if its parent is not also in the list. */
export function noteShownAsRootInFiltered(note: Note, filteredIds: Set<string>): boolean {
  if (!note.parentId) return true;
  return !filteredIds.has(note.parentId);
}
