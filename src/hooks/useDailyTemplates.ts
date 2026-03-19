import { useState, useCallback, useEffect } from 'react';
import { v4 as uuid } from 'uuid';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

export interface DailyTemplate {
  id: string;
  type: 'note' | 'task';
  title: string;
  description: string;
  deadlineTime: string | null;
  target: number;
  createdAt: string;
}

function fromApi(row: Record<string, unknown>): DailyTemplate {
  return {
    id: row.id as string,
    type: row.type as 'note' | 'task',
    title: row.title as string,
    description: row.description as string,
    deadlineTime: (row.deadline_time as string) || null,
    target: row.target as number,
    createdAt: row.created_at as string,
  };
}

export function useDailyTemplates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<DailyTemplate[]>([]);

  useEffect(() => {
    if (!user) return;
    api.getTemplates()
      .then((rows) => setTemplates(rows.map(fromApi)))
      .catch(() => {});
  }, [user]);

  const addTemplate = useCallback(
    async (data: Omit<DailyTemplate, 'id' | 'createdAt'>) => {
      const t: DailyTemplate = { ...data, id: uuid(), createdAt: new Date().toISOString() };
      setTemplates((prev) => [...prev, t]);
      api.createTemplate({
        id: t.id,
        type: t.type,
        title: t.title,
        description: t.description,
        deadline_time: t.deadlineTime,
        target: t.target,
        created_at: t.createdAt,
      }).catch(() => {});
      return t;
    },
    [],
  );

  const updateTemplate = useCallback(
    (id: string, patch: Partial<Omit<DailyTemplate, 'id' | 'createdAt'>>) => {
      setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      const dbPatch: Record<string, unknown> = {};
      if (patch.title !== undefined) dbPatch.title = patch.title;
      if (patch.description !== undefined) dbPatch.description = patch.description;
      if (patch.type !== undefined) dbPatch.type = patch.type;
      if (patch.deadlineTime !== undefined) dbPatch.deadline_time = patch.deadlineTime;
      if (patch.target !== undefined) dbPatch.target = patch.target;
      if (Object.keys(dbPatch).length) api.updateTemplate(id, dbPatch).catch(() => {});
    },
    [],
  );

  const deleteTemplate = useCallback(
    (id: string) => {
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      api.deleteTemplate(id).catch(() => {});
    },
    [],
  );

  return { templates, addTemplate, updateTemplate, deleteTemplate };
}
