import type { DeadlineState, Note, Task, ScheduleTemplate, Weekday, ParentType, Item } from './types';

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

export type ItemParentRef = { type: ParentType; id: string };

/** Legacy rows: note.parentId without parentType implies parent is a note. */
export function effectiveNoteParentType(n: Note): ParentType | undefined {
  if (!n.parentId) return undefined;
  return n.parentType ?? 'note';
}

/** Legacy tasks may omit parent_type when parent was a note. */
export function effectiveTaskParentType(t: Task): ParentType | undefined {
  if (!t.parentId) return undefined;
  return t.parentType ?? 'note';
}

export function childrenOf(
  parent: ItemParentRef,
  notes: Note[],
  tasks: Task[],
): { childNotes: Note[]; childTasks: Task[] } {
  const childNotes = notes.filter((n) => {
    if (n.parentId !== parent.id) return false;
    return effectiveNoteParentType(n) === parent.type;
  });
  const childTasks = tasks.filter((t) => {
    if (t.parentId !== parent.id) return false;
    return effectiveTaskParentType(t) === parent.type;
  });
  return { childNotes, childTasks };
}

/** Descendants only (excludes root). */
export function collectDescendantIds(
  rootType: ParentType,
  rootId: string,
  notes: Note[],
  tasks: Task[],
): { noteIds: string[]; taskIds: string[] } {
  const seenN = new Set<string>();
  const seenT = new Set<string>();
  const stack: ItemParentRef[] = [{ type: rootType, id: rootId }];
  while (stack.length) {
    const ref = stack.pop()!;
    const { childNotes, childTasks } = childrenOf(ref, notes, tasks);
    for (const n of childNotes) {
      if (seenN.has(n.id)) continue;
      seenN.add(n.id);
      stack.push({ type: 'note', id: n.id });
    }
    for (const t of childTasks) {
      if (seenT.has(t.id)) continue;
      seenT.add(t.id);
      stack.push({ type: 'task', id: t.id });
    }
  }
  return { noteIds: [...seenN], taskIds: [...seenT] };
}

/** Self + all descendant ids (notes and tasks), for parent picker blocking. */
export function collectDescendantNoteIds(rootId: string, allNotes: Note[], allTasks: Task[] = []): Set<string> {
  const { noteIds, taskIds } = collectDescendantIds('note', rootId, allNotes, allTasks);
  return new Set([rootId, ...noteIds, ...taskIds]);
}

export function collectBlockedIdsForReparent(
  rootType: ParentType,
  rootId: string,
  notes: Note[],
  tasks: Task[],
): Set<string> {
  const { noteIds, taskIds } = collectDescendantIds(rootType, rootId, notes, tasks);
  return new Set([rootId, ...noteIds, ...taskIds]);
}

export interface ParentPickerOption {
  value: string;
  kind: ParentType;
  id: string;
  depth: number;
  label: string;
}

function parentDepthLabel(kind: ParentType, depth: number): string {
  if (kind === 'note') {
    if (depth <= 0) return 'Root (note)';
    if (depth === 1) return 'Subnote';
    return `Subnote (${depth})`;
  }
  if (depth <= 0) return 'Root (task)';
  if (depth === 1) return 'Subtask';
  return `Subtask (${depth})`;
}

function byTitle(a: { title: string }, b: { title: string }) {
  return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
}

function isRootNote(n: Note): boolean {
  return !n.parentId;
}

function isRootTask(t: Task): boolean {
  return !t.parentId;
}

export function buildParentPickerOptions(
  notes: Note[],
  tasks: Task[],
  opts: {
    excludeIds?: Set<string>;
    dailyOnly?: boolean;
  } = {},
): ParentPickerOption[] {
  const exclude = opts.excludeIds ?? new Set<string>();
  const dailyOnly = opts.dailyOnly ?? false;

  const noteOk = (n: Note) => !exclude.has(n.id) && (!dailyOnly || n.daily);
  const taskOk = (t: Task) => !exclude.has(t.id) && (!dailyOnly || t.daily);

  const out: ParentPickerOption[] = [];

  const walk = (item: Note | Task, depth: number) => {
    if (item.type === 'note') {
      const n = item as Note;
      if (!noteOk(n)) return;
      out.push({
        value: `note:${n.id}`,
        kind: 'note',
        id: n.id,
        depth,
        label: `${parentDepthLabel('note', depth)} — ${n.title}`,
      });
      const ref: ItemParentRef = { type: 'note', id: n.id };
      const { childNotes, childTasks } = childrenOf(ref, notes, tasks);
      [...childNotes].sort(byTitle).forEach((ch) => walk(ch, depth + 1));
      [...childTasks].sort(byTitle).forEach((ch) => walk(ch, depth + 1));
    } else {
      const t = item as Task;
      if (!taskOk(t)) return;
      out.push({
        value: `task:${t.id}`,
        kind: 'task',
        id: t.id,
        depth,
        label: `${parentDepthLabel('task', depth)} — ${t.title}`,
      });
      const ref: ItemParentRef = { type: 'task', id: t.id };
      const { childNotes, childTasks } = childrenOf(ref, notes, tasks);
      [...childNotes].sort(byTitle).forEach((ch) => walk(ch, depth + 1));
      [...childTasks].sort(byTitle).forEach((ch) => walk(ch, depth + 1));
    }
  };

  [...notes.filter((n) => isRootNote(n) && noteOk(n))].sort(byTitle).forEach((n) => walk(n, 0));
  [...tasks.filter((t) => isRootTask(t) && taskOk(t))].sort(byTitle).forEach((t) => walk(t, 0));

  return out;
}

export function parseParentPickerValue(raw: string): { type: ParentType; id: string } | null {
  const m = raw.match(/^(note|task):(.+)$/);
  if (!m) return null;
  return { type: m[1] as ParentType, id: m[2] };
}

export function parentTitleForItem(
  notes: Note[],
  tasks: Task[],
  parentId?: string,
  parentType?: ParentType,
): string | undefined {
  if (!parentId) return undefined;
  const pt = parentType ?? 'note';
  if (pt === 'note') return notes.find((n) => n.id === parentId)?.title;
  return tasks.find((t) => t.id === parentId)?.title;
}

/** In a flat filtered list, show an item as its own card only if its parent is not also in the list. */
export function itemShownAsRootInFiltered(item: Item, filteredIds: Set<string>): boolean {
  if (item.type === 'note') {
    const n = item as Note;
    if (!n.parentId) return true;
    return !filteredIds.has(n.parentId);
  }
  const t = item as Task;
  if (!t.parentId) return true;
  return !filteredIds.has(t.parentId);
}

/** @deprecated use itemShownAsRootInFiltered */
export function noteShownAsRootInFiltered(note: Note, filteredIds: Set<string>): boolean {
  return itemShownAsRootInFiltered(note, filteredIds);
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

/** Set for the rest of the browser session after tutorial completes; welcome greeting shows next session. */
export function greetingSuppressUntilNextSessionAfterTutorialKey(userId: string): string {
  return `notetasks.greetingSuppressAfterTutorial.${userId}`;
}

export function completedLastEmptyStorageKey(userId: string): string {
  return `notetasks.completedLastEmptyAt.${userId}`;
}

export function tutorialCompletedStorageKey(userId: string): string {
  return `notetasks.tutorialCompleted.${userId}`;
}
