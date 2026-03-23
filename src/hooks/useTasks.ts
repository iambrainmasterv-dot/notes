import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuid } from 'uuid';
import type { Task } from '../types';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { storage } from '../storage';

function toApi(t: Task) {
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
    source_schedule_template_id: t.sourceScheduleTemplateId ?? null,
    source_occurrence_date: t.sourceOccurrenceDate ?? null,
  };
}

function fromApi(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    type: 'task',
    title: row.title as string,
    description: row.description as string,
    completed: row.completed as boolean,
    createdAt: row.created_at as string,
    deadline: (row.deadline as string) || undefined,
    target: row.target as number,
    progress: row.progress as number,
    daily: row.daily as boolean,
    sourceScheduleTemplateId: (row.source_schedule_template_id as string) || undefined,
    sourceOccurrenceDate: (row.source_occurrence_date as string) || undefined,
  };
}

export function useTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const loaded = useRef(false);

  useEffect(() => {
    if (!user) return;
    api.getTasks()
      .then((rows) => { setTasks(rows.map(fromApi)); loaded.current = true; })
      .catch(() => { setTasks(storage.getTasks()); loaded.current = true; });
  }, [user]);

  useEffect(() => {
    if (!loaded.current) return;
    storage.saveTasks(tasks);
  }, [tasks]);

  const addTask = useCallback(
    (data: Omit<Task, 'id' | 'type' | 'completed' | 'createdAt' | 'progress'>) => {
      const task: Task = {
        ...data,
        id: uuid(),
        type: 'task',
        completed: false,
        progress: 0,
        createdAt: new Date().toISOString(),
      };
      setTasks((prev) => [...prev, task]);
      api.createTask(toApi(task)).catch(() => {});
    },
    [],
  );

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    setTasks((prev) => prev.map((t) => (t.id !== id ? t : { ...t, ...patch })));

    const dbPatch: Record<string, unknown> = {};
    if (patch.title !== undefined) dbPatch.title = patch.title;
    if (patch.description !== undefined) dbPatch.description = patch.description;
    if (patch.completed !== undefined) dbPatch.completed = patch.completed;
    if (patch.deadline !== undefined) dbPatch.deadline = patch.deadline ?? null;
    if (patch.target !== undefined) dbPatch.target = patch.target;
    if (patch.progress !== undefined) dbPatch.progress = patch.progress;
    if (patch.daily !== undefined) dbPatch.daily = patch.daily;
    if (Object.keys(dbPatch).length) api.updateTask(id, dbPatch).catch(() => {});
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    api.deleteTask(id).catch(() => {});
  }, []);

  const completeTask = useCallback((id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: true } : t)));
    api.updateTask(id, { completed: true }).catch(() => {});
  }, []);

  const recoverTask = useCallback((id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: false } : t)));
    api.updateTask(id, { completed: false }).catch(() => {});
  }, []);

  return { tasks, addTask, updateTask, deleteTask, completeTask, recoverTask, setTasks };
}
