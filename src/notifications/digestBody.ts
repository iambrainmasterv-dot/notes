import type { Note, Task, ScheduleTemplate } from '../types';
import { templatesMatchingAppDay } from '../utils';

export function buildDigestBody(
  notes: Note[],
  tasks: Task[],
  scheduleTemplates: ScheduleTemplate[],
  dailyResetTime: string,
): string {
  const templatesToday = templatesMatchingAppDay(scheduleTemplates, dailyResetTime);
  const openTasks = tasks.filter((t) => !t.completed);
  const openNotes = notes.filter((n) => !n.completed);
  const lines: string[] = [];
  lines.push(`${templatesToday.length} schedule template(s) match your app day.`);
  lines.push(`${openTasks.length} open task(s), ${openNotes.length} open note(s).`);
  const preview = openTasks.slice(0, 5);
  if (preview.length) {
    lines.push('Tasks:');
    for (const t of preview) {
      lines.push(`• ${t.title}${t.target > 1 ? ` (${t.progress}/${t.target})` : ''}`);
    }
    if (openTasks.length > preview.length) lines.push('…');
  }
  return lines.join('\n');
}

/** Next fire time (local) for a daily digest at HH:mm. */
export function nextDigestFireAtMs(digestTime: string, fromNow: number): number {
  const parts = digestTime.split(':').map(Number);
  const h = parts[0] ?? 8;
  const m = parts[1] ?? 0;
  const d = new Date(fromNow);
  d.setSeconds(0, 0);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= fromNow) {
    d.setDate(d.getDate() + 1);
  }
  return d.getTime();
}
