import { useCallback } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { storage } from '../storage';
import type { Note, Task } from '../types';
import { v4 as uuid } from 'uuid';

function noteToApi(n: Note) {
  return {
    id: n.id,
    title: n.title,
    description: n.description,
    completed: n.completed,
    created_at: n.createdAt,
    deadline: n.deadline ?? null,
    parent_id: n.parentId ?? null,
    parent_type: n.parentType ?? null,
    position_x: n.position?.x ?? null,
    position_y: n.position?.y ?? null,
    collapsed: n.collapsed ?? false,
    daily: n.daily ?? false,
    source_schedule_template_id: n.sourceScheduleTemplateId ?? null,
    source_occurrence_date: n.sourceOccurrenceDate ?? null,
  };
}

function taskToApi(t: Task) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    completed: t.completed,
    created_at: t.createdAt,
    deadline: t.deadline ?? null,
    target: t.target,
    progress: t.progress,
    daily: t.daily ?? false,
    parent_id: t.parentId ?? null,
    parent_type: t.parentType ?? null,
    source_schedule_template_id: t.sourceScheduleTemplateId ?? null,
    source_occurrence_date: t.sourceOccurrenceDate ?? null,
  };
}

export function useLocalImport() {
  const { user } = useAuth();

  const hasLocalData = useCallback(() => {
    const notes = storage.getNotes();
    const tasks = storage.getTasks();
    return notes.length > 0 || tasks.length > 0;
  }, []);

  const importLocalData = useCallback(async () => {
    if (!user) return;

    const notes = storage.getNotes();
    const tasks = storage.getTasks();
    const presets = storage.getPresets();

    await api.importData({
      notes: notes.map(noteToApi),
      tasks: tasks.map(taskToApi),
      presets: presets.map((p) => ({
        id: uuid(),
        name: p.name,
        items: p.items.map((it, i) => ({
          id: uuid(),
          type: it.type,
          title: it.title,
          description: it.description,
          deadline_time: it.deadline ?? null,
          target: it.target ?? null,
          sort_order: i,
        })),
      })),
    });

    localStorage.removeItem('notesapp_notes');
    localStorage.removeItem('notesapp_tasks');
    localStorage.removeItem('notesapp_presets');
    localStorage.removeItem('notesapp_last_reset_date');
  }, [user]);

  return { hasLocalData, importLocalData };
}
