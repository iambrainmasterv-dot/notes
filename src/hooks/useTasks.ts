import { useState, useCallback, useEffect } from 'react';
import { v4 as uuid } from 'uuid';
import type { Task } from '../types';
import { storage } from '../storage';

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>(() => storage.getTasks());

  useEffect(() => {
    storage.saveTasks(tasks);
  }, [tasks]);

  const addTask = useCallback(
    (data: Omit<Task, 'id' | 'type' | 'completed' | 'createdAt' | 'progress'>) => {
      setTasks((prev) => [
        ...prev,
        {
          ...data,
          id: uuid(),
          type: 'task',
          completed: false,
          progress: 0,
          createdAt: new Date().toISOString(),
        },
      ]);
    },
    [],
  );

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        return { ...t, ...patch };
      }),
    );
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const completeTask = useCallback((id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: true } : t)));
  }, []);

  const recoverTask = useCallback((id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: false } : t)));
  }, []);

  return { tasks, addTask, updateTask, deleteTask, completeTask, recoverTask, setTasks };
}
