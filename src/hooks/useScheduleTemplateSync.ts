import { useEffect, useRef, useCallback } from 'react';
import type { ScheduleTemplate, Note, Task, ParentType } from '../types';
import { api } from '../api/client';
import { templateMatchesOccurrence } from '../utils/scheduleTemplate';

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
  return templateMatchesOccurrence(
    {
      scheduleKind: template.scheduleKind,
      scheduleRules: template.scheduleRules,
      scheduleValue: template.scheduleValue,
    },
    dateStr,
  );
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
    const tpls = templatesRef.current;
    const tplSig = tpls.map((t) => `${t.id}:${t.scheduleKind}:${JSON.stringify(t.scheduleRules || {})}`).join('|');
    const syncKey = `${today}|${rt}|${tplSig}`;

    if (lastSyncRef.current === syncKey) return;
    lastSyncRef.current = syncKey;

    try {
      await api.cleanupOccurrence(yesterday);
    } catch {
      /* ignore */
    }
    for (const tpl of tpls) {
      if (matchesDay(tpl, today)) {
        try {
          await api.materializeScheduleTemplate(tpl.id, today);
        } catch {
          /* ignore */
        }
      }
    }

    try {
      const [rawNotes, rawTasks] = await Promise.all([api.getNotes(), api.getTasks()]);
      setNotes(rawNotes.map(noteFromApi));
      setTasks(rawTasks.map(taskFromApi));
    } catch {
      /* ignore */
    }
  }, [setNotes, setTasks]);

  useEffect(() => {
    void sync();
  }, [sync, lastResetTag, templates]);

  useEffect(() => {
    const id = setInterval(() => {
      void sync();
    }, 30_000);
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
    parentType: (raw.parent_type as ParentType) || undefined,
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
    parentId: (raw.parent_id as string) || undefined,
    parentType: (raw.parent_type as ParentType) || undefined,
    target: (raw.target as number) ?? 10,
    progress: (raw.progress as number) ?? 0,
    daily: Boolean(raw.daily),
    sourceScheduleTemplateId: (raw.source_schedule_template_id as string) || undefined,
    sourceOccurrenceDate: (raw.source_occurrence_date as string) || undefined,
  };
}

export { appDateStr };
