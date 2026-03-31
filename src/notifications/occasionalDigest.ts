import type { Note, Task, ScheduleTemplate } from '../types';
import {
  getDeadlineState,
  parseDeadlineAt,
  scheduleTemplateMatchesDate,
  appCalendarDateStrForInstant,
  appCalendarTomorrowStrForInstant,
} from '../utils';

const TWO_H_MS = 2 * 60 * 60 * 1000;

const STORAGE_KEY = 'notetasks.androidOccasionalNextAt.v1';

function localYmdFromMs(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function deadlineLocalYmd(deadline: string, atMs: number): string {
  return localYmdFromMs(parseDeadlineAt(deadline, atMs));
}

function itemDueOnAppDay(item: Note | Task, resetTime: string, atMs: number): boolean {
  if (!item.deadline || item.completed) return false;
  const todayStr = appCalendarDateStrForInstant(resetTime, atMs);
  try {
    return deadlineLocalYmd(item.deadline, atMs) === todayStr;
  } catch {
    return false;
  }
}

export function isQuietHoursLocal(atMs: number): boolean {
  const h = new Date(atMs).getHours();
  return h >= 22 || h < 8;
}

/** Next fire at least ~2h after `fromMs`, skipping 22:00–08:00 local. */
export function nextOccasionalDigestFireAfterMs(fromMs: number): number {
  let t = fromMs + TWO_H_MS;
  let guard = 0;
  while (isQuietHoursLocal(t) && guard < 48) {
    guard += 1;
    const d = new Date(t);
    if (d.getHours() < 8) {
      d.setHours(8, 0, 0, 0);
    } else {
      d.setDate(d.getDate() + 1);
      d.setHours(8, 0, 0, 0);
    }
    t = d.getTime();
  }
  return t;
}

export function loadOccasionalNextScheduledAt(): number | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function saveOccasionalNextScheduledAt(ms: number | null): void {
  try {
    if (ms == null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(ms));
  } catch {
    /* ignore */
  }
}

function dueTodayItems(notes: Note[], tasks: Task[], resetTime: string, atMs: number): (Note | Task)[] {
  return [
    ...notes.filter((n) => itemDueOnAppDay(n, resetTime, atMs)),
    ...tasks.filter((t) => itemDueOnAppDay(t, resetTime, atMs)),
  ];
}

function dailyProgressItems(notes: Note[], tasks: Task[], resetTime: string, atMs: number): (Note | Task)[] {
  const todayStr = appCalendarDateStrForInstant(resetTime, atMs);
  const match = (x: Note | Task) => {
    if (!x.daily || x.completed) return false;
    if (!x.sourceOccurrenceDate) return true;
    return x.sourceOccurrenceDate === todayStr;
  };
  return [...notes.filter(match), ...tasks.filter(match)];
}

function templatesTomorrow(templates: ScheduleTemplate[], resetTime: string, atMs: number): ScheduleTemplate[] {
  const tom = appCalendarTomorrowStrForInstant(resetTime, atMs);
  return templates.filter((t) => scheduleTemplateMatchesDate(t, tom));
}

export function occasionalDigestHasContent(
  notes: Note[],
  tasks: Task[],
  templates: ScheduleTemplate[],
  resetTime: string,
  atMs: number,
): boolean {
  return (
    dueTodayItems(notes, tasks, resetTime, atMs).length > 0 ||
    dailyProgressItems(notes, tasks, resetTime, atMs).length > 0 ||
    templatesTomorrow(templates, resetTime, atMs).length > 0
  );
}

export function buildOccasionalDigestBody(
  notes: Note[],
  tasks: Task[],
  templates: ScheduleTemplate[],
  resetTime: string,
  atMs: number,
): string {
  const lines: string[] = [];

  const due = dueTodayItems(notes, tasks, resetTime, atMs);
  if (due.length) {
    lines.push('Due today:');
    for (const it of due.slice(0, 8)) {
      const kind = it.type === 'task' ? 'Task' : 'Note';
      let extra = '';
      try {
        const st = getDeadlineState(it.deadline!, atMs);
        extra = st.expired ? ' — overdue' : ` — ${st.label} left`;
      } catch {
        extra = '';
      }
      lines.push(`• ${kind}: "${it.title}"${extra}`);
    }
    if (due.length > 8) lines.push(`… +${due.length - 8} more`);
  }

  const daily = dailyProgressItems(notes, tasks, resetTime, atMs);
  if (daily.length) {
    lines.push('Daily progress today:');
    for (const it of daily.slice(0, 8)) {
      if (it.type === 'task') {
        const t = it as Task;
        lines.push(`• Task "${t.title}" — ${t.progress}/${t.target}`);
      } else {
        lines.push(`• Note "${it.title}"`);
      }
    }
    if (daily.length > 8) lines.push(`… +${daily.length - 8} more`);
  }

  const tomTemplates = templatesTomorrow(templates, resetTime, atMs);
  if (tomTemplates.length) {
    lines.push('Tomorrow schedule templates:');
    for (const tpl of tomTemplates.slice(0, 6)) {
      lines.push(`• ${tpl.name} (${tpl.items.length} item${tpl.items.length === 1 ? '' : 's'})`);
    }
    if (tomTemplates.length > 6) lines.push(`… +${tomTemplates.length - 6} more`);
  }

  return lines.join('\n');
}
