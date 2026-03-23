import { useEffect, useRef, useCallback } from 'react';
import type { ScheduleTemplate, Weekday } from '../types';
import type { Note, Task } from '../types';
import { api } from '../api/client';

const WEEKDAYS: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function appDate(resetTime: string): Date {
  const now = new Date();
  const [h, m] = (resetTime || '00:00').split(':').map(Number);
  const resetToday = new Date(now);
  resetToday.setHours(h, m, 0, 0);
  if (now < resetToday) {
    return new Date(now.getTime() - 86400000);
  }
  return now;
}

function appDateStr(resetTime: string): string {
  const d = appDate(resetTime);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function prevAppDateStr(resetTime: string): string {
  const d = appDate(resetTime);
  d.setDate(d.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function matchesDay(template: ScheduleTemplate, dateStr: string): boolean {
  if (template.scheduleKind === 'none') return false;
  if (template.scheduleKind === 'weekday') {
    const d = new Date(dateStr + 'T12:00:00');
    const weekday = WEEKDAYS[d.getDay()];
    return weekday === template.scheduleValue?.toLowerCase();
  }
  if (template.scheduleKind === 'date') {
    const mmdd = dateStr.slice(5); // "MM-DD"
    return mmdd === template.scheduleValue;
  }
  return false;
}

interface Params {
  dailyResetTime: string;
  lastResetTag: string | null;
  templates: ScheduleTemplate[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
}

export function useScheduleTemplateSync({ dailyResetTime, lastResetTag, templates, setNotes, setTasks }: Params) {
  const resetTimeRef = useRef(dailyResetTime);
  resetTimeRef.current = dailyResetTime;
  const templatesRef = useRef(templates);
  templatesRef.current = templates;
  const lastSyncRef = useRef<string | null>(null);

  const sync = useCallback(async () => {
    const rt = resetTimeRef.current;
    const today = appDateStr(rt);
    const yesterday = prevAppDateStr(rt);
    const syncKey = `${today}|${rt}`;

    if (lastSyncRef.current === syncKey) return;
    lastSyncRef.current = syncKey;

    // Cleanup: remove all items from yesterday's occurrence
    try {
      await api.cleanupOccurrence(yesterday);
      // Also remove them from local state
      setNotes((prev) => prev.filter((n) => {
        const raw = n as unknown as Record<string, unknown>;
        return !(raw.source_occurrence_date === yesterday || raw.sourceOccurrenceDate === yesterday);
      }));
      setTasks((prev) => prev.filter((t) => {
        const raw = t as unknown as Record<string, unknown>;
        return !(raw.source_occurrence_date === yesterday || raw.sourceOccurrenceDate === yesterday);
      }));
    } catch {
      // ignore cleanup errors
    }

    // Materialize: for each template that matches today
    const tpls = templatesRef.current;
    for (const tpl of tpls) {
      if (matchesDay(tpl, today)) {
        try {
          await api.materializeScheduleTemplate(tpl.id, today);
        } catch {
          // ignore
        }
      }
    }

    // Reload notes and tasks to get the new materialized rows
    try {
      const [rawNotes, rawTasks] = await Promise.all([api.getNotes(), api.getTasks()]);
      // We need the fromApi converters from useNotes/useTasks, but we can do a lightweight conversion here
      setNotes(rawNotes.map(noteFromApi));
      setTasks(rawTasks.map(taskFromApi));
    } catch {
      // ignore
    }
  }, [setNotes, setTasks]);

  // Run on mount and whenever lastResetTag changes (indicates a reset happened)
  useEffect(() => {
    sync();
  }, [sync, lastResetTag, templates]);

  // Also run on a 30s interval to catch time transitions
  useEffect(() => {
    const id = setInterval(sync, 30_000);
    return () => clearInterval(id);
  }, [sync]);
}

function noteFromApi(raw: Record<string, unknown>): Note {
  return {
    id: raw.id as string,
    type: 'note',
    title: (raw.title as string) || '',
    description: (raw.description as string) || '',
    completed: Boolean(raw.completed),
    createdAt: (raw.created_at as string) || new Date().toISOString(),
    deadline: (raw.deadline as string) || undefined,
    parentId: (raw.parent_id as string) || undefined,
    position: raw.position_x != null ? { x: raw.position_x as number, y: raw.position_y as number } : undefined,
    collapsed: Boolean(raw.collapsed),
    daily: Boolean(raw.daily),
    sourceScheduleTemplateId: (raw.source_schedule_template_id as string) || undefined,
    sourceOccurrenceDate: (raw.source_occurrence_date as string) || undefined,
  };
}

function taskFromApi(raw: Record<string, unknown>): Task {
  return {
    id: raw.id as string,
    type: 'task',
    title: (raw.title as string) || '',
    description: (raw.description as string) || '',
    completed: Boolean(raw.completed),
    createdAt: (raw.created_at as string) || new Date().toISOString(),
    deadline: (raw.deadline as string) || undefined,
    target: (raw.target as number) ?? 10,
    progress: (raw.progress as number) ?? 0,
    daily: Boolean(raw.daily),
    sourceScheduleTemplateId: (raw.source_schedule_template_id as string) || undefined,
    sourceOccurrenceDate: (raw.source_occurrence_date as string) || undefined,
  };
}

export { appDateStr };
